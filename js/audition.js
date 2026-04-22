/* ═══════════════════════════════════════════════════════════════════
 * Audition module — exploratory accent voices for A/B listening.
 *
 * Self-contained: can be dropped entirely by removing the <script> tag
 * in index.html and deleting this file. The production accent voice
 * (TR.audio.playCymbal, wired into playback) does not depend on any of
 * this.
 *
 * Adding / removing a voice: edit the VOICES array only.
 * ═══════════════════════════════════════════════════════════════════ */
(function(TR) {

var VOICES = [
  /* ─── 易 (simple syntheses) ──────────────────────────────────── */
  { id: 'bongo', label: 'ボンゴ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, time);
    osc.frequency.exponentialRampToValueAtTime(200, time + 0.08);
    var g = ctx.createGain();
    g.gain.setValueAtTime(1.0, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.25);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.02);
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 2500;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'shaker', label: 'シェーカー', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.1);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 6000; filt.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.8, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    src.connect(filt); filt.connect(g); g.connect(master);
  }},

  { id: 'guiro', label: 'ギロ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.25);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 3000; filt.Q.value = 1.5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    for (var i = 0; i < 10; i++) {
      var t = time + i * 0.02;
      g.gain.linearRampToValueAtTime(0.7, t + 0.004);
      g.gain.linearRampToValueAtTime(0.15, t + 0.018);
    }
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    src.connect(filt); filt.connect(g); g.connect(master);
  }},

  { id: 'blip', label: 'ブリップ', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 880;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.08);
  }},

  { id: 'zip', label: 'ジップ', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(2000, time + 0.1);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.4, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.15);
  }},

  { id: 'triad', label: '3和音', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var freqs = [440, 554.37, 659.26];
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freqs[i];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.30, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + 0.45);
    }
  }},

  { id: 'whip', label: '鞭', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.1);
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(2000, time);
    filt.frequency.exponentialRampToValueAtTime(8000, time + 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.8, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    src.connect(filt); filt.connect(g); g.connect(master);
  }},

  { id: 'typewriter', label: 'タイプ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.025);
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 5000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.6, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    src.connect(filt); filt.connect(g); g.connect(master);
    var osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 3000;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.25, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    osc.connect(og); og.connect(master);
    osc.start(time); osc.stop(time + 0.03);
  }},

  /* ─── 中 (multi-layered / filter-based) ──────────────────────── */
  { id: 'timpani', label: 'ティンパニ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(85, time + 0.2);
    var g = ctx.createGain();
    g.gain.setValueAtTime(1.3, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 1.5);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 1.6);
    var osc2 = ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = 220;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.25, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
    osc2.connect(og); og.connect(master);
    osc2.start(time); osc2.stop(time + 0.75);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.03);
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 1500;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'clapper', label: '拍子木', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, time);
    osc.frequency.exponentialRampToValueAtTime(1800, time + 0.015);
    var g = ctx.createGain();
    g.gain.setValueAtTime(1.2, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.05);
    var osc2 = ctx.createOscillator();
    osc2.type = 'square'; osc2.frequency.value = 4400;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.3, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    osc2.connect(og); og.connect(master);
    osc2.start(time); osc2.stop(time + 0.025);
  }},

  { id: 'tubular', label: 'チューブラー', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var freqs  = [440, 880, 1100, 1320];
    var gains  = [0.50, 0.35, 0.20, 0.15];
    var decays = [2.50, 2.00, 1.50, 1.20];
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freqs[i];
      var g = ctx.createGain();
      g.gain.setValueAtTime(gains[i], time);
      g.gain.exponentialRampToValueAtTime(0.001, time + decays[i]);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + decays[i] + 0.1);
    }
  }},

  { id: 'sleigh', label: 'スレイ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var offsets = [0, 0.010, 0.025, 0.045, 0.070];
    var gs      = [0.50, 0.42, 0.36, 0.30, 0.24];
    for (var i = 0; i < offsets.length; i++) {
      var t = time + offsets[i];
      var src = ctx.createBufferSource();
      src.buffer = nb;
      src.start(t, Math.random()); src.stop(t + 0.25);
      var filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 7000 + Math.random() * 1500;
      var g = ctx.createGain();
      g.gain.setValueAtTime(gs[i], t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(filt); filt.connect(g); g.connect(master);
    }
  }},

  { id: 'handbell', label: 'ハンドベル', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 880;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.45, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 1.05);
    var osc2 = ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = 1760;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.15, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc2.connect(og); og.connect(master);
    osc2.start(time); osc2.stop(time + 0.55);
  }},

  { id: 'furin', label: '風鈴', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 2400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.35, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 1.25);
    var osc2 = ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = 2403;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.28, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    osc2.connect(og); og.connect(master);
    osc2.start(time); osc2.stop(time + 1.25);
    var osc3 = ctx.createOscillator();
    osc3.type = 'sine'; osc3.frequency.value = 3600;
    var og3 = ctx.createGain();
    og3.gain.setValueAtTime(0.15, time);
    og3.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
    osc3.connect(og3); og3.connect(master);
    osc3.start(time); osc3.stop(time + 0.75);
  }},

  { id: 'laser', label: 'レーザー', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2500, time);
    osc.frequency.exponentialRampToValueAtTime(300, time + 0.15);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.50, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.22);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.12);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(3000, time);
    filt.frequency.exponentialRampToValueAtTime(500, time + 0.12);
    filt.Q.value = 2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'piano', label: 'ピアノ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var fund = 440;
    var ratios = [1, 2, 3];
    var amps   = [0.55, 0.22, 0.08];
    for (var i = 0; i < ratios.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = fund * ratios[i];
      var g = ctx.createGain();
      g.gain.setValueAtTime(amps[i], time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.85);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + 0.9);
    }
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.015);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 3000; filt.Q.value = 1;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'pizz', label: 'ピチカート', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 330;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3000, time);
    filt.frequency.exponentialRampToValueAtTime(600, time + 0.35);
    filt.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.80, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(filt); filt.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.42);
  }},

  { id: 'horn', label: 'ホーン', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 220;
    var osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth'; osc2.frequency.value = 110;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1500; filt.Q.value = 1.5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.50, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.30, time + 0.10);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(filt); osc2.connect(filt);
    filt.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.4);
    osc2.start(time); osc2.stop(time + 0.4);
  }},

  { id: 'thunder', label: '雷鳴', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 2.0);
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400; filt.Q.value = 0.5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(1.5, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.8, time + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
    src.connect(filt); filt.connect(g); g.connect(master);
  }},

  { id: 'drop', label: '水滴', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.exponentialRampToValueAtTime(1800, time + 0.02);
    osc.frequency.exponentialRampToValueAtTime(1000, time + 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.15);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.02);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2500; filt.Q.value = 2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  /* ─── 難 (FM / inharmonic / reverse / multi-layered) ─────────── */
  { id: 'djembe', label: 'ジェンベ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    // Hand drum slap — pitched body + sharp noise transient
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, time);
    osc.frequency.exponentialRampToValueAtTime(180, time + 0.05);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.2);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.03);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 3500; filt.Q.value = 1.5;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'conga', label: 'コンガ', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    // Medium pitched hand drum — warmer than bongo, sharper than djembe
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, time);
    osc.frequency.exponentialRampToValueAtTime(180, time + 0.08);
    var g = ctx.createGain();
    g.gain.setValueAtTime(1.1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.22);
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + 0.04);
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2500; filt.Q.value = 1.2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.4, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(filt); filt.connect(ng); ng.connect(master);
  }},

  { id: 'tabla', label: 'タブラ', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // Indian hand drum — characteristic pitch bend (down then up)
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(95, time + 0.08);
    osc.frequency.linearRampToValueAtTime(110, time + 0.2);
    var g = ctx.createGain();
    g.gain.setValueAtTime(1.3, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.4);
    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle'; osc2.frequency.value = 1500;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.25, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    osc2.connect(og); og.connect(master);
    osc2.start(time); osc2.stop(time + 0.025);
  }},

  { id: 'singingbowl', label: '歌鈴', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // Tibetan singing bowl — slow attack, close-detuned sines produce beating
    var f0 = 250;
    var partials = [
      { freq: f0,         gain: 0.35, decay: 4.5 },
      { freq: f0 + 1.5,   gain: 0.33, decay: 4.5 },
      { freq: f0 * 2.4,   gain: 0.18, decay: 3.5 },
      { freq: f0 * 3.8,   gain: 0.10, decay: 2.5 }
    ];
    for (var i = 0; i < partials.length; i++) {
      var p = partials[i];
      var osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = p.freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.exponentialRampToValueAtTime(p.gain, time + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, time + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + p.decay + 0.1);
    }
  }},

  { id: 'templebell', label: '寺の鐘', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // Very long decay with complex inharmonic partials
    var partials = [
      { freq: 150,  gain: 0.50, decay: 6.0 },
      { freq: 420,  gain: 0.30, decay: 5.0 },
      { freq: 800,  gain: 0.20, decay: 3.5 },
      { freq: 1350, gain: 0.10, decay: 2.0 },
      { freq: 2100, gain: 0.07, decay: 1.5 }
    ];
    for (var i = 0; i < partials.length; i++) {
      var p = partials[i];
      var osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = p.freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(p.gain, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + p.decay + 0.1);
    }
  }},

  { id: 'fmchirp', label: 'FMチャープ', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // FM: modulator → carrier.frequency via a gain node acting as modulation depth
    var carrier = ctx.createOscillator();
    carrier.type = 'sine'; carrier.frequency.value = 800;
    var modulator = ctx.createOscillator();
    modulator.type = 'sine'; modulator.frequency.value = 200;
    var modGain = ctx.createGain();
    modGain.gain.setValueAtTime(500, time);
    modGain.gain.exponentialRampToValueAtTime(10, time + 0.2);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.4, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    carrier.connect(g); g.connect(master);
    modulator.start(time); modulator.stop(time + 0.25);
    carrier.start(time); carrier.stop(time + 0.25);
  }},

  { id: 'bitcrush', label: 'ビットクラッシュ', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // WaveShaper quantizes amplitude to 4-bit (16 steps) for digital-sounding distortion
    var osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 660;
    var steps = 16;
    var curve = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) {
      var x = (i / 1024) * 2 - 1;
      curve[i] = Math.round(x * (steps / 2)) / (steps / 2);
    }
    var ws = ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = 'none';
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.4, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(ws); ws.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.28);
  }},

  { id: 'trumpet', label: 'トランペット', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // Bright brass — sawtooth through a resonant lowpass that opens on attack
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 440;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2000, time);
    filt.frequency.exponentialRampToValueAtTime(3500, time + 0.05);
    filt.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(filt); filt.connect(g); g.connect(master);
    osc.start(time); osc.stop(time + 0.28);
  }},

  { id: 'reverse', label: 'リバース', play: function(time, _ctx, _master, _noiseBuf) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var nb = _noiseBuf || TR.state.noiseBuffer;
    // Reverse cymbal — swell in then cut at peak (gain ramp UP instead of down)
    var dur = 0.6;
    var src = ctx.createBufferSource();
    src.buffer = nb;
    src.start(time, Math.random()); src.stop(time + dur);
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 4000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(0.6, time + dur - 0.02);
    g.gain.linearRampToValueAtTime(0.001, time + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
  }},

  { id: 'inharmbell', label: '非調和ベル', play: function(time, _ctx, _master) {
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    // Bell-like but with deliberately inharmonic partial ratios (not integers)
    var partials = [
      { freq: 180,  gain: 0.40, decay: 3.0 },
      { freq: 317,  gain: 0.30, decay: 2.5 },
      { freq: 523,  gain: 0.25, decay: 2.0 },
      { freq: 891,  gain: 0.15, decay: 1.5 },
      { freq: 1373, gain: 0.10, decay: 1.0 }
    ];
    for (var i = 0; i < partials.length; i++) {
      var p = partials[i];
      var osc = ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = p.freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(p.gain, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + p.decay + 0.1);
    }
  }}
];

