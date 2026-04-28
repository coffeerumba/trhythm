(function(TR) {
/* ═══ Cursor ═══ */
/* Highlight the cell at cellIdx in the given grid. cellIdx < 0 (or undefined)
 * means the step plays audibly but falls outside the current virtual cycle's
 * display window — skip cursor update so the previous cell stays lit until
 * the DOM refresh at the next cycle boundary.
 * patternIdx / step are still needed for the viz hook, which fires on
 * every real hit regardless of whether a cell is shown. */
TR.showInstCursor = function(gridId, cellIdx, patternIdx, step) {
  var el = document.getElementById(gridId);
  if (el && cellIdx !== undefined && cellIdx >= 0) {
    var dots = el.querySelectorAll('.grid-step');
    for (var i = 0; i < dots.length; i++) dots[i].classList.remove('cursor-on');
    if (dots[cellIdx]) dots[cellIdx].classList.add('cursor-on');
  }
  // Viz hook fires on actual hits regardless of cursor visibility
  var keyMap = { 'grid-kick': 'kick', 'grid-snare': 'snare', 'grid-hihat': 'hihat' };
  var key = keyMap[gridId];
  if (key && typeof TR.vizOnHit === 'function') {
    var idx = (patternIdx !== undefined) ? patternIdx : TR.state.currentPattern;
    var pat = TR.state.patterns[idx];
    if (!pat) return;
    var flat = pat[key];
    if (flat && flat[step]) {
      var def = pat[key + 'Def'];
      if (def) {
        var levels = TR.computeLevels(def.tree);
        TR.vizOnHit(key, step, levels[step] || 0);
      }
    }
  }
};

TR.clearCursor = function() {
  var all = document.querySelectorAll('.cursor-on');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('cursor-on');
};

TR.updatePlayBtn = function() {
  var btn = document.getElementById('btn-play');
  if (TR.state.isPlaying) {
    btn.textContent = '\u25A0 \u505c\u6b62';
    btn.classList.add('playing');
  } else {
    btn.textContent = '\u25B6 \u518d\u751f';
    btn.classList.remove('playing');
  }
};

/* ═══ Playback ═══ */
/* ─── BPM slider ─── */
(function() {
  var slider = document.getElementById('bpm');
  var display = document.getElementById('bpm-val');
  slider.addEventListener('input', function() {
    display.textContent = slider.value;
    if (TR.state.isPlaying) {
      var bpm = parseInt(slider.value);
      for (var i = 0; i < TR.state.instPlayback.length; i++) {
        var ip = TR.state.instPlayback[i];
        ip.secPerStep = 60.0 * ip.beats / bpm / ip.count;
      }
      // Refresh the virtual cycle so the Crash/Accent timing follows
      if (TR.state.virtualBeats) {
        TR.state.virtualCycle = 60.0 * TR.state.virtualBeats / bpm;
      }
      // Realign virtualCycleEnd to the kick's next cycle-0 boundary in the
      // new tempo so the Crash keeps firing on the downbeat. Stretches the
      // remaining portion of the current cycle proportionally.
      var kickIp = null;
      for (var j = 0; j < TR.state.instPlayback.length; j++) {
        if (TR.state.instPlayback[j].key === 'kick') {
          kickIp = TR.state.instPlayback[j];
          break;
        }
      }
      if (kickIp && kickIp.count) {
        var stepsToZero = (kickIp.count - kickIp.step) % kickIp.count;
        TR.state.virtualCycleEnd = kickIp.nextTime + stepsToZero * kickIp.secPerStep;
      }
    }
  });
})();

TR.findNextPatternIndex = function(fromIndex) {
  for (var i = 1; i <= TR.PATTERN_COUNT; i++) {
    var idx = (fromIndex + i) % TR.PATTERN_COUNT;
    if (TR.state.patterns[idx]) return idx;
  }
  return -1;
};

/* Accent is a mode toggle (not a per-step pattern). Returns the currently
 * selected voice: 'off' (silent), 'ohh' (open hihat), 'cc' (crash), 'sc'
 * (splash). The audio dispatcher TR.audio.playAccent reads this. */
TR.getAccentMode = function() {
  var active = document.querySelector('.btn-accent.active');
  return active ? active.dataset.value : 'off';
};

/* Snapshot (pat, step, linear) for a track at the start of virtual cycle N.
 * Cycle N ≡ the Nth virtual pattern from pat 0. For async tracks this gives
 * the deterministic (pat, step) they'd be at if playback had progressed
 * through cycles 0..N from (pat 0, 0) — preserving async offsets under
 * manual pattern jumps. Sync tracks collapse to (pat N, 0) naturally since
 * stepsPerCycle === trackSteps. */
TR.computeTrackSnap = function(key, cycleN) {
  var pat0 = TR.state.patterns[0];
  var virtualBeats = TR.computeBeats(pat0.defaultDef);
  var leaves = pat0[key].length;
  var beats = pat0[key + 'Beats'];
  var stepsPerCycle = virtualBeats * leaves / beats;
  var snapLinear = Math.ceil(cycleN * stepsPerCycle);
  var curPat = 0;
  var step = snapLinear;
  while (step >= leaves) {
    step -= leaves;
    var next = TR.findNextPatternIndex(curPat);
    if (next < 0) break;
    curPat = next;
  }
  return { pat: curPat, step: step, linear: snapLinear };
};

TR.loadPatternForPlayback = function(idx) {
  TR.state.currentPattern = idx;
  var pat = TR.state.patterns[idx];
  TR.state.kickFlat = pat.kick;
  TR.state.snareFlat = pat.snare;
  TR.state.hihatFlat = pat.hihat;

  // During playback, render each track's grid from its own virtual-cycle
  // snapshot (snapPat, snapStep) — captured at the cycle boundary by the
  // scheduler. When paused, fall back to (currentPattern, 0) inside
  // renderAllGrids.
  var snaps = null;
  if (TR.state.isPlaying) {
    snaps = {};
    for (var i = 0; i < TR.state.instPlayback.length; i++) {
      var ip = TR.state.instPlayback[i];
      snaps[ip.key] = { pat: ip.snapPat, step: ip.snapStep };
    }
  }
  TR.renderAllGrids(pat, snaps);

  var btns = document.getElementById('pattern-bank').children;
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', i === idx);

  document.getElementById('empty-msg').style.display = 'none';
  document.getElementById('pattern-display').style.display = '';
};

TR.startPlayback = async function() {
  if (!TR.state.toneStarted) {
    await Tone.start();
    TR.state.toneStarted = true;
    TR.audio.init();
  }

  var firstIdx = TR.state.patterns[TR.state.currentPattern] ? TR.state.currentPattern : TR.findNextPatternIndex(TR.state.currentPattern);
  if (firstIdx < 0) return;

  var bpm = parseInt(document.getElementById('bpm').value);
  var now = Tone.now() + 0.05;

  var curPat = TR.state.patterns[firstIdx];
  // Virtual track: the default 拍構造's beats. Acts as the conceptual
  // "main pulse" — its cycle end triggers the pattern-bank / grid refresh
  // and the open-hihat cue. Synced instruments share this cycle; async
  // instruments deviate freely.
  var virtualBeats = TR.computeBeats(curPat.defaultDef);
  // Stored on TR.state so the BPM slider can recompute it mid-playback;
  // the scheduler reads it through TR.state every iteration.
  TR.state.virtualBeats = virtualBeats;
  TR.state.virtualCycle = 60.0 * virtualBeats / bpm;

  // Initialize per-track playback state and virtual-cycle display snapshots.
  // stepsPerCycle = virtualBeats * trackSteps / trackBeats. For sync tracks
  // this equals trackSteps exactly; for async tracks it's the true (possibly
  // fractional) number of this track's steps that play per virtual cycle.
  // cellCount = floor(stepsPerCycle) → number of cells shown in the grid.
  // snapPat/snapStep/snapLinear track "where does the grid's cell 0 live in
  // this track's (pattern, step) coordinates, as of the current virtual cycle".
  // When firstIdx != 0 (e.g. user jumped to pat N before hitting play), async
  // tracks start at their deterministic cycle-N offset rather than (N, 0).
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    var ip = TR.state.instPlayback[i];
    var defKey = ip.key + 'Def';
    var def = curPat[defKey];
    var levels = TR.computeLevels(def.tree);
    var leaves = levels.length;
    var beatsKey = ip.key + 'Beats';
    var beats = curPat[beatsKey];
    var cycle = 60.0 * beats / bpm;
    var initSnap = TR.computeTrackSnap(ip.key, firstIdx);
    ip.currentPattern = initSnap.pat;  // per-track pattern index (for audio scheduling)
    ip.step = initSnap.step;            // per-track step within its pattern
    ip.stepLinearIdx = initSnap.linear; // so cellIdx = stepLinearIdx - snapLinear starts at 0
    ip.count = leaves;
    ip.beats = beats;
    ip.secPerStep = cycle / leaves;
    ip.nextTime = now;
    ip.stepsPerCycle = virtualBeats * leaves / beats;
    ip.cellCount = Math.floor(ip.stepsPerCycle);
    ip.snapPat = initSnap.pat;
    ip.snapStep = initSnap.step;
    ip.snapLinear = initSnap.linear;    // stepLinearIdx at the start of the current virtual cycle
  }

  TR.state.isPlaying = true;

  // Initial render: cycle-0 snapshots already set on every ip above.
  TR.loadPatternForPlayback(firstIdx);

  // Stored on TR.state so the BPM slider can realign it mid-playback.
  TR.state.virtualCycleEnd = now + TR.state.virtualCycle;
  var virtualPattern = firstIdx;
  // virtualCycleNum is the absolute cycle index: cycle N ≡ pat N. Starting
  // at firstIdx keeps ceil(cycleNum * stepsPerCycle) consistent with the
  // initial ip.snapLinear = computeTrackSnap(.., firstIdx).linear.
  var virtualCycleNum = firstIdx;

  // Accent cue on the very first cycle start (voice derived from the pattern index)
  TR.audio.playAccent(TR.getAccentMode(), now, firstIdx);

  // Cancel token: guards pending setTimeouts so stopPlayback/switchPattern
  // can invalidate them without waiting for the lookahead window to clear.
  var token = { aborted: false };
  TR.state.cancelToken = token;

  function scheduler() {
    var lookAhead = Tone.now() + TR.SCHEDULER_LOOKAHEAD;

    // Advance the virtual track whenever its cycle ends within the lookahead
    while (TR.state.virtualCycleEnd < lookAhead) {
      var nextIdx = TR.findNextPatternIndex(virtualPattern);
      if (nextIdx >= 0) {
        virtualPattern = nextIdx;
        virtualCycleNum++;
        // Accent cue on the new cycle's downbeat (voice derived from the pattern index)
        TR.audio.playAccent(TR.getAccentMode(), TR.state.virtualCycleEnd, nextIdx);

        // Compute each track's new snapshot (snapPat, snapStep, snapLinear)
        // for this virtual cycle. Using ceil() so step indices that "start"
        // inside the new cycle go into the new cycle's display — this is
        // what makes "スネア9.33ステップ → cycle 0 = step 0..8, cycle 1 = step 10..18".
        var pendingSnaps = [];
        for (var j = 0; j < TR.state.instPlayback.length; j++) {
          var ipj = TR.state.instPlayback[j];
          var newSnapLinear = Math.ceil(virtualCycleNum * ipj.stepsPerCycle);
          var advance = newSnapLinear - ipj.snapLinear;
          var newSnapStep = ipj.snapStep + advance;
          var newSnapPat = ipj.snapPat;
          while (newSnapStep >= ipj.count) {
            newSnapStep -= ipj.count;
            var np = TR.findNextPatternIndex(newSnapPat);
            if (np < 0) break;
            newSnapPat = np;
          }
          pendingSnaps.push({ ip: ipj, pat: newSnapPat, step: newSnapStep, linear: newSnapLinear });
        }

        // Delay UI refresh to coincide with the new cycle's start.
        // The -1 ms margin ensures this refresh runs before any cursor
        // setTimeout scheduled at the same target time.
        var updateDelay = Math.max(0, (TR.state.virtualCycleEnd - Tone.now()) * 1000 - 1);
        (function(idx, d, snaps) {
          setTimeout(function() {
            if (token.aborted) return;
            // Apply the precomputed snapshots onto ip state, then render.
            // After this fires, the grid matches what the tracks actually play
            // during this new virtual cycle, and subsequent cursor setTimeouts
            // map step→cellIdx against the new snapLinear.
            for (var k = 0; k < snaps.length; k++) {
              var s = snaps[k];
              s.ip.snapPat = s.pat;
              s.ip.snapStep = s.step;
              s.ip.snapLinear = s.linear;
            }
            TR.loadPatternForPlayback(idx);
          }, d);
        })(nextIdx, updateDelay, pendingSnaps);
      }
      TR.state.virtualCycleEnd += TR.state.virtualCycle;
    }

    for (var i = 0; i < TR.state.instPlayback.length; i++) {
      var ip = TR.state.instPlayback[i];
      while (ip.nextTime < lookAhead) {
        // Per-track flat lookup from this track's own currentPattern
        var pat = TR.state.patterns[ip.currentPattern];
        var flat = pat ? pat[ip.key] : null;
        if (flat && flat[ip.step]) ip.play(ip.nextTime);
        var delay = Math.max(0, (ip.nextTime - Tone.now()) * 1000);
        // Capture stepLinearIdx / pattern / step at schedule time; recompute
        // cellIdx = stepLinearIdx - snapLinear at fire time so steps that
        // cross a virtual-cycle boundary pick up the updated snapshot.
        (function(gridId, stepLinearIdx, patternIdx, step, ipRef) {
          setTimeout(function() {
            if (token.aborted) return;
            var cellIdx = stepLinearIdx - ipRef.snapLinear;
            var displayIdx = (cellIdx >= 0 && cellIdx < ipRef.cellCount) ? cellIdx : -1;
            TR.showInstCursor(gridId, displayIdx, patternIdx, step);
          }, delay);
        })(ip.gridId, ip.stepLinearIdx, ip.currentPattern, ip.step, ip);
        ip.nextTime += ip.secPerStep;
        ip.step = (ip.step + 1) % ip.count;
        ip.stepLinearIdx++;
        // Per-track pattern advance when this track completes its own cycle.
        // Synced tracks wrap in sync with the virtual cycle and stay aligned;
        // async tracks progress independently.
        if (ip.step === 0) {
          var nextPatIdx = TR.findNextPatternIndex(ip.currentPattern);
          if (nextPatIdx >= 0) ip.currentPattern = nextPatIdx;
        }
      }
    }
    TR.state.schedulerTimer = setTimeout(scheduler, TR.SCHEDULER_INTERVAL);
  }
  scheduler();
  TR.updatePlayBtn();
};

TR.stopPlayback = function() {
  if (TR.state.schedulerTimer !== null) { clearTimeout(TR.state.schedulerTimer); TR.state.schedulerTimer = null; }
  // Invalidate pending setTimeouts from this playback session
  if (TR.state.cancelToken) { TR.state.cancelToken.aborted = true; TR.state.cancelToken = null; }
  TR.state.isPlaying = false;
  TR.clearCursor();
  TR.updatePlayBtn();
};

/* ─── Play/Stop button ─── */
document.getElementById('btn-play').addEventListener('click', function() {
  if (TR.state.isPlaying) {
    TR.stopPlayback();
  } else {
    TR.startPlayback();
  }
});

/* ═══ Export ═══ */
/* ─── Offline Render & WAV Download ─── */
TR.encodeWAV = function(audioBuffer) {
  var numChannels = audioBuffer.numberOfChannels;
  var sampleRate = audioBuffer.sampleRate;
  var numSamples = audioBuffer.length;
  var bytesPerSample = 2;
  var dataSize = numSamples * numChannels * bytesPerSample;
  var buffer = new ArrayBuffer(44 + dataSize);
  var view = new DataView(buffer);

  function writeStr(offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);

  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  var channels = [];
  for (var ch = 0; ch < numChannels; ch++) channels.push(audioBuffer.getChannelData(ch));

  var offset = 44;
  for (var i = 0; i < numSamples; i++) {
    for (var ch = 0; ch < numChannels; ch++) {
      var sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return buffer;
};

TR.collectPatternsForRender = function() {
  var list = [];
  for (var i = 0; i < TR.PATTERN_COUNT; i++) {
    if (TR.state.patterns[i]) list.push({ bankIdx: i, pat: TR.state.patterns[i] });
  }
  return list;
};

// Audio-only export: rendered via OfflineAudioContext, encoded to WAV,
// triggered as a download. `onProgress` is optional; we feed it an
// asymptotic time-based estimate during startRendering() since
// OfflineAudioContext gives no granular progress signal — same approach
// js/exportVideo.js uses for its audio phase. Cancellation works via
// `currentAudioToken`: clicking DL again sets aborted=true, and we throw
// `{cancelled:true}` after rendering finishes (we can't interrupt
// startRendering itself), which suppresses the file write.
var currentAudioToken = null;
TR.audioInProgress = function() { return !!currentAudioToken; };
TR.cancelAudio = function() { if (currentAudioToken) currentAudioToken.aborted = true; };

TR.renderOffline = async function(onProgress) {
  var pats = TR.collectPatternsForRender();
  if (pats.length === 0) return;

  currentAudioToken = { aborted: false };
  var token = currentAudioToken;
  var progressTicker = null;

  try {
  var bpm = parseInt(document.getElementById('bpm').value);
  var sampleRate = 44100;
  var startOffset = 0.01;
  var tail = 0.5;

  var totalDuration = startOffset;
  var patTimings = [];
  for (var p = 0; p < pats.length; p++) {
    var pat = pats[p].pat;
    var bankIdx = pats[p].bankIdx;
    var kickDef = pat.kickDef;
    var snareDef = pat.snareDef;
    var hihatDef = pat.hihatDef;

    var kickLeaves = TR.computeLevels(kickDef.tree).length;
    var snareLeaves = TR.computeLevels(snareDef.tree).length;
    var hihatLeaves = TR.computeLevels(hihatDef.tree).length;

    var kickBeats = pat.kickBeats || TR.computeBeats(kickDef);
    var snareBeats = pat.snareBeats || TR.computeBeats(snareDef);
    var hihatBeats = pat.hihatBeats || TR.computeBeats(hihatDef);

    var kickSecPerStep = 60.0 * kickBeats / bpm / kickLeaves;
    var snareSecPerStep = 60.0 * snareBeats / bpm / snareLeaves;
    var hihatSecPerStep = 60.0 * hihatBeats / bpm / hihatLeaves;

    var cycleDuration = Math.max(
      kickSecPerStep * kickLeaves,
      snareSecPerStep * snareLeaves,
      hihatSecPerStep * hihatLeaves
    );

    patTimings.push({
      pat: pat, bankIdx: bankIdx, offset: totalDuration,
      kickDef: kickDef, snareDef: snareDef, hihatDef: hihatDef,
      kickSecPerStep: kickSecPerStep, snareSecPerStep: snareSecPerStep, hihatSecPerStep: hihatSecPerStep
    });
    totalDuration += cycleDuration;
  }

  totalDuration += tail;

  // Asymptotic time-based progress estimate. OfflineAudioContext gives
  // no granular signal, so we approximate by exponential ease-in toward
  // a cap. The cap (and the final ease-to-100% below) make the apparent
  // progress reach 100% at the moment the actual render completes,
  // regardless of how accurate this estimate is on a given machine.
  var lastP = 0;
  if (typeof onProgress === 'function') {
    var renderStartT = performance.now();
    var audioTimeConst = Math.max(0.5, totalDuration * 0.05);
    progressTicker = setInterval(function() {
      var elapsed = (performance.now() - renderStartT) / 1000;
      var p = 1 - Math.exp(-elapsed / audioTimeConst);
      lastP = Math.min(0.95, p);
      onProgress(lastP);
    }, 200);
  }

  var offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

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

  var accentMode = TR.getAccentMode();
  for (var p = 0; p < patTimings.length; p++) {
    var pt = patTimings[p];
    var pat = pt.pat;

    for (var s = 0; s < pat.kick.length; s++) {
      if (pat.kick[s]) TR.audio.playKick(pt.offset + s * pt.kickSecPerStep, offCtx, offMaster);
    }
    for (var s = 0; s < pat.snare.length; s++) {
      if (pat.snare[s]) TR.audio.playSnare(pt.offset + s * pt.snareSecPerStep, offCtx, offMaster, offNoise);
    }
    for (var s = 0; s < pat.hihat.length; s++) {
      if (pat.hihat[s]) TR.audio.playHihat(pt.offset + s * pt.hihatSecPerStep, offCtx, offMaster, offNoise);
    }
    TR.audio.playAccent(accentMode, pt.offset, pt.bankIdx, offCtx, offMaster, offNoise);
  }

  var rendered = await offCtx.startRendering();
  if (progressTicker) { clearInterval(progressTicker); progressTicker = null; }

  // Cancellation only takes effect at this phase boundary — we can't
  // interrupt startRendering() itself. After this point, throwing a
  // {cancelled:true} object causes the click handler's catch to swallow
  // it silently and skip the file write entirely.
  if (token.aborted) throw { cancelled: true };

  // Smoothly ease the displayed progress from wherever the asymptotic
  // estimate left off (could be 30% on fast machines, 90% on slow ones)
  // up to 100% over a short cubic ease-out. This guarantees the user
  // visually sees the bar/text complete the journey to 100%, not just
  // snap there. ~300ms feels like a natural finish without delaying the
  // download perceptibly.
  if (typeof onProgress === 'function') {
    var fromP = lastP;
    var easeStart = performance.now();
    var easeDur = 300;
    await new Promise(function(resolve) {
      function step() {
        var k = Math.min(1, (performance.now() - easeStart) / easeDur);
        var eased = fromP + (1 - fromP) * (1 - Math.pow(1 - k, 3));
        onProgress(eased);
        if (k >= 1) resolve();
        else requestAnimationFrame(step);
      }
      step();
    });
  }

  var wavData = TR.encodeWAV(rendered);
  var blob = new Blob([wavData], { type: 'audio/wav' });
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
  a.download = ts + '_trhythm.wav';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  } finally {
    if (progressTicker) clearInterval(progressTicker);
    if (currentAudioToken === token) currentAudioToken = null;
  }
};

/* ── DL button: Video / Audio / PNG Seq choice popup ───────────────
   Click DL → toggle a small popup with three buttons below the
   .btn-row. Picking one swaps the DL button into a progress-ring
   state and runs the corresponding export pipeline:
     Video   → TR.exportVideo    (WebM via WebCodecs + webm-muxer)
     Audio   → TR.renderOffline  (WAV via OfflineAudioContext)
     PNG Seq → TR.exportPngSeq   (transparent PNG sequence ZIP)
   While an export is running, clicking DL again triggers cancel for
   whichever pipeline is active (TR.cancelExport / TR.cancelAudio /
   TR.cancelPng). Clicking outside the popup closes it. */
var dlBtn = document.getElementById('btn-download');
var choiceRow = document.getElementById('export-choice');
var btnExportVideo = document.getElementById('btn-export-video');
var btnExportAudio = document.getElementById('btn-export-audio');
var btnExportPng   = document.getElementById('btn-export-png');

// Shared progress-ring helper used by both Video and Audio paths.
// Builds the SVG ring once and returns mutators — reusing the same
// DOM nodes across updates lets the CSS transition animate smoothly.
function beginProgressUI(btn) {
  var originalHTML = btn.innerHTML;
  var R = 6;
  var CIRC = 2 * Math.PI * R;
  btn.innerHTML =
    '<svg class="btn-ring" width="14" height="14" viewBox="0 0 14 14">' +
      '<circle class="btn-ring-bg" cx="7" cy="7" r="' + R + '"></circle>' +
      '<circle class="btn-ring-fg" cx="7" cy="7" r="' + R + '" transform="rotate(-90 7 7)"></circle>' +
    '</svg>' +
    '<span class="btn-pct">0%</span>';
  var ringFg = btn.querySelector('.btn-ring-fg');
  var pctEl = btn.querySelector('.btn-pct');
  ringFg.style.strokeDasharray = CIRC;
  ringFg.style.strokeDashoffset = CIRC;
  return {
    setProgress: function(p) {
      p = Math.max(0, Math.min(1, p));
      ringFg.style.strokeDashoffset = CIRC * (1 - p);
      pctEl.textContent = Math.round(p * 100) + '%';
    },
    restore: function() {
      btn.innerHTML = originalHTML;
      btn.classList.remove('btn-cancelling');
    }
  };
}

function showCancelling(btn) {
  btn.innerHTML = '<span class="btn-pct">キャンセル中...</span>';
  btn.classList.add('btn-cancelling');
}

function closeChoice() { choiceRow.classList.remove('open'); }

dlBtn.addEventListener('click', function(e) {
  // Stop the document-level "click outside closes popup" listener from
  // immediately closing the popup we're about to open.
  e.stopPropagation();

  // Cancel-during-export: clicking DL while either pipeline is running
  // signals the in-flight render to bail. The pipeline's finally block
  // restores the button — meanwhile we surface "キャンセル中..." so the
  // user gets immediate feedback even though startRendering is opaque.
  if (TR.exportInProgress && TR.exportInProgress()) {
    if (TR.cancelExport) TR.cancelExport();
    showCancelling(dlBtn);
    return;
  }
  if (TR.audioInProgress && TR.audioInProgress()) {
    TR.cancelAudio();
    showCancelling(dlBtn);
    return;
  }
  if (TR.pngInProgress && TR.pngInProgress()) {
    TR.cancelPng();
    showCancelling(dlBtn);
    return;
  }

  // Idle: toggle the choice popup.
  choiceRow.classList.toggle('open');
});

async function runVideoExport() {
  closeChoice();
  if (!(TR.exportVideoAvailable && TR.exportVideoAvailable())) {
    alert('\u3054\u4f7f\u7528\u306e\u30d6\u30e9\u30a6\u30b6\u30fc\u3067\u306f\u52d5\u753b\u30a8\u30af\u30b9\u30dd\u30fc\u30c8\u304c\u4f7f\u3048\u307e\u305b\u3093\u3002');
    return;
  }
  var ui = beginProgressUI(dlBtn);
  try {
    await TR.exportVideo(ui.setProgress);
  } catch(err) {
    if (!err.cancelled) {
      console.error('Video export failed:', err);
      alert('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
    }
  } finally {
    ui.restore();
  }
}

async function runAudioExport() {
  closeChoice();
  var ui = beginProgressUI(dlBtn);
  try {
    await TR.renderOffline(ui.setProgress);
  } catch(err) {
    if (!err.cancelled) {
      console.error('Audio export failed:', err);
      alert('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
    }
  } finally {
    ui.restore();
  }
}

async function runPngExport() {
  closeChoice();
  if (!(TR.exportPngSeqAvailable && TR.exportPngSeqAvailable())) {
    alert('PNG\u30b7\u30fc\u30b1\u30f3\u30b9\u51fa\u529b\u306e\u30e9\u30a4\u30d6\u30e9\u30ea\u304c\u8aad\u307f\u8fbc\u307e\u308c\u3066\u3044\u307e\u305b\u3093\u3002');
    return;
  }
  var ui = beginProgressUI(dlBtn);
  try {
    await TR.exportPngSeq(ui.setProgress);
  } catch(err) {
    if (!err.cancelled) {
      console.error('PNG export failed:', err);
      alert('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + err.message);
    }
  } finally {
    ui.restore();
  }
}

btnExportVideo.addEventListener('click', function(e) {
  e.stopPropagation();
  runVideoExport();
});
btnExportAudio.addEventListener('click', function(e) {
  e.stopPropagation();
  runAudioExport();
});
btnExportPng.addEventListener('click', function(e) {
  e.stopPropagation();
  runPngExport();
});

// Close the popup if the user clicks anywhere else. The button + choice
// handlers above stopPropagation, so this only fires on outside clicks.
document.addEventListener('click', function() {
  if (choiceRow.classList.contains('open')) closeChoice();
});
})(window.TR);
