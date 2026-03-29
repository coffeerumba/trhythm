(function(TR) {
/* ─── BPM slider ─── */
(function() {
  var slider = document.getElementById('bpm');
  var display = document.getElementById('bpm-val');
  slider.addEventListener('input', function() {
    display.textContent = slider.value;
    if (TR.state.isPlaying) {
      var bpm = parseInt(slider.value);
      if (TR.state.treeCursor) {
        var curPat = TR.state.patterns[TR.state.currentPattern];
        var defaultDef = curPat && curPat.defaultDef ? curPat.defaultDef : TR.STRUCTURES[document.getElementById('default-struct').value];
        var dLeaves = TR.computeLevels(defaultDef.tree).length;
        var dBeats = TR.computeBeats(defaultDef);
        TR.state.treeCursor.secPerStep = 60.0 * dBeats / bpm / dLeaves;
      }
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
  TR.updateRepeatFilterHighlight(idx);

  document.getElementById('empty-msg').style.display = 'none';
  document.getElementById('pattern-display').style.display = '';
};

TR.startPlayback = async function() {
  if (!TR.state.toneStarted) {
    await Tone.start();
    TR.state.toneStarted = true;
    TR.audio.init();
  }

  TR.state.playingAllMode = TR.state.allMode;
  TR.state.useRepeatFilter = TR.state.playingAllMode && TR.state.repeatFilterEnabled;

  if (TR.state.playingAllMode) {
    var firstIdx = TR.state.patterns[TR.state.currentPattern] ? TR.state.currentPattern : TR.findNextPatternIndex(TR.state.currentPattern);
    if (firstIdx < 0) return;
    if (firstIdx !== TR.state.currentPattern) TR.loadPatternForPlayback(firstIdx);
  }

  var bpm = parseInt(document.getElementById('bpm').value);
  var now = Tone.now() + 0.05;

  var curPat = TR.state.patterns[TR.state.currentPattern];
  var defaultDef = curPat.defaultDef || TR.STRUCTURES[document.getElementById('default-struct').value];
  var defaultLeaves = TR.computeLevels(defaultDef.tree).length;
  var defaultBeats = TR.computeBeats(defaultDef);
  var defaultCycle = 60.0 * defaultBeats / bpm;
  TR.state.treeCursor = { step: 0, count: defaultLeaves, secPerStep: defaultCycle / defaultLeaves, nextTime: now };

  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    var ip = TR.state.instPlayback[i];
    var defKey = ip.key + 'Def';
    var def = curPat[defKey];
    var levels = TR.computeLevels(def.tree);
    var leaves = levels.length;
    var beatsKey = ip.key + 'Beats';
    var beats = curPat[beatsKey];
    var cycle = 60.0 * beats / bpm;
    ip.step = 0;
    ip.count = leaves;
    ip.beats = beats;
    ip.secPerStep = cycle / leaves;
    ip.nextTime = now;
    ip.flatKey = ip.key;
    if (TR.state.useRepeatFilter) {
      ip.repeatIndexes = TR.getRepeatFilterIndexes(ip.key);
      var filteredIdx = ip.repeatIndexes[TR.state.currentPattern];
      ip.currentFlat = TR.state.patterns[filteredIdx] ? TR.state.patterns[filteredIdx][ip.flatKey] : null;
    } else {
      ip.repeatIndexes = null;
      ip.currentFlat = null;
    }
  }

  var needsAdvance = false;

  function scheduler() {
    var lookAhead = Tone.now() + TR.SCHEDULER_LOOKAHEAD;

    if (needsAdvance && TR.state.playingAllMode) {
      needsAdvance = false;
      var nextIdx = TR.findNextPatternIndex(TR.state.currentPattern);
      if (nextIdx >= 0) {
        TR.loadPatternForPlayback(nextIdx);
        var bpm2 = parseInt(document.getElementById('bpm').value);
        var nextPat = TR.state.patterns[nextIdx];
        for (var j = 0; j < TR.state.instPlayback.length; j++) {
          var ip2 = TR.state.instPlayback[j];
          var defKey = ip2.key + 'Def';
          var def2 = nextPat[defKey];
          var levels2 = TR.computeLevels(def2.tree);
          var beatsKey2 = ip2.key + 'Beats';
          ip2.step = 0;
          ip2.count = levels2.length;
          ip2.beats = nextPat[beatsKey2] || TR.computeBeats(def2);
          ip2.secPerStep = 60.0 * ip2.beats / bpm2 / ip2.count;
          if (TR.state.useRepeatFilter) {
            var filteredIdx = ip2.repeatIndexes[nextIdx];
            ip2.currentFlat = TR.state.patterns[filteredIdx] ? TR.state.patterns[filteredIdx][ip2.flatKey] : null;
          }
        }
      }
    }

    while (TR.state.treeCursor.nextTime < lookAhead) {
      if (TR.state.treeCursor.step === 0) {
        TR.audio.playOpenHihat(TR.state.treeCursor.nextTime);
      }
      var delay = Math.max(0, (TR.state.treeCursor.nextTime - Tone.now()) * 1000);
      (function(step) {
        setTimeout(function() { TR.showTreeCursor(step); }, delay);
      })(TR.state.treeCursor.step);
      TR.state.treeCursor.nextTime += TR.state.treeCursor.secPerStep;
      TR.state.treeCursor.step = (TR.state.treeCursor.step + 1) % TR.state.treeCursor.count;
    }
    for (var i = 0; i < TR.state.instPlayback.length; i++) {
      var ip = TR.state.instPlayback[i];
      while (ip.nextTime < lookAhead) {
        var flat = TR.state.useRepeatFilter ? ip.currentFlat : ip.getFlat();
        if (flat && flat[ip.step]) ip.play(ip.nextTime);
        var delay = Math.max(0, (ip.nextTime - Tone.now()) * 1000);
        (function(gridId, step) {
          setTimeout(function() { TR.showInstCursor(gridId, step); }, delay);
        })(ip.gridId, ip.step);
        ip.nextTime += ip.secPerStep;
        ip.step = (ip.step + 1) % ip.count;
        if (TR.state.playingAllMode && ip.step === 0 && i === 0) {
          needsAdvance = true;
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
})(window.TR);
