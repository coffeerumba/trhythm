(function(TR) {
/* ═══ UI Helpers ═══ */
/* ─── Help popup toggle ─── */
TR.toggleHelp = function(btn) {
  var group = btn.closest('.param-group');
  if (group) {
    var popup = group.querySelector('.help-popup');
    if (popup) popup.classList.toggle('open');
  }
};

/* ─── UI Helpers ─── */
TR.getParam = function(inst, param) {
  var el = document.getElementById(inst + '-' + param);
  return parseFloat(el.value);
};

/* ─── Slider value display ─── */
TR.setupSlider = function(id) {
  var slider = document.getElementById(id);
  var display = document.getElementById(id + '-val');
  slider.addEventListener('input', function() {
    display.textContent = parseFloat(slider.value).toFixed(2);
  });
};

/* ─── Per-instrument structure helper ─── */
TR.getInstStructure = function(inst) {
  var key = document.getElementById(inst + '-struct').value;
  if (key === 'default') key = document.getElementById('default-struct').value;
  return TR.STRUCTURES[key];
};

/* ─── Update beats select for an instrument ─── */
TR.updateBeatsSelect = function(inst) {
  var def = TR.getInstStructure(inst);
  var naturalBeats = TR.computeBeats(def);
  var sel = document.getElementById(inst + '-beats');
  var defaultBeats = TR.computeBeats(TR.STRUCTURES[document.getElementById('default-struct').value]);

  if (naturalBeats === defaultBeats) {
    sel.innerHTML = '<option value="' + defaultBeats + '" selected>\u540c\u671f</option>';
    sel.disabled = true;
  } else {
    sel.innerHTML = '<option value="' + defaultBeats + '" selected>\u540c\u671f</option>' +
                    '<option value="' + naturalBeats + '">\u975e\u540c\u671f</option>';
    sel.disabled = false;
  }
};

TR.updateAllBeatsSelects = function() {
  TR.updateBeatsSelect('kick');
  TR.updateBeatsSelect('snare');
  TR.updateBeatsSelect('hihat');
};

/* ═══ Grid ═══ */
/* ─── Render all 3 grids with polymetric width scaling ─── */
TR.renderAllGrids = function(pat) {
  if (!pat) return;

  var tracks = [
    { id: 'grid-kick', flat: pat.kick, cls: 'on-kick', def: pat.kickDef, beats: pat.kickBeats },
    { id: 'grid-snare', flat: pat.snare, cls: 'on-snare', def: pat.snareDef, beats: pat.snareBeats },
    { id: 'grid-hihat', flat: pat.hihat, cls: 'on-hihat', def: pat.hihatDef, beats: pat.hihatBeats }
  ];

  // Find max beats across all tracks (the widest track fills 100%)
  var maxBeats = 0;
  for (var t = 0; t < tracks.length; t++) {
    if (tracks[t].beats > maxBeats) maxBeats = tracks[t].beats;
  }

  for (var t = 0; t < tracks.length; t++) {
    var tr = tracks[t];
    var boundaries = TR.getGroupBoundaries(tr.def.tree);
    var stepsPerBeat = tr.flat.length / tr.beats;
    // Total columns = maxBeats * stepsPerBeat (pads shorter tracks with empty columns)
    var totalCols = maxBeats * stepsPerBeat;

    var el = document.getElementById(tr.id);
    var html = '';
    for (var i = 0; i < tr.flat.length; i++) {
      var cls = tr.flat[i] ? 'grid-step ' + tr.cls : 'grid-step';
      var barStyle = boundaries[i] ? ' style="border-left:3px solid var(--border)"' : '';
      html += '<div class="step-cell"><span class="' + cls + '"' + barStyle + '></span></div>';
    }
    el.innerHTML = html;
    el.style.gridTemplateColumns = 'repeat(' + totalCols + ', 1fr)';
  }
};

/* ═══ Instrument UI ═══ */
(function() {
/* ─── Dynamically generate instrument sections ─── */
var container = document.getElementById('instruments-container');
var instruments = [
  { key: 'kick',  label: 'Kick' },
  { key: 'snare', label: 'Snare' },
  { key: 'hihat', label: 'HiHat' }
];

var helpTexts = {
  struct: '\u697d\u5668\u3054\u3068\u306b\u62cd\u69cb\u9020\u3092\u5909\u3048\u3089\u308c\u307e\u3059\u3002\u300c\u65e2\u5b9a\u300d\u3092\u9078\u3076\u3068\u65e2\u5b9a\u62cd\u69cb\u9020\u3092\u4f7f\u3044\u307e\u3059\u3002\u7570\u306a\u308b\u62cd\u69cb\u9020\u3092\u9078\u3076\u3068\u62cd\u6570\u304c\u5909\u308f\u308a\u3001\u300c\u975e\u540c\u671f\u300d\u3067\u30dd\u30ea\u30e1\u30fc\u30bf\u30fc\u518d\u751f\u304c\u3067\u304d\u307e\u3059\u3002',
  rate: '\u5404\u30b9\u30c6\u30c3\u30d7\u3092\u9cf4\u3089\u3059\u304b\u3069\u3046\u304b\u306e\u78ba\u7387\u3067\u3059\u3002\u5168\u30b9\u30c6\u30c3\u30d7\u306b\u5bfe\u3057\u3066\u72ec\u7acb\u306b\u30b3\u30a4\u30f3\u30c8\u30b9\u3059\u308b\u306e\u3067\u3001\u540c\u3058\u8a2d\u5b9a\u3067\u3082\u751f\u6210\u306e\u305f\u3073\u306b\u7d50\u679c\u304c\u5909\u308f\u308a\u307e\u3059\u30020\u306a\u3089\u5168\u30df\u30e5\u30fc\u30c8\u30010.5\u306a\u3089\u5e73\u5747\u3057\u3066\u62cd\u6570\u3076\u3093\u9cf4\u308a\u30011\u306a\u3089\u5168\u30b9\u30c6\u30c3\u30d7\u304c\u9cf4\u308a\u307e\u3059\u3002',
  center: '\u97f3\u3092\u9cf4\u3089\u3059\u4f4d\u7f6e\u306e\u50be\u5411\u3092\u6c7a\u3081\u307e\u3059\u30020\u3067\u6700\u3082\u5f37\u3044\u62cd\uff081\u62cd\u76ee\u306a\u3069\uff09\u306b\u96c6\u4e2d\u3057\u30011\u3067\u6700\u3082\u5f31\u3044\u62cd\uff08\u88cf\u62cd\uff09\u306b\u96c6\u4e2d\u3057\u307e\u3059\u30020.5\u306f\u305d\u306e\u4e2d\u9593\u3067\u3001\u62cd\u30ec\u30d9\u30eb\u306e\u4f4d\u7f6e\u3092\u30d4\u30fc\u30af\u306b\u8868\u62cd\u5074\u3082\u88cf\u62cd\u5074\u3082\u5747\u7b49\u306b\u843d\u3061\u307e\u3059\u3002',
  fidelity: '\u62cd\u69cb\u9020\u306b\u3069\u308c\u3060\u3051\u5fe0\u5b9f\u306b\u30d1\u30bf\u30fc\u30f3\u3092\u751f\u6210\u3059\u308b\u304b\u3092\u6c7a\u3081\u307e\u3059\u30021\u3060\u3068\u91cd\u307f\u306e\u9ad8\u3044\u4f4d\u7f6e\u304b\u3089\u9806\u306b\u78ba\u5b9f\u306b\u9078\u3070\u308c\u30010\u3060\u3068\u3069\u306e\u4f4d\u7f6e\u304c\u9078\u3070\u308c\u308b\u304b\u5b8c\u5168\u306b\u30e9\u30f3\u30c0\u30e0\u306b\u306a\u308a\u307e\u3059\u3002\u4e2d\u9593\u5024\u3067\u307b\u3069\u3088\u3044\u63fa\u3089\u304e\u304c\u751f\u307e\u308c\u307e\u3059\u3002'
};

for (var i = 0; i < instruments.length; i++) {
  var inst = instruments[i];
  var defaults = TR.INST_DEFAULTS[inst.key];
  var section = document.createElement('div');
  section.className = 'inst-section';

  var selectedAttr16 = (inst.key !== 'kick') ? '' : '';

  section.innerHTML =
    '<div class="inst-header ' + inst.key + '">' + inst.label + '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u62cd\u69cb\u9020<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<select id="' + inst.key + '-struct" class="struct-select">' +
        TR.buildStructOptions(true) +
      '</select>' +
      '<select id="' + inst.key + '-beats" class="beats-select" disabled>' +
        '<option value="4" selected>4\u62cd</option>' +
      '</select>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.struct + '</div>' +
    '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u6253\u7387<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="' + inst.key + '-rate" min="0" max="1" step="0.01" value="' + defaults.rate.toFixed(2) + '">' +
      '<span class="param-value" id="' + inst.key + '-rate-val">' + defaults.rate.toFixed(2) + '</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.rate + '</div>' +
    '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u91cd\u5fc3<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="' + inst.key + '-center" min="0" max="1" step="0.01" value="' + defaults.center.toFixed(2) + '">' +
      '<span class="param-value" id="' + inst.key + '-center-val">' + defaults.center.toFixed(2) + '</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.center + '</div>' +
    '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u5fe0\u5b9f\u5ea6<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="' + inst.key + '-fidelity" min="0" max="1" step="0.01" value="' + defaults.fidelity.toFixed(2) + '">' +
      '<span class="param-value" id="' + inst.key + '-fidelity-val">' + defaults.fidelity.toFixed(2) + '</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.fidelity + '</div>' +
    '</div>' +
    '<div class="prob-chart" id="prob-' + inst.key + '"></div>';

  container.appendChild(section);

  TR.setupSlider(inst.key + '-rate');
  TR.setupSlider(inst.key + '-fidelity');
  TR.setupSlider(inst.key + '-center');
}
})();

/* ═══ Probability Chart ═══ */
/* ─── Probability visualization ─── */
TR.renderProbChart = function(inst) {
  var def = TR.getInstStructure(inst);
  var levels = TR.computeLevels(def.tree);
  var center = TR.getParam(inst, 'center');
  var rate = TR.getParam(inst, 'rate');
  var boundaries = TR.getGroupBoundaries(def.tree);
  var N = levels.length;

  var maxLevel = 0;
  var beatsCount = 0;
  for (var i = 0; i < N; i++) {
    if (levels[i] > maxLevel) maxLevel = levels[i];
    if (levels[i] >= def.beatLevel) beatsCount++;
  }
  var target;
  if (center <= 0.5) {
    target = maxLevel - center * 2 * (maxLevel - def.beatLevel);
  } else {
    target = def.beatLevel * (1 - center) * 2;
  }
  var weights = [];
  for (var i = 0; i < N; i++) {
    weights.push(maxLevel - Math.abs(levels[i] - target));
  }

  var fidelity = TR.getParam(inst, 'fidelity');

  var p;
  if (rate <= 0.5) {
    p = rate * 2 * beatsCount / N;
  } else {
    var base = beatsCount / N;
    p = base + (rate - 0.5) * 2 * (1 - base);
  }
  var expectedHits = Math.round(N * p);

  var ranked = [];
  for (var i = 0; i < N; i++) ranked.push(i);
  ranked.sort(function(a, b) { return weights[b] - weights[a] || a - b; });
  var hitSet = {};
  for (var i = 0; i < expectedHits && i < N; i++) hitSet[ranked[i]] = true;

  var instColors = {
    kick:  [208, 48, 80],
    snare: [34, 119, 204],
    hihat: [85, 153, 85]
  };
  var mutedRGB = [187, 187, 187];
  var instRGB = instColors[inst];

  var uniformBlend = expectedHits / N;

  var maxWeight = 0;
  for (var i = 0; i < N; i++) {
    if (weights[i] > maxWeight) maxWeight = weights[i];
  }

  var BAR_MAX = 60;
  var el = document.getElementById('prob-' + inst);
  var html = '';
  for (var i = 0; i < N; i++) {
    var bar = boundaries[i] ? ' bar-line' : '';
    var h = maxWeight > 0 ? Math.round(weights[i] / maxWeight * BAR_MAX) : 1;
    if (h < 1) h = 1;
    var hard = hitSet[i] ? 1 : 0;
    var blend = fidelity * hard + (1 - fidelity) * uniformBlend;
    var r = Math.round(mutedRGB[0] + (instRGB[0] - mutedRGB[0]) * blend);
    var g = Math.round(mutedRGB[1] + (instRGB[1] - mutedRGB[1]) * blend);
    var b = Math.round(mutedRGB[2] + (instRGB[2] - mutedRGB[2]) * blend);
    html += '<div class="prob-bar-wrap' + bar + '">' +
      '<div class="prob-bar" style="height:' + h + 'px;background:rgb(' + r + ',' + g + ',' + b + ')"></div>' +
      '<span class="prob-level">' + (hitSet[i] ? '*' : '&nbsp;') + '</span>' +
      '</div>';
  }
  el.innerHTML = html;
};

TR.renderAllProbCharts = function() {
  TR.renderProbChart('kick');
  TR.renderProbChart('snare');
  TR.renderProbChart('hihat');
};

/* ─── Prob chart event listeners ─── */
for (var ii = 0; ii < TR.INSTRUMENTS.length; ii++) {
  (function(inst) {
    document.getElementById(inst + '-rate').addEventListener('input', function() {
      TR.renderProbChart(inst);
    });
    document.getElementById(inst + '-fidelity').addEventListener('input', function() {
      TR.renderProbChart(inst);
    });
    document.getElementById(inst + '-center').addEventListener('input', function() {
      TR.renderProbChart(inst);
    });
    document.getElementById(inst + '-struct').addEventListener('change', function() {
      TR.renderProbChart(inst);
      TR.updateBeatsSelect(inst);
    });
  })(TR.INSTRUMENTS[ii]);
}

/* ═══ Tree Visualization ═══ */
/* ─── Tree visualization (tournament bracket) ─── */
TR.renderTreeViz = function() {
  var key = document.getElementById('default-struct').value;
  var def = TR.STRUCTURES[key];
  var maxDepth = 0;
  function getMaxDepth(node, d) {
    if (!Array.isArray(node)) { if (d > maxDepth) maxDepth = d; return; }
    for (var i = 0; i < node.length; i++) getMaxDepth(node[i], d + 1);
  }
  getMaxDepth(def.tree, 0);

  var beatColorDepth = maxDepth - def.beatLevel + 1;
  function structLabel(node, depth) {
    if (!Array.isArray(node)) {
      if (depth === beatColorDepth) {
        return '<span style="color:var(--accent)">' + node + '</span>';
      }
      return String(node);
    }
    var inner = '';
    for (var i = 0; i < node.length; i++) {
      if (i > 0) inner += ',';
      inner += structLabel(node[i], depth + 1);
    }
    if (depth === beatColorDepth) {
      return '<span style="color:var(--accent)">[</span>' + inner + '<span style="color:var(--accent)">]</span>';
    }
    return '[' + inner + ']';
  }
  document.getElementById('tree-struct-label').innerHTML = structLabel(def.tree, 0);

  var el = document.getElementById('tree-viz');
  var colors = ['#666', '#888', '#aaa', '#bbb', '#ccc'];
  var levels = TR.computeLevels(def.tree);
  var leafIdx = 0;

  function build(node, depth) {
    var color = (depth === beatColorDepth && depth < maxDepth) ? 'var(--accent)' : colors[depth % colors.length];
    if (!Array.isArray(node)) {
      var cells = '';
      for (var j = 0; j < node; j++) {
        var isBeat = levels[leafIdx] >= def.beatLevel;
        cells += '<div class="tv-leaf' + (isBeat ? ' beat' : '') + '">' +
                 levels[leafIdx] + '</div>';
        leafIdx++;
      }
      return '<div class="tv-leaves">' + cells + '</div>';
    }
    var arms = '';
    for (var i = 0; i < node.length; i++) {
      arms += '<div class="tv-arm">' + build(node[i], depth + 1) + '</div>';
    }
    return '<div class="tv-fork" style="--fc:' + color + '">' +
           '<div class="tv-arms">' + arms + '</div></div>';
  }

  el.innerHTML = build(def.tree, 0);
};

/* ─── Prev/Next structure navigation ─── */
TR.navigateStruct = function(delta) {
  var sel = document.getElementById('default-struct');
  var options = sel.options;
  var idx = sel.selectedIndex;
  var newIdx = idx + delta;
  if (newIdx < 0) newIdx = options.length - 1;
  if (newIdx >= options.length) newIdx = 0;
  sel.selectedIndex = newIdx;
  sel.dispatchEvent(new Event('change'));
  document.getElementById('btn-generate').click();
};

/* ─── Default structure change ─── */
document.getElementById('default-struct').addEventListener('change', function() {
  TR.renderAllProbCharts();
  TR.renderTreeViz();
  TR.updateAllBeatsSelects();
  document.getElementById('btn-generate').click();
});

document.getElementById('struct-prev').addEventListener('click', function() { TR.navigateStruct(-1); });
document.getElementById('struct-next').addEventListener('click', function() { TR.navigateStruct(1); });

/* ─── Populate default-struct select dynamically ─── */
var defSel = document.getElementById('default-struct');
defSel.innerHTML = TR.buildStructOptions(false);
defSel.value = 'p-16';

/* ─── Initial render ─── */
TR.renderAllProbCharts();
TR.renderTreeViz();
TR.updateAllBeatsSelects();

/* ═══ Repeat Map ═══ */
TR.updateRepeatMap = function(key) {
  var chunkRatio = parseFloat(document.getElementById('rf-chunk-' + key).value);
  var bias = parseFloat(document.getElementById('rf-bias-' + key).value);
  var result = genRepeat(TR.PATTERN_COUNT, chunkRatio, bias);
  var cells = document.getElementById('rf-blocks-' + key).children;
  for (var i = 0; i < cells.length; i++) {
    cells[i].textContent = result.indexes[i];
  }
};

/* ─── Repeat Map UI ─── */
(function() {
  var body = document.getElementById('repeat-map-body');

  var instruments = [
    { key: 'kick', label: 'K', defaultBias: 0.5 },
    { key: 'snare', label: 'S', defaultBias: 0.25 },
    { key: 'hihat', label: 'H', defaultBias: 0 }
  ];
  for (var i = 0; i < instruments.length; i++) {
    var inst = instruments[i];

    // Label
    var header = document.createElement('div');
    header.className = 'grid-label ' + inst.key;
    header.style.cssText = 'margin-top:10px; margin-bottom:6px;';
    header.textContent = inst.label;
    body.appendChild(header);

    // chunkRatio slider
    var chunkRow = document.createElement('div');
    chunkRow.className = 'param-row';
    chunkRow.innerHTML =
      '<span class="param-label">chunkRatio</span>' +
      '<input type="range" id="rf-chunk-' + inst.key + '" min="0" max="1" step="' + (1 / TR.PATTERN_COUNT) + '" value="' + (1 / TR.PATTERN_COUNT) + '" style="flex:1;">' +
      '<span class="param-value" id="rf-chunk-val-' + inst.key + '">' + (1 / TR.PATTERN_COUNT).toFixed(4) + '</span>';
    body.appendChild(chunkRow);

    // bias slider
    var biasRow = document.createElement('div');
    biasRow.className = 'param-row';
    biasRow.innerHTML =
      '<span class="param-label">bias</span>' +
      '<input type="range" id="rf-bias-' + inst.key + '" min="-1" max="1" step="0.01" value="' + inst.defaultBias + '" style="flex:1;">' +
      '<span class="param-value" id="rf-bias-val-' + inst.key + '">' + inst.defaultBias.toFixed(2) + '</span>';
    body.appendChild(biasRow);

    // Number blocks (0 ~ PATTERN_COUNT - 1)
    var blockRow = document.createElement('div');
    blockRow.className = 'pattern-bank';
    blockRow.id = 'rf-blocks-' + inst.key;
    blockRow.style.cssText = 'grid-template-columns: repeat(' + TR.PATTERN_COUNT + ', 36px); margin-top:4px;';
    for (var n = 0; n < TR.PATTERN_COUNT; n++) {
      var cell = document.createElement('span');
      cell.textContent = n;
      blockRow.appendChild(cell);
    }
    body.appendChild(blockRow);

    // Wire up sliders
    (function(key) {
      var chunkSlider = document.getElementById('rf-chunk-' + key);
      var chunkVal = document.getElementById('rf-chunk-val-' + key);
      chunkSlider.addEventListener('input', function() {
        chunkVal.textContent = parseFloat(this.value).toFixed(2);
        TR.updateRepeatMap(key);
      });

      var biasSlider = document.getElementById('rf-bias-' + key);
      var biasVal = document.getElementById('rf-bias-val-' + key);
      biasSlider.addEventListener('input', function() {
        biasVal.textContent = parseFloat(this.value).toFixed(2);
        TR.updateRepeatMap(key);
      });

      TR.updateRepeatMap(key);
    })(inst.key);
  }
})();

TR.getRepeatMapIndexes = function(key) {
  var cells = document.getElementById('rf-blocks-' + key).children;
  var indexes = [];
  for (var i = 0; i < cells.length; i++) indexes.push(parseInt(cells[i].textContent));
  return indexes;
};

/* ─── Apply repeat map to saved patterns ─── */
TR.applyRepeatMap = function() {
  var kickIdx = TR.getRepeatMapIndexes('kick');
  var snareIdx = TR.getRepeatMapIndexes('snare');
  var hihatIdx = TR.getRepeatMapIndexes('hihat');
  var pats = TR.state.patterns;

  for (var i = 0; i < TR.PATTERN_COUNT; i++) {
    if (!pats[i]) continue;
    if (kickIdx[i] !== i && pats[kickIdx[i]]) {
      pats[i].kick = pats[kickIdx[i]].kick.slice();
      pats[i].kickDef = pats[kickIdx[i]].kickDef;
      pats[i].kickBeats = pats[kickIdx[i]].kickBeats;
    }
    if (snareIdx[i] !== i && pats[snareIdx[i]]) {
      pats[i].snare = pats[snareIdx[i]].snare.slice();
      pats[i].snareDef = pats[snareIdx[i]].snareDef;
      pats[i].snareBeats = pats[snareIdx[i]].snareBeats;
    }
    if (hihatIdx[i] !== i && pats[hihatIdx[i]]) {
      pats[i].hihat = pats[hihatIdx[i]].hihat.slice();
      pats[i].hihatDef = pats[hihatIdx[i]].hihatDef;
      pats[i].hihatBeats = pats[hihatIdx[i]].hihatBeats;
    }
  }

  // Update current flat arrays
  var cur = pats[TR.state.currentPattern];
  if (cur) {
    TR.state.kickFlat = cur.kick;
    TR.state.snareFlat = cur.snare;
    TR.state.hihatFlat = cur.hihat;
  }
};

})(window.TR);
