(function(TR) {
/* ─── Audio Engine ─── */
TR.audio = {};

TR.audio.init = function() {
  if (TR.state.masterGain) return;
  var ctx = Tone.getContext().rawContext;

  TR.state.masterGain = ctx.createGain();
  TR.state.masterGain.gain.value = 1;

  var limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = 0;
  limiter.knee.value = 0;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.02;

  TR.state.masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // Pre-generate noise buffer
  var sr = ctx.sampleRate;
  var len = sr * 2;
  TR.state.noiseBuffer = ctx.createBuffer(1, len, sr);
  var data = TR.state.noiseBuffer.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
};

TR.audio.playKick = function(time, _ctx, _master) {
  var ctx = _ctx || Tone.getContext().rawContext;
  var master = _master || TR.state.masterGain;
  var osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(2.0, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(gain); gain.connect(master);
  osc.start(time); osc.stop(time + 0.35);
  // Subtle square click
  var sq = ctx.createOscillator();
  sq.type = 'square';
  sq.frequency.setValueAtTime(160, time);
  sq.frequency.exponentialRampToValueAtTime(30, time + 0.04);
  var sg = ctx.createGain();
  sg.gain.setValueAtTime(0.3, time);
  sg.gain.linearRampToValueAtTime(0, time + 0.05);
  sq.connect(sg); sg.connect(master);
  sq.start(time); sq.stop(time + 0.06);
};

TR.audio.playSnare = function(time, _ctx, _master, _noiseBuf) {
  var ctx = _ctx || Tone.getContext().rawContext;
  var master = _master || TR.state.masterGain;
  var nb = _noiseBuf || TR.state.noiseBuffer;
  var src = ctx.createBufferSource();
  src.buffer = nb;
  src.start(time, Math.random()); src.stop(time + 0.15);
  var filt = ctx.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 1000;
  var ng = ctx.createGain();
  ng.gain.setValueAtTime(1.2, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  src.connect(filt); filt.connect(ng); ng.connect(master);
  // Sine+square mix body
  var osc = ctx.createOscillator();
  osc.type = 'sine'; osc.frequency.value = 200;
  var og = ctx.createGain();
  og.gain.setValueAtTime(0.8, time);
  og.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  osc.connect(og); og.connect(master);
  osc.start(time); osc.stop(time + 0.15);
  var sq = ctx.createOscillator();
  sq.type = 'square'; sq.frequency.value = 210;
  var sqg = ctx.createGain();
  sqg.gain.setValueAtTime(0.3, time);
  sqg.gain.linearRampToValueAtTime(0, time + 0.07);
  sq.connect(sqg); sqg.connect(master);
  sq.start(time); sq.stop(time + 0.1);
};

TR.audio.playHihat = function(time, _ctx, _master, _noiseBuf) {
  var ctx = _ctx || Tone.getContext().rawContext;
  var master = _master || TR.state.masterGain;
  var nb = _noiseBuf || TR.state.noiseBuffer;
  var src = ctx.createBufferSource();
  src.buffer = nb;
  src.start(time, Math.random()); src.stop(time + 0.06);
  var filt = ctx.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 7000;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.7, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(filt); filt.connect(g); g.connect(master);
  // Faint square shimmer
  var sq = ctx.createOscillator();
  sq.type = 'square'; sq.frequency.value = 6800;
  var sg = ctx.createGain();
  sg.gain.setValueAtTime(0.1, time);
  sg.gain.linearRampToValueAtTime(0, time + 0.03);
  sq.connect(sg); sg.connect(master);
  sq.start(time); sq.stop(time + 0.03);
};

/* ─── Accent voice ───────────────────────────────────────────────────
 * Single CY family at 5 intensity stages. cutoff / gain / decay all
 * linearly interpolate between the CY-- and CY++ endpoints so the
 * progression sounds like "same cymbal, progressively louder and fuller".
 *   CY-- : edge tap — bright and short
 *   CY-  : ⎫
 *   CY   : ⎬ smooth interpolation between the endpoints
 *   CY+  : ⎭
 *   CY++ : full hit — longest shimmer
 */
TR.audio.playCymbal = function(time, stage, _ctx, _master, _noiseBuf) {
  var ctx = _ctx || Tone.getContext().rawContext;
  var master = _master || TR.state.masterGain;
  var nb = _noiseBuf || TR.state.noiseBuffer;
  //              CY--   CY-    CY     CY+    CY++
  var cutoffs = [5875,  5406,  4938,  4469,  4000];
  var gains   = [0.575, 0.594, 0.613, 0.631, 0.650];
  var decays  = [0.44,  0.61,  0.77,  0.94,  1.10];
  var src = ctx.createBufferSource();
  src.buffer = nb;
  src.start(time, Math.random()); src.stop(time + decays[stage]);
  var filt = ctx.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = cutoffs[stage];
  var g = ctx.createGain();
  g.gain.setValueAtTime(gains[stage], time);
  g.gain.exponentialRampToValueAtTime(0.001, time + decays[stage]);
  src.connect(filt); filt.connect(g); g.connect(master);
};

/* Pattern-driven accent. When mode is 'on', the cymbal stage comes from
 * TR.cymbalStage (2-adic valuation of patternIdx, clamped): odd indexes
 * get the weakest stage, higher powers of two get progressively stronger
 * ones, index 0 the strongest. NUM_CY_STAGES must match the
 * cutoffs/gains/decays array length in playCymbal above.
 * ('random' mode is handled by the audition.js wrapper around this.) */
TR.audio.playAccent = function(mode, time, patternIdx, _ctx, _master, _noiseBuf) {
  if (mode !== 'on') return;  // 'off' or unknown → silent
  var NUM_CY_STAGES = 5;
  TR.audio.playCymbal(time, TR.cymbalStage(patternIdx, NUM_CY_STAGES - 1), _ctx, _master, _noiseBuf);
};

/* ─── Offline rendering (shared by the WAV and video exporters) ─────
 * Renders the supplied patterns ({ pat, bankIdx } entries from
 * TR.collectPatternsForRender) into an AudioBuffer. Timing comes from
 * TR.slotTiming — the same helper the viz schedule builders use — so
 * the audio loop length and the video loop length agree by
 * construction.
 *
 * opts:
 *   bpm          required
 *   accentMode   'off' | 'on' | 'random'
 *   sampleRate   default 44100
 *   iterations   default 1; the video exporter renders 2 back-to-back
 *                loops and keeps only the second for a seamless seam
 *   startOffset  lead-in silence in seconds (default 0)
 *   tail         decay room after the last loop in seconds (default 0)
 *   onStart      optional callback(totalDuration) fired just before
 *                startRendering — used to start progress estimators
 *
 * Returns { buffer, loopDuration } (loopDuration excludes offset/tail).
 */
TR.audio.renderPatterns = async function(pats, opts) {
  var bpm = opts.bpm;
  var sampleRate = opts.sampleRate || 44100;
  var iterations = opts.iterations || 1;
  var startOffset = opts.startOffset || 0;
  var tail = opts.tail || 0;

  // Per-slot timing, all through the shared helper.
  var slots = [];
  var loopDur = 0;
  for (var p = 0; p < pats.length; p++) {
    var entry = pats[p];  // { pat, bankIdx } from collectPatternsForRender
    var st = TR.slotTiming(entry.pat, bpm);
    slots.push({ pat: entry.pat, bankIdx: entry.bankIdx, offset: loopDur, timing: st.tracks });
    loopDur += st.slotDur;
  }

  var totalDur = startOffset + iterations * loopDur + tail;
  var offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDur), sampleRate);

  // Master bus: same gain + limiter shape as the realtime init above.
  var master = offCtx.createGain();
  master.gain.value = 1;
  var limiter = offCtx.createDynamicsCompressor();
  limiter.threshold.value = 0;
  limiter.knee.value = 0;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.02;
  master.connect(limiter);
  limiter.connect(offCtx.destination);

  var nLen = sampleRate * 2;
  var noise = offCtx.createBuffer(1, nLen, sampleRate);
  var nData = noise.getChannelData(0);
  for (var i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;

  var play = { kick: TR.audio.playKick, snare: TR.audio.playSnare, hihat: TR.audio.playHihat };
  for (var iter = 0; iter < iterations; iter++) {
    var iterOff = startOffset + iter * loopDur;
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      var base = iterOff + sl.offset;
      for (var ti = 0; ti < TR.INSTRUMENTS.length; ti++) {
        var key = TR.INSTRUMENTS[ti];
        var t = sl.timing[key];
        var flat = sl.pat[key];
        if (!t || !flat) continue;
        for (var st2 = 0; st2 < flat.length; st2++) {
          if (flat[st2]) play[key](base + st2 * t.secPerStep, offCtx, master, noise);
        }
      }
      TR.audio.playAccent(opts.accentMode, base, sl.bankIdx, offCtx, master, noise);
    }
  }

  if (opts.onStart) opts.onStart(totalDur);
  var rendered = await offCtx.startRendering();
  return { buffer: rendered, loopDuration: loopDur };
};

/* ─── Audition voices live in js/audition.js (self-contained module) ─── */

TR.audio.reset = function() {
  if (TR.state.isPlaying) TR.stopPlayback();
  TR.state.masterGain = null;
  TR.state.noiseBuffer = null;
  TR.state.toneStarted = false;
  try {
    Tone.getContext().rawContext.close();
  } catch(e) {}
  Tone.setContext(new (window.AudioContext || window.webkitAudioContext)());
};

// iOS sleep recovery: always reset audio on wake
document.addEventListener('visibilitychange', function() {
  if (document.hidden) return;
  var rawCtx = Tone.getContext().rawContext;
  if (rawCtx.state !== 'running') {
    TR.audio.reset();
  }
});

// Wire up instPlayback play functions
TR.state.instPlayback[0].play = TR.audio.playKick;
TR.state.instPlayback[1].play = TR.audio.playSnare;
TR.state.instPlayback[2].play = TR.audio.playHihat;
})(window.TR);