/* ─── Per-voice loudness normalization ───────────────────────────────
 * Each voice has its own internal gain/decay shape, so summed perceived
 * loudness varies widely. These multipliers are applied to a gain node
 * inserted between the voice and the master bus when ランダム is active.
 * Tuned by ear; tweak freely. Missing keys default to 1.0.
 */
var NORM = {
  // Drums (loud → scale down)
  bongo: 0.75, djembe: 0.75, conga: 0.70, tabla: 0.70, timpani: 0.50,
  // Bells / metal (reduced further — long decays sum up perceptually)
  tubular: 0.15, templebell: 0.17, handbell: 0.30, furin: 0.30,
  singingbowl: 0.22, inharmbell: 0.28, sleigh: 0.35, clapper: 0.75,
  // Electronic
  blip: 0.90, zip: 1.10, laser: 0.90, fmchirp: 1.20, bitcrush: 1.00,
  reverse: 1.20,
  // Noise / scratchy
  shaker: 1.10, guiro: 0.85, whip: 0.90, typewriter: 1.30,
  // Melodic (triad is sine-chord and rings — reduce)
  triad: 0.30, piano: 0.85, pizz: 1.00, horn: 0.85, trumpet: 0.85,
  // Environmental
  thunder: 0.50, drop: 0.85
};

