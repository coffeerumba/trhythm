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
   takes effect on the very next phase boundary. ── */
var currentToken = null;
function CancelError() {
  var e = new Error('cancelled');
  e.cancelled = true;
  return e;
}
function checkCancel(token) { if (token && token.aborted) throw CancelError(); }
TR.exportInProgress = function() { return !!currentToken; };
TR.cancelExport = function() { if (currentToken) currentToken.aborted = true; };

/* ── Audio: schedule hits across both loop iterations and offline-render. ── */
function buildAudioSlotTimings(pats, bpm) {
  var slots = [];
  var offset = 0;
  for (var p = 0; p < pats.length; p++) {
    var entry = pats[p];
    var pat = entry.pat || entry;
    var bankIdx = (entry.bankIdx != null) ? entry.bankIdx : p;

    var kickLeaves  = TR.computeLevels(pat.kickDef.tree).length;
    var snareLeaves = TR.computeLevels(pat.snareDef.tree).length;
    var hihatLeaves = TR.computeLevels(pat.hihatDef.tree).length;
    var kickBeats   = pat.kickBeats  || TR.computeBeats(pat.kickDef);
    var snareBeats  = pat.snareBeats || TR.computeBeats(pat.snareDef);
    var hihatBeats  = pat.hihatBeats || TR.computeBeats(pat.hihatDef);
    var kickSpS  = 60 * kickBeats  / bpm / kickLeaves;
    var snareSpS = 60 * snareBeats / bpm / snareLeaves;
    var hihatSpS = 60 * hihatBeats / bpm / hihatLeaves;
    var slotDur  = Math.max(
      kickSpS  * kickLeaves,
      snareSpS * snareLeaves,
      hihatSpS * hihatLeaves
    );

    slots.push({
      pat: pat, bankIdx: bankIdx, offset: offset, duration: slotDur,
      kickSpS: kickSpS, snareSpS: snareSpS, hihatSpS: hihatSpS
    });
    offset += slotDur;
  }
  return { slots: slots, loopDuration: offset };
}

async function renderAudioForLoop(pats, bpm, accentMode, sampleRate) {
  var info = buildAudioSlotTimings(pats, bpm);
  var loopDur = info.loopDuration;
  // Render two loop iterations back-to-back. We'll keep only the second.
  var totalDur = 2 * loopDur;
  var offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDur), sampleRate);

  var offMaster = offCtx.createGain();
  offMaster.gain.value = 1;
  var offLimiter = offCtx.createDynamicsCompressor();
  offLimiter.threshold.value = 0;
  offLimiter.knee.value = 0;
  offLimiter.ratio.value = 6;
  offLimiter.attack.value = 0.001;
  offLimiter.release.value = 0.02;
  offMaster.connect(offLimiter);
  offLimiter.connect(offCtx.destination);

  var sr = offCtx.sampleRate;
  var nLen = sr * 2;
  var offNoise = offCtx.createBuffer(1, nLen, sr);
  var nData = offNoise.getChannelData(0);
  for (var i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;

  for (var iter = 0; iter < 2; iter++) {
    var iterOff = iter * loopDur;
    for (var s = 0; s < info.slots.length; s++) {
      var sl = info.slots[s];
      var pat = sl.pat;
      var base = iterOff + sl.offset;
      for (var st = 0; st < pat.kick.length; st++) {
        if (pat.kick[st]) TR.audio.playKick(base + st * sl.kickSpS, offCtx, offMaster);
      }
      for (var st = 0; st < pat.snare.length; st++) {
        if (pat.snare[st]) TR.audio.playSnare(base + st * sl.snareSpS, offCtx, offMaster, offNoise);
      }
      for (var st = 0; st < pat.hihat.length; st++) {
        if (pat.hihat[st]) TR.audio.playHihat(base + st * sl.hihatSpS, offCtx, offMaster, offNoise);
      }
      TR.audio.playAccent(accentMode, base, sl.bankIdx, offCtx, offMaster, offNoise);
    }
  }

  var rendered = await offCtx.startRendering();
  return { buffer: rendered, loopDuration: loopDur };
}

/* ── Video: render the second iteration's frames into VideoEncoder. ── */
async function renderVideoFrames(videoEncoder, doubleSchedule, loopDur, w, h, fps, onProgress, token) {
  var offCanvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(w, h)
    : (function() { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
  var offCtx = offCanvas.getContext('2d');

  var totalFrames = Math.round(loopDur * fps);
  var keyEvery = Math.max(1, Math.round(fps * 2));  // keyframe every ~2 seconds
  for (var i = 0; i < totalFrames; i++) {
    checkCancel(token);
    var t = loopDur + i / fps;
    TR.flower.renderFrame(offCtx, w, h, t, doubleSchedule);

    // Backpressure: don't let the encoder queue grow unbounded.
    while (videoEncoder.encodeQueueSize > 8) {
      await new Promise(function(r) { setTimeout(r, 0); });
      checkCancel(token);
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
    checkCancel(token);
    var n = Math.min(chunkFrames, totalFrames - off);
    // f32-planar layout: [ch0 samples..., ch1 samples...]
    var data = new Float32Array(n * 2);
    data.set(ch0.subarray(startFrame + off, startFrame + off + n), 0);
    data.set(ch1.subarray(startFrame + off, startFrame + off + n), n);

    while (audioEncoder.encodeQueueSize > 8) {
      await new Promise(function(r) { setTimeout(r, 0); });
      checkCancel(token);
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
    var single = TR.flower.buildSchedule(pats, bpm, accentMode, w, h);
    var loopDur = single.totalDuration;
    if (!(loopDur > 0)) throw new Error('Empty schedule');
    var doubleSlots = single.slots.concat(single.slots.map(function(s) {
      return { offset: s.offset + loopDur, duration: s.duration, defaultDef: s.defaultDef };
    }));
    var doubleFirings = single.firings.concat(single.firings.map(function(f) {
      return {
        firingTime: f.firingTime + loopDur,
        forwardSec: f.forwardSec, reverseSec: f.reverseSec,
        poly: f.poly, lens: f.lens, key: f.key
      };
    }));
    doubleFirings.sort(function(a, b) { return a.firingTime - b.firingTime; });
    var doubleSchedule = {
      totalDuration: 2 * loopDur,
      slots:   doubleSlots,
      firings: doubleFirings
    };

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
      audioInfo = await renderAudioForLoop(pats, bpm, accentMode, sampleRate);
    } finally {
      clearInterval(audioTicker);
    }
    checkCancel(token);
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
      function(p) { emit('video', p); }, token);
    await encodeAudio(audioEncoder, audioInfo.buffer, loopDur,
      function(p) { emit('encodeAudio', p); }, token);
    emit('mux', 0);

    muxer.finalize();
    emit('mux', 1);
    var buffer = muxer.target.buffer;
    var blob = new Blob([buffer], { type: 'video/webm' });
    downloadBlob(blob, 'webm');
  } catch (e) {
    // On cancel or error, release the encoder GPU/CPU resources.
    if (videoEncoder && videoEncoder.state !== 'closed') { try { videoEncoder.close(); } catch(_){} }
    if (audioEncoder && audioEncoder.state !== 'closed') { try { audioEncoder.close(); } catch(_){} }
    throw e;
  } finally {
    if (currentToken === token) currentToken = null;
  }
};

function downloadBlob(blob, ext) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var now = new Date();
  var ts = now.getFullYear()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '_' + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');
  a.download = ts + '_trhythm.' + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

})(window.TR);
