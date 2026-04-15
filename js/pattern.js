(function(TR) {
/* ─── Pattern Bank UI ─── */
(function() {
  var bank = document.getElementById('pattern-bank');
  for (var i = 0; i < TR.PATTERN_COUNT; i++) {
    var btn = document.createElement('button');
    btn.textContent = i;
    btn.dataset.index = i;
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', function() {
      var idx = parseInt(this.dataset.index);
      if (idx === TR.state.currentPattern) return;
      TR.switchPattern(idx);
    });
    bank.appendChild(btn);
  }
})();

TR.switchPattern = function(idx) {
  // Save current flat data back (in case of click-toggling etc.)
  var curPat = TR.state.patterns[TR.state.currentPattern];
  if (curPat && TR.state.kickFlat) {
    curPat.kick = TR.state.kickFlat;
    curPat.snare = TR.state.snareFlat;
    curPat.hihat = TR.state.hihatFlat;
  }

  TR.state.currentPattern = idx;

  var btns = document.getElementById('pattern-bank').children;
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', i === idx);
  }

  var pat = TR.state.patterns[idx];
  if (pat) {
    TR.state.kickFlat = pat.kick;
    TR.state.snareFlat = pat.snare;
    TR.state.hihatFlat = pat.hihat;

    TR.renderAllGrids(pat);

    document.getElementById('empty-msg').style.display = 'none';
    document.getElementById('pattern-display').style.display = '';
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-download').disabled = false;
  } else {
    TR.state.kickFlat = null; TR.state.snareFlat = null; TR.state.hihatFlat = null;
    document.getElementById('empty-msg').style.display = '';
    document.getElementById('pattern-display').style.display = 'none';
    document.getElementById('btn-play').disabled = true;
    document.getElementById('btn-download').disabled = true;
  }

  if (TR.state.isPlaying) {
    TR.stopPlayback();
    if (TR.state.kickFlat) TR.startPlayback();
    else TR.state.isPlaying = false;
  }
};

TR.updatePatternBankIndicators = function() {
  var btns = document.getElementById('pattern-bank').children;
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('has-data', TR.state.patterns[i] !== null);
  }
};

/* ─── Generate ─── */
TR.generateForSlot = function(slotIndex) {
  var kickDef = TR.getInstStructure('kick');
  var snareDef = TR.getInstStructure('snare');
  var hihatDef = TR.getInstStructure('hihat');

  var kFlat = TR.flattenTree(generateRhythm(kickDef.tree, kickDef.beatLevel, TR.getParam('kick', 'rate'), TR.getParam('kick', 'center'), TR.getParam('kick', 'fidelity')));
  var sFlat = TR.flattenTree(generateRhythm(snareDef.tree, snareDef.beatLevel, TR.getParam('snare', 'rate'), TR.getParam('snare', 'center'), TR.getParam('snare', 'fidelity')));
  var hFlat = TR.flattenTree(generateRhythm(hihatDef.tree, hihatDef.beatLevel, TR.getParam('hihat', 'rate'), TR.getParam('hihat', 'center'), TR.getParam('hihat', 'fidelity')));

  var kickBeats = parseInt(document.getElementById('kick-beats').value);
  var snareBeats = parseInt(document.getElementById('snare-beats').value);
  var hihatBeats = parseInt(document.getElementById('hihat-beats').value);
  var defaultStructKey = document.getElementById('default-struct').value;
  var defaultDef = TR.STRUCTURES[defaultStructKey];

  TR.state.patterns[slotIndex] = {
    kick: kFlat, snare: sFlat, hihat: hFlat,
    kickDef: kickDef, snareDef: snareDef, hihatDef: hihatDef,
    kickBeats: kickBeats, snareBeats: snareBeats, hihatBeats: hihatBeats,
    defaultDef: defaultDef
  };

  return { kickDef: kickDef, snareDef: snareDef, hihatDef: hihatDef };
};

/* ─── Helper: set slider value + display ─── */
function setSlider(id, value) {
  var el = document.getElementById(id);
  el.value = value;
  var display = document.getElementById(id + '-val');
  if (display) display.textContent = parseFloat(value).toFixed(2);
}

/* ─── Default params (single source of truth for all defaults) ─── */
TR.setDefaultParams = function() {
  // Default structure
  document.getElementById('default-struct').value = '16beat';
  // BPM
  document.getElementById('bpm').value = 120;
  document.getElementById('bpm-val').textContent = '120';
  // Kick
  document.getElementById('kick-struct').value = 'default';
  setSlider('kick-rate', 0.50);
  setSlider('kick-center', 0.00);
  setSlider('kick-fidelity', 0.75);
  setSlider('rf-chunk-kick', 1 / TR.PATTERN_COUNT);
  setSlider('rf-bias-kick', 0.50);
  // Snare
  document.getElementById('snare-struct').value = 'default';
  setSlider('snare-rate', 0.33);
  setSlider('snare-center', 0.50);
  setSlider('snare-fidelity', 0.50);
  setSlider('rf-chunk-snare', 1 / TR.PATTERN_COUNT);
  setSlider('rf-bias-snare', 0.25);
  // Hihat
  document.getElementById('hihat-struct').value = 'default';
  setSlider('hihat-rate', 0.67);
  setSlider('hihat-center', 1.00);
  setSlider('hihat-fidelity', 0.25);
  setSlider('rf-chunk-hihat', 1 / TR.PATTERN_COUNT);
  setSlider('rf-bias-hihat', 0.00);
  // Refresh UI
  TR.renderAllProbCharts();
  TR.updateAllBeatsSelects();
  if (TR.updateMapSelection) TR.updateMapSelection();
};

document.getElementById('btn-default').addEventListener('click', function() {
  TR.setDefaultParams();
});

document.getElementById('btn-generate').addEventListener('click', function() {
  for (var i = 0; i < TR.PATTERN_COUNT; i++) TR.generateForSlot(i);
  var pat = TR.state.patterns[TR.state.currentPattern];
  TR.state.kickFlat = pat.kick; TR.state.snareFlat = pat.snare; TR.state.hihatFlat = pat.hihat;

  // Regenerate and apply repeat map
  TR.updateRepeatMap('kick');
  TR.updateRepeatMap('snare');
  TR.updateRepeatMap('hihat');
  TR.applyRepeatMap();

  TR.renderAllGrids(TR.state.patterns[TR.state.currentPattern]);

  TR.updatePatternBankIndicators();

  document.getElementById('empty-msg').style.display = 'none';
  document.getElementById('pattern-display').style.display = '';
  document.getElementById('btn-play').disabled = false;
  document.getElementById('btn-download').disabled = false;

  if (TR.state.isPlaying) {
    TR.stopPlayback();
    TR.startPlayback();
  }
});
})(window.TR);