/* ─── Random mode: pick NUM_SLOTS voices at generation time and assign
 *      them to divisibility stages (same shape as the CY シンバル voice).
 *      Pattern idx's 2-adic valuation selects which slot fires.
 *      Re-shuffled on every btn-generate click. ─── */
var NUM_SLOTS = 5;
var randomSlots = [];

function shuffleRandomSlots() {
  var pool = VOICES.slice();
  // Fisher-Yates
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  randomSlots = pool.slice(0, NUM_SLOTS);
}
shuffleRandomSlots();  // initial assignment before any generation fires
var genBtn = document.getElementById('btn-generate');
if (genBtn) genBtn.addEventListener('click', shuffleRandomSlots);

var origPlayAccent = TR.audio.playAccent;
TR.audio.playAccent = function(mode, time, patternIdx, _ctx, _master, _noiseBuf) {
  if (mode === 'random') {
    // 2-adic valuation of pattern index (pattern 0 → PATTERN_COUNT so it gets
    // the highest stage). Matches the シンバル mode's stage selection rule.
    var n = patternIdx === 0 ? TR.PATTERN_COUNT : patternIdx;
    var v2 = 0;
    while (n > 0 && n % 2 === 0) { n /= 2; v2++; }
    var stage = Math.min(v2, randomSlots.length - 1);
    var voice = randomSlots[stage];
    if (!voice) return;
    var ctx = _ctx || Tone.getContext().rawContext;
    var master = _master || TR.state.masterGain;
    var normG = ctx.createGain();
    normG.gain.value = NORM[voice.id] || 1.0;
    normG.connect(master);
    voice.play(time, ctx, normG, _noiseBuf);
    return;
  }
  return origPlayAccent(mode, time, patternIdx, _ctx, _master, _noiseBuf);
};

/* ─── Inject the "ランダム" button into the existing Accent radio row ─── */
(function injectButton() {
  var accentRow = document.querySelector('.btn-accent')
                   && document.querySelector('.btn-accent').parentElement;
  if (!accentRow) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-accent';
  btn.dataset.value = 'random';
  btn.textContent = 'ランダム';
  btn.addEventListener('click', function() {
    var all = document.querySelectorAll('.btn-accent');
    for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
    this.classList.add('active');
  });
  accentRow.appendChild(btn);
})();

})(window.TR);
