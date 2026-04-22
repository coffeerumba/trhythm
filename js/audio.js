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

/* Pattern-driven accent. When mode is 'on', the cymbal stage is chosen from
 * the 2-adic valuation of patternIdx (0 is treated as TR.PATTERN_COUNT so it
 * gets the strongest cue). Stage is clamped to the highest index available
 * in the cymbal voice, so a future expansion of PATTERN_COUNT or of the CY
 * array doesn't require any code change here:
 *
 *   odd     → stage 0 (weakest)
 *   v₂ = 1  → stage 1
 *   v₂ = 2  → stage 2
 *   v₂ = 3  → stage 3
 *   v₂ = 4  → stage 4
 *   v₂ ≥ 5  → stage 5 if it exists, else clamped to the top.
 */
TR.audio.playAccent = function(mode, time, patternIdx, _ctx, _master, _noiseBuf) {
  if (mode !== 'on') return;  // 'off' or unknown → silent
  var NUM_CY_STAGES = 5;  // matches cutoffs/gains/decays length in playCymbal
  var n = patternIdx === 0 ? TR.PATTERN_COUNT : patternIdx;
  var v2 = 0;
  while (n > 0 && n % 2 === 0) { n /= 2; v2++; }
  var stage = Math.min(v2, NUM_CY_STAGES - 1);
  TR.audio.playCymbal(time, stage, _ctx, _master, _noiseBuf);
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
