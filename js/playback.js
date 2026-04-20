(function(TR) {
/* ═══ Cursor ═══ */
TR.showInstCursor = function(gridId, step, patternIdx) {
  var el = document.getElementById(gridId);
  if (!el) return;
  var dots = el.querySelectorAll('.grid-step');
  for (var i = 0; i < dots.length; i++) dots[i].classList.remove('cursor-on');
  // Only show cursor when the track is on the currently-displayed pattern.
  // For async tracks on a different pattern, we leave the cursor off (no visual lie).
  var onDisplayed = (patternIdx === undefined) || (patternIdx === TR.state.currentPattern);
  if (onDisplayed && dots[step]) dots[step].classList.add('cursor-on');
  // Visualizer hook fires on actual hits regardless of whether cursor is shown
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

TR.loadPatternForPlayback = function(idx) {
  TR.state.currentPattern = idx;
  var pat = TR.state.patterns[idx];
  TR.state.kickFlat = pat.kick;
  TR.state.snareFlat = pat.snare;
  TR.state.hihatFlat = pat.hihat;

  TR.renderAllGrids(pat);

  var btns = document.getElementById('pattern-bank').children;
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', i === idx);

  document.getElementById('empty-msg').style.display = 'none';
  document.getElementById('pattern-display').style.display = '';
};

/* ─── Find longest cycle track index ─── */
function findLongestTrack(bpm) {
  var longestIdx = 0;
  var longestCycle = 0;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    var ip = TR.state.instPlayback[i];
    var cycle = 60.0 * ip.beats / bpm;
    if (cycle > longestCycle) { longestCycle = cycle; longestIdx = i; }
  }
  return longestIdx;
}

TR.startPlayback = async function() {
  if (!TR.state.toneStarted) {
    await Tone.start();
    TR.state.toneStarted = true;
    TR.audio.init();
  }

  var firstIdx = TR.state.patterns[TR.state.currentPattern] ? TR.state.currentPattern : TR.findNextPatternIndex(TR.state.currentPattern);
  if (firstIdx < 0) return;
  if (firstIdx !== TR.state.currentPattern) TR.loadPatternForPlayback(firstIdx);

  var bpm = parseInt(document.getElementById('bpm').value);
  var now = Tone.now() + 0.05;

  var curPat = TR.state.patterns[TR.state.currentPattern];
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    var ip = TR.state.instPlayback[i];
    var defKey = ip.key + 'Def';
    var def = curPat[defKey];
    var levels = TR.computeLevels(def.tree);
    var leaves = levels.length;
    var beatsKey = ip.key + 'Beats';
    var beats = curPat[beatsKey];
    var cycle = 60.0 * beats / bpm;
    ip.currentPattern = TR.state.currentPattern;  // per-track pattern index
    ip.step = 0;
    ip.count = leaves;
    ip.beats = beats;
    ip.secPerStep = cycle / leaves;
    ip.nextTime = now;
  }

  var longestIdx = findLongestTrack(bpm);

  function scheduler() {
    var lookAhead = Tone.now() + TR.SCHEDULER_LOOKAHEAD;

    for (var i = 0; i < TR.state.instPlayback.length; i++) {
      var ip = TR.state.instPlayback[i];
      while (ip.nextTime < lookAhead) {
        // Open hihat at cycle start of longest track (primary)
        if (i === longestIdx && ip.step === 0) {
          TR.audio.playOpenHihat(ip.nextTime);
        }
        // Per-track flat lookup from this track's own currentPattern
        var pat = TR.state.patterns[ip.currentPattern];
        var flat = pat ? pat[ip.key] : null;
        if (flat && flat[ip.step]) ip.play(ip.nextTime);
        var delay = Math.max(0, (ip.nextTime - Tone.now()) * 1000);
        (function(gridId, step, patternIdx) {
          setTimeout(function() { TR.showInstCursor(gridId, step, patternIdx); }, delay);
        })(ip.gridId, ip.step, ip.currentPattern);
        ip.nextTime += ip.secPerStep;
        ip.step = (ip.step + 1) % ip.count;
        // Per-track pattern advance when this track completes its own cycle
        if (ip.step === 0) {
          var nextIdx = TR.findNextPatternIndex(ip.currentPattern);
          if (nextIdx >= 0) {
            ip.currentPattern = nextIdx;
            // Only the primary (longest) track drives the UI refresh.
            // Non-primary tracks advance silently; their cursors are suppressed
            // while they're off the displayed pattern.
            if (i === longestIdx) {
              // Delay UI refresh to coincide with the new pattern's step 0 audio
              // time, so the old pattern stays displayed until its last step sounds.
              // The -1 ms margin ensures the refresh wins the race against the
              // cursor-show(0) setTimeout that shares the same target time.
              var updateDelay = Math.max(0, (ip.nextTime - Tone.now()) * 1000 - 1);
              (function(idx, d) {
                setTimeout(function() { TR.loadPatternForPlayback(idx); }, d);
              })(nextIdx, updateDelay);
            }
          }
        }
      }
    }
    TR.state.schedulerTimer = setTimeout(scheduler, TR.SCHEDULER_INTERVAL);
  }
  scheduler();
  TR.state.isPlaying = true;
  TR.updatePlayBtn();
};

TR.stopPlayback = function() {
  if (TR.state.schedulerTimer !== null) { clearTimeout(TR.state.schedulerTimer); TR.state.schedulerTimer = null; }
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
    if (TR.state.patterns[i]) list.push(TR.state.patterns[i]);
  }
  return list;
};

TR.renderOffline = async function() {
  var pats = TR.collectPatternsForRender();
  if (pats.length === 0) return;

  var bpm = parseInt(document.getElementById('bpm').value);
  var sampleRate = 44100;
  var startOffset = 0.01;
  var tail = 0.5;

  var totalDuration = startOffset;
  var patTimings = [];
  for (var p = 0; p < pats.length; p++) {
    var pat = pats[p];
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
      pat: pat, offset: totalDuration,
      kickDef: kickDef, snareDef: snareDef, hihatDef: hihatDef,
      kickSecPerStep: kickSecPerStep, snareSecPerStep: snareSecPerStep, hihatSecPerStep: hihatSecPerStep
    });
    totalDuration += cycleDuration;
  }

  totalDuration += tail;

  var offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  var offMaster = offCtx.createGain();
  offMaster.gain.value = 6.0;
  var offLimiter = offCtx.createDynamicsCompressor();
  offLimiter.threshold.value = -1;
  offLimiter.knee.value = 0;
  offLimiter.ratio.value = 20;
  offLimiter.attack.value = 0.001;
  offLimiter.release.value = 0.02;
  offMaster.connect(offLimiter);
  offLimiter.connect(offCtx.destination);

  var sr = offCtx.sampleRate;
  var nLen = sr * 2;
  var offNoise = offCtx.createBuffer(1, nLen, sr);
  var nData = offNoise.getChannelData(0);
  for (var i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;

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
    TR.audio.playOpenHihat(pt.offset, offCtx, offMaster, offNoise);
  }

  var rendered = await offCtx.startRendering();
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
};

document.getElementById('btn-download').addEventListener('click', async function() {
  try {
    await TR.renderOffline();
  } catch(e) {
    console.error('Download failed:', e);
    alert('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + e.message);
  }
});
})(window.TR);
