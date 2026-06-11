/* ═══════════════════════════════════════════════════════════════
   EXPORT VIDEO — orchestrates audio + video offline rendering and
   muxes them into a single seamless-looping WebM (VP9 + Opus).

   Strategy: render TWO loop iterations of audio and video, then take
   only the second iteration as the output. The first iteration acts
   as a "previous loop" so audio decay tails and animation residuals
   are naturally present at the start of the output, making it loop
   without a visible/audible seam.

   Requires WebCodecs (VideoEncoder / AudioEncoder / VideoFrame /
   AudioData) and the `webm-muxer` library (loaded as WebMMuxer).
   Falls back gracefully via TR.exportVideoAvailable.
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {

TR.exportVideoAvailable = function() {
  return typeof VideoEncoder !== 'undefined'
      && typeof AudioEncoder !== 'undefined'
      && typeof VideoFrame   !== 'undefined'
      && typeof AudioData    !== 'undefined'
      && typeof WebMMuxer    !== 'undefined';
};

/* ── Cancellation. Only one export runs at a time, tracked through
   `currentToken`. Set `aborted=true` to ask the in-flight render to
   bail out at its next await point — the audio render itself can't be
   interrupted (OfflineAudioContext has no cancel API), so cancellation
   takes effect on the very next phase boundary. The cancelled signal
   itself is the shared TR.cancelError / TR.checkCancel. ── */
var currentToken = null;
TR.exportInProgress = function() { return !!currentToken; };
TR.cancelExport = function() { if (currentToken) currentToken.aborted = true; };

/* ── Video: render the second iteration's frames into VideoEncoder. ── */
async function renderVideoFrames(videoEncoder, doubleSchedule, loopDur, w, h, fps, onProgress, token, mode) {
  var offCanvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : (function() { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
  var offCtx = offCanvas.getContext('2d');

  var totalFrames = Math.round(loopDur * fps);
  var keyEvery = Math.max(1, Math.round(fps * 2));  // keyframe every ~2 seconds
  for (var i = 0; i < totalFrames; i++) {
    TR.checkCancel(token);
    var t = loopDur + i / fps;
    // renderFrame may be sync (flower) or async (clip); await handles both.
    await mode.renderFrame(offCtx, w, h, t, doubleSchedule);

    // Backpressure: don't let the encoder queue grow unbounded.
    while (videoEncoder.encodeQueueSize > 8) {
      await new Promise(function(r) { setTimeout(r, 0); });
      TR.checkCancel(token);
    }

    var frame = new VideoFrame(offCanvas, { timestamp: Math.round(i * 1e6 / fps) });
    videoEncoder.encode(frame, { keyFrame: i === 0 || (i % keyEvery === 0) });
    frame.close();

    if (onProgress && (i % 5 === 0 || i === totalFrames - 1)) {
      onProgress((i + 1) / totalFrames);
    }
  }
  await videoEncoder.flush();
}

/* ── Encode the second loop iteration of the audio buffer with Opus. ── */
async function encodeAudio(audioEncoder, audioBuffer, loopDur, onProgress, token) {
  var sr = audioBuffer.sampleRate;
  var loopFrames = Math.floor(loopDur * sr);
  var startFrame = loopFrames;  // skip the first iteration
  var endFrame = Math.min(2 * loopFrames, audioBuffer.length);
  var totalFrames = endFrame - startFrame;

  var ch0 = audioBuffer.getChannelData(0);
  var ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;

  // Opus accepts 2.5/5/10/20/40/60ms frames; 20ms = 960 samples at 48kHz.
  var chunkFrames = 960;
  for (var off = 0; off < totalFrames; off += chunkFrames) {
    TR.checkCancel(token);
    var n = Math.min(chunkFrames, totalFrames - off);
    // f32-planar layout: [ch0 samples..., ch1 samples...]
    var data = new Float32Array(n * 2);
    data.set(ch0.subarray(startFrame + off, startFrame + off + n), 0);
    data.set(ch1.subarray(startFrame + off, startFrame + off + n), n);

    while (audioEncoder.encodeQueueSize > 8) {
      await new Promise(function(r) { setTimeout(r, 0); });
      TR.checkCancel(token);
    }

    var ad = new AudioData({
      format: 'f32-planar',
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round(off * 1e6 / sr),
      data: data
    });
    audioEncoder.encode(ad);
    ad.close();

    if (onProgress) onProgress(Math.min(1, (off + n) / totalFrames));
  }
  await audioEncoder.flush();
}

/* ── Top-level orchestration. Optional `onProgress(p)` callback fires
   with `p` in [0, 1] as work proceeds. Phase weights:
     - audio        : 50% — OfflineAudioContext gives no granularity,
                            so we run a time-based asymptotic estimate
                            during render that approaches but never
                            reaches the phase's full weight, then snap
                            to it on completion.
     - video        : 40% — real per-frame progress.
     - encodeAudio  :  8% — real per-chunk progress.
     - mux          :  2% — finalize step.
── */
var PROGRESS_WEIGHTS = { audio: 0.5, video: 0.4, encodeAudio: 0.08, mux: 0.02 };
TR.exportVideo = async function(onProgress) {
  function emit(phase, sub) {
    if (!onProgress) return;
    var sum = 0;
    for (var k in PROGRESS_WEIGHTS) {
      if (k === phase) { sum += PROGRESS_WEIGHTS[k] * sub; break; }
      sum += PROGRESS_WEIGHTS[k];
    }
    onProgress(Math.max(0, Math.min(1, sum)));
  }

  if (!TR.exportVideoAvailable()) throw new Error('WebCodecs / webm-muxer not available');
  if (currentToken) throw new Error('Export already in progress');
  var token = currentToken = { aborted: false };
  var videoEncoder = null, audioEncoder = null;

  try {
    var pats = TR.collectPatternsForRender();
    if (pats.length === 0) throw new Error('No patterns to render');

    var bpm = parseInt(document.getElementById('bpm').value);
    var fps = 30;
    var sampleRate = 48000;

    var canvas = document.getElementById('viz-canvas');
    var w = canvas.width;
    var h = canvas.height;

    var accentMode = TR.getAccentMode();

    // Build a single-loop viz schedule, then double it for seamless looping.
    // Both build/double dispatch through the active mode so other viz modes
    // (clip, etc) can supply their own schedule shape.
    var mode = TR.activeVizMode;
    if (!mode || !mode.buildSchedule || !mode.renderFrame || !mode.doubleSchedule) {
      throw new Error('Active viz mode does not support export');
    }
    var single = await mode.buildSchedule(pats, bpm, accentMode, w, h);
    var loopDur = single.totalDuration;
    if (!(loopDur > 0)) throw new Error('Empty schedule');
    var doubleSchedule = mode.doubleSchedule(single);

    emit('audio', 0);
    // OfflineAudioContext doesn't expose progress; estimate it asymptotically
    // by elapsed time so the bar at least shows motion. The time constant is
    // a rough fraction of the audio duration (browsers typically render at
    // several × realtime). The estimate caps just under the phase weight so
    // we never overshoot before the actual completion snaps it to full.
    var audioStartMs = performance.now();
    var audioTimeConst = Math.max(2, (2 * loopDur) * 0.25);  // seconds
    var audioTicker = setInterval(function() {
      var elapsed = (performance.now() - audioStartMs) / 1000;
      var p = 1 - Math.exp(-elapsed / audioTimeConst);
      emit('audio', Math.min(0.95, p));
    }, 200);
    var audioInfo;
    try {
      // Shared renderer (also used by the WAV export). Two back-to-back
      // loop iterations; encodeAudio keeps only the second so decay
      // tails from iteration 1 are present at the seam.
      audioInfo = await TR.audio.renderPatterns(pats, {
        bpm: bpm, accentMode: accentMode, sampleRate: sampleRate, iterations: 2
      });
    } finally {
      clearInterval(audioTicker);
    }
    TR.checkCancel(token);
    emit('audio', 1);

    // Set up muxer + encoders.
    var muxer = new WebMMuxer.Muxer({
      target: new WebMMuxer.ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: w, height: h, frameRate: fps },
      audio: { codec: 'A_OPUS', sampleRate: sampleRate, numberOfChannels: 2 }
    });

    videoEncoder = new VideoEncoder({
      output: function(chunk, meta) { muxer.addVideoChunk(chunk, meta); },
      error:  function(e) { console.error('Video encoder error:', e); }
    });
    videoEncoder.configure({
      codec: 'vp09.00.50.08',
      width: w, height: h,
      bitrate: 4_000_000,
      framerate: fps
    });

    audioEncoder = new AudioEncoder({
      output: function(chunk, meta) { muxer.addAudioChunk(chunk, meta); },
      error:  function(e) { console.error('Audio encoder error:', e); }
    });
    audioEncoder.configure({
      codec: 'opus',
      sampleRate: sampleRate,
      numberOfChannels: 2,
      bitrate: 192_000
    });

    await renderVideoFrames(videoEncoder, doubleSchedule, loopDur, w, h, fps,
      function(p) { emit('video', p); }, token, mode);
    await encodeAudio(audioEncoder, audioInfo.buffer, loopDur,
      function(p) { emit('encodeAudio', p); }, token);
    emit('mux', 0);

    muxer.finalize();
    emit('mux', 1);
    var buffer = muxer.target.buffer;
    var blob = new Blob([buffer], { type: 'video/webm' });
    return { blob: blob, filename: TR.timestamp() + '_trhythm.webm' };
  } finally {
    // Release the encoder GPU/CPU resources on every path — success
    // included (flush() does not close). The state guard prevents the
    // InvalidStateError close() throws on an already-closed encoder.
    if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    // Release any per-export resources the active mode allocated
    // (e.g. clip mode's dedicated <video> elements + their object URLs).
    // `single` is `var`-hoisted, so it's `undefined` if buildSchedule
    // threw or never ran — the truthy check below handles that.
    if (single && single.dispose) {
      try { single.dispose(); } catch (_) {}
    }
    if (currentToken === token) currentToken = null;
  }
};

})(window.TR);
