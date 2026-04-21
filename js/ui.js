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

/* ─── Structure resolver (preset or custom) ─── */
TR.resolveStructure = function(target) {
  var key = document.getElementById(target + '-struct').value;
  if (key === 'custom') return TR.state.customStructures[target];
  return TR.STRUCTURES[key];
};

/* ─── Per-instrument structure helper ─── */
TR.getInstStructure = function(inst) {
  var key = document.getElementById(inst + '-struct').value;
  if (key === 'default') return TR.resolveStructure('default');
  if (key === 'custom') return TR.state.customStructures[inst];
  return TR.STRUCTURES[key];
};

/* ─── Set a custom (or preset) structure for a target from the map list ─── */
TR.setCustomStructure = function(target, tree, beatLevel) {
  var treeStr = JSON.stringify(tree);
  var presetKey = null;
  for (var k in TR.STRUCTURES) {
    var s = TR.STRUCTURES[k];
    if (JSON.stringify(s.tree) === treeStr && s.beatLevel === beatLevel) { presetKey = k; break; }
  }
  var sel = document.getElementById(target + '-struct');
  if (presetKey) {
    sel.value = presetKey;
  } else {
    var leaves = TR.countLeaves(tree);
    var beats = TR.computeBeats({ tree: tree, beatLevel: beatLevel });
    var label = '\u30ab\u30b9\u30bf\u30e0: ' + treeStr + ' (' + leaves + '\u30b9\u30c6\u30c3\u30d7, ' + beats + '\u62cd)';
    TR.state.customStructures[target] = { tree: tree, beatLevel: beatLevel, label: label };
    var opt = sel.querySelector('option[value="custom"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = 'custom';
      sel.appendChild(opt);
    }
    opt.textContent = label;
    sel.value = 'custom';
  }
  sel.dispatchEvent(new Event('change'));
};

/* ─── Update beats select for an instrument ─── */
TR.updateBeatsSelect = function(inst) {
  var def = TR.getInstStructure(inst);
  var naturalBeats = TR.computeBeats(def);
  var sel = document.getElementById(inst + '-beats');
  var defaultBeats = TR.computeBeats(TR.resolveStructure('default'));

  // Preserve the user's previous choice across refreshes
  var wasAsync = sel.options.length > 1 && sel.selectedIndex === 1;

  if (naturalBeats === defaultBeats) {
    sel.innerHTML = '<option value="' + defaultBeats + '" selected>同期</option>';
    sel.disabled = true;
  } else {
    var syncOpt = '<option value="' + defaultBeats + '"' + (wasAsync ? '' : ' selected') + '>同期</option>';
    var asyncOpt = '<option value="' + naturalBeats + '"' + (wasAsync ? ' selected' : '') + '>非同期</option>';
    sel.innerHTML = syncOpt + asyncOpt;
    sel.disabled = false;
  }
};

TR.updateAllBeatsSelects = function() {
  TR.updateBeatsSelect('kick');
  TR.updateBeatsSelect('snare');
  TR.updateBeatsSelect('hihat');
};

/* ═══ Grid ═══ */
/* ─── Render a single track's grid ───
 * Shows exactly what the track actually plays during one virtual cycle.
 * Starting from (startPat, startStep), walk forward cellCount track-steps,
 * wrapping through findNextPatternIndex when the track's own pattern ends.
 *
 * Sync tracks: cellCount == trackSteps, snap = (displayedPat, 0) → identical
 * to the legacy one-pattern display.
 * Async tracks: cellCount may be smaller or larger than trackSteps and the
 * shown cells may span multiple of this track's own patterns.
 */
TR.renderTrackGrid = function(trackKey, startPat, startStep, cellCount) {
  var el = document.getElementById('grid-' + trackKey);
  if (!el) return;
  var pat = TR.state.patterns[startPat];
  var flat = pat[trackKey];
  var trackSteps = flat.length;
  var curPat = startPat;
  var step = startStep;
  var cls = 'on-' + trackKey;
  var html = '';
  for (var i = 0; i < cellCount; i++) {
    while (step >= trackSteps) {
      step -= trackSteps;
      var nextIdx = TR.findNextPatternIndex(curPat);
      if (nextIdx < 0) break;
      curPat = nextIdx;
      pat = TR.state.patterns[curPat];
      flat = pat[trackKey];
      trackSteps = flat.length;
    }
    var c = flat[step] ? 'grid-step ' + cls : 'grid-step';
    html += '<div class="step-cell"><span class="' + c + '"></span></div>';
    step++;
  }
  el.innerHTML = html;
  el.style.gridTemplateColumns = 'repeat(' + cellCount + ', 1fr)';
};

/* ─── Render all 3 grids ───
 * Each track gets its own cell count: N = floor(virtualBeats * trackSteps / trackBeats).
 * snaps (optional): { kick: {pat, step}, snare: ..., hihat: ... } — per-track start
 * positions captured at the virtual cycle boundary during playback. When omitted
 * (static / paused view), defaults to (currentPattern, 0) for every track.
 */
TR.renderAllGrids = function(pat, snaps) {
  var virtualBeats = TR.computeBeats(pat.defaultDef);
  var keys = ['kick', 'snare', 'hihat'];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var r = virtualBeats * pat[key].length / pat[key + 'Beats'];
    var cellCount = Math.floor(r);
    var snap = (snaps && snaps[key]) ? snaps[key] : { pat: TR.state.currentPattern, step: 0 };
    TR.renderTrackGrid(key, snap.pat, snap.step, cellCount);
  }
};

/* ═══ Instrument UI ═══ */
(function() {
/* ─── Dynamically generate instrument sections (unified) ─── */
var container = document.getElementById('instruments-container');
var instruments = [
  { key: 'kick',  label: 'Kick' },
  { key: 'snare', label: 'Snare' },
  { key: 'hihat', label: 'HiHat' }
];

var helpTexts = {
  struct: '楽器ごとに拍構造を変えられます。「既定」を選ぶと既定拍構造を使います。異なる拍構造を選ぶと拍数が変わり、「非同期」でポリメーター再生ができます。',
  rate: '\u5404\u30b9\u30c6\u30c3\u30d7\u3092\u9cf4\u3089\u3059\u304b\u3069\u3046\u304b\u306e\u78ba\u7387\u3067\u3059\u3002\u5168\u30b9\u30c6\u30c3\u30d7\u306b\u5bfe\u3057\u3066\u72ec\u7acb\u306b\u30b3\u30a4\u30f3\u30c8\u30b9\u3059\u308b\u306e\u3067\u3001\u540c\u3058\u8a2d\u5b9a\u3067\u3082\u751f\u6210\u306e\u305f\u3073\u306b\u7d50\u679c\u304c\u5909\u308f\u308a\u307e\u3059\u30020\u306a\u3089\u5168\u30df\u30e5\u30fc\u30c8\u30010.5\u306a\u3089\u5e73\u5747\u3057\u3066\u62cd\u6570\u3076\u3093\u9cf4\u308a\u30011\u306a\u3089\u5168\u30b9\u30c6\u30c3\u30d7\u304c\u9cf4\u308a\u307e\u3059\u3002',
  center: '\u97f3\u3092\u9cf4\u3089\u3059\u4f4d\u7f6e\u306e\u50be\u5411\u3092\u6c7a\u3081\u307e\u3059\u30020\u3067\u6700\u3082\u5f37\u3044\u62cd\uff081\u62cd\u76ee\u306a\u3069\uff09\u306b\u96c6\u4e2d\u3057\u30011\u3067\u6700\u3082\u5f31\u3044\u62cd\uff08\u88cf\u62cd\uff09\u306b\u96c6\u4e2d\u3057\u307e\u3059\u30020.5\u306f\u305d\u306e\u4e2d\u9593\u3067\u3001\u62cd\u30ec\u30d9\u30eb\u306e\u4f4d\u7f6e\u3092\u30d4\u30fc\u30af\u306b\u8868\u62cd\u5074\u3082\u88cf\u62cd\u5074\u3082\u5747\u7b49\u306b\u843d\u3061\u307e\u3059\u3002',
  fidelity: '\u62cd\u69cb\u9020\u306b\u3069\u308c\u3060\u3051\u5fe0\u5b9f\u306b\u30d1\u30bf\u30fc\u30f3\u3092\u751f\u6210\u3059\u308b\u304b\u3092\u6c7a\u3081\u307e\u3059\u30021\u3060\u3068\u91cd\u307f\u306e\u9ad8\u3044\u4f4d\u7f6e\u304b\u3089\u9806\u306b\u78ba\u5b9f\u306b\u9078\u3070\u308c\u30010\u3060\u3068\u3069\u306e\u4f4d\u7f6e\u304c\u9078\u3070\u308c\u308b\u304b\u5b8c\u5168\u306b\u30e9\u30f3\u30c0\u30e0\u306b\u306a\u308a\u307e\u3059\u3002\u4e2d\u9593\u5024\u3067\u307b\u3069\u3088\u3044\u63fa\u3089\u304e\u304c\u751f\u307e\u308c\u307e\u3059\u3002'
};

var section = document.createElement('div');
section.className = 'inst-section';
var html = '<div class="inst-header">\u697d\u5668\u30d1\u30e9\u30e1\u30fc\u30bf\u30fc</div>';

for (var i = 0; i < instruments.length; i++) {
  var inst = instruments[i];
  if (i > 0) html += '<hr style="border:none; border-top:2px dashed var(--border); margin:10px 0;">';
  html +=
    '<div class="inst-header ' + inst.key + '" style="font-size:16px;">' + inst.label + '</div>' +
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
      '<input type="range" id="' + inst.key + '-rate" min="0" max="1" step="0.01" value="0">' +
      '<span class="param-value" id="' + inst.key + '-rate-val">0.00</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.rate + '</div>' +
    '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u91cd\u5fc3<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="' + inst.key + '-center" min="0" max="1" step="0.01" value="0">' +
      '<span class="param-value" id="' + inst.key + '-center-val">0.00</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.center + '</div>' +
    '</div>' +
    '<div class="param-group">' +
    '<div class="param-row">' +
      '<span class="param-label">\u5fe0\u5b9f\u5ea6<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="' + inst.key + '-fidelity" min="0" max="1" step="0.01" value="0">' +
      '<span class="param-value" id="' + inst.key + '-fidelity-val">0.00</span>' +
    '</div>' +
    '<div class="help-popup">' + helpTexts.fidelity + '</div>' +
    '</div>' +
    '<div class="prob-chart" id="prob-' + inst.key + '"></div>';
}

section.innerHTML = html;
container.appendChild(section);

for (var i = 0; i < instruments.length; i++) {
  var key = instruments[i].key;
  TR.setupSlider(key + '-rate');
  TR.setupSlider(key + '-fidelity');
  TR.setupSlider(key + '-center');
}
})();

/* ═══ Probability Chart ═══ */
/* ─── Shared bar builder for any .prob-chart container ───
 * entries: [{ height: px, color: css, marker?: string, boundary?: bool }]
 */
TR.buildProbChartHTML = function(entries) {
  var html = '';
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var cls = 'prob-bar-wrap' + (e.boundary ? ' bar-line' : '');
    html += '<div class="' + cls + '">' +
      '<div class="prob-bar" style="height:' + e.height + 'px;background:' + e.color + '"></div>' +
      (e.marker !== undefined ? '<span class="prob-level">' + e.marker + '</span>' : '') +
      '</div>';
  }
  return html;
};

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

  var mutedRGB = [187, 187, 187];
  var instRGB = TR.INST_COLORS[inst];

  var uniformBlend = expectedHits / N;

  var maxWeight = 0;
  for (var i = 0; i < N; i++) {
    if (weights[i] > maxWeight) maxWeight = weights[i];
  }

  var BAR_MAX = 60;
  var entries = [];
  for (var i = 0; i < N; i++) {
    var h = maxWeight > 0 ? Math.round(weights[i] / maxWeight * BAR_MAX) : 1;
    if (h < 1) h = 1;
    var hard = hitSet[i] ? 1 : 0;
    var blend = fidelity * hard + (1 - fidelity) * uniformBlend;
    var r = Math.round(mutedRGB[0] + (instRGB[0] - mutedRGB[0]) * blend);
    var g = Math.round(mutedRGB[1] + (instRGB[1] - mutedRGB[1]) * blend);
    var b = Math.round(mutedRGB[2] + (instRGB[2] - mutedRGB[2]) * blend);
    entries.push({
      height: h,
      color: 'rgb(' + r + ',' + g + ',' + b + ')',
      marker: hitSet[i] ? '*' : '&nbsp;',
      boundary: !!boundaries[i]
    });
  }
  document.getElementById('prob-' + inst).innerHTML = TR.buildProbChartHTML(entries);
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
/**
 * Build tree visualization HTML for any tree + beatLevel.
 * Returns an HTML string using .tv-fork/.tv-arms/.tv-arm/.tv-leaves/.tv-leaf classes.
 */
TR.buildTreeHTML = function(tree, beatLevel) {
  var maxDepth = 0;
  function getMaxDepth(node, d) {
    if (!Array.isArray(node)) { if (d > maxDepth) maxDepth = d; return; }
    for (var i = 0; i < node.length; i++) getMaxDepth(node[i], d + 1);
  }
  getMaxDepth(tree, 0);

  var beatColorDepth = maxDepth - beatLevel + 1;
  var lineColor = '#888';
  var levels = TR.computeLevels(tree);
  var leafIdx = 0;

  function leafCount(node) {
    if (!Array.isArray(node)) return node;
    var s = 0;
    for (var i = 0; i < node.length; i++) s += leafCount(node[i]);
    return s;
  }

  // Recursively compute stem position as fraction [0,1] of node's total width.
  // For leaf: 0.5 (center). For fork: position of leftmost leaf's center.
  function stemFraction(node) {
    if (!Array.isArray(node)) return 0.5;
    var total = leafCount(node);
    var firstTotal = leafCount(node[0]);
    return (stemFraction(node[0]) * firstTotal) / total;
  }

  function build(node, depth) {
    var color = lineColor;
    if (!Array.isArray(node)) {
      var cells = '';
      for (var j = 0; j < node; j++) {
        var isBeat = levels[leafIdx] >= beatLevel;
        cells += '<div class="tv-leaf' + (isBeat ? ' beat' : '') + '">' +
                 levels[leafIdx] + '</div>';
        leafIdx++;
      }
      return '<div class="tv-leaves">' + cells + '</div>';
    }
    var arms = '';
    for (var i = 0; i < node.length; i++) {
      var sl = stemFraction(node[i]) * 100;
      arms += '<div class="tv-arm" style="--sl:calc(' + sl.toFixed(1) + '% - 1px)">' + build(node[i], depth + 1) + '</div>';
    }
    return '<div class="tv-fork" style="--fc:' + color + '">' +
           '<div class="tv-arms">' + arms + '</div></div>';
  }

  var rootSl = stemFraction(tree) * 100;
  return '<div class="tv-root" style="--sl:calc(' + rootSl.toFixed(1) + '% - 1px)">' + build(tree, 0) + '</div>';
};


/**
 * Post-render fix: measure actual first-leaf center position in each arm
 * and set --sl to the exact pixel value.
 */
TR.fixStemPositions = function(container) {
  // Fix arm stems
  var arms = container.querySelectorAll('.tv-arm');
  for (var i = 0; i < arms.length; i++) {
    var arm = arms[i];
    var firstLeaf = arm.querySelector('.tv-leaf');
    if (!firstLeaf) continue;
    var armRect = arm.getBoundingClientRect();
    var leafRect = firstLeaf.getBoundingClientRect();
    var stemLeft = leafRect.left + leafRect.width / 2 - armRect.left - 1;
    arm.style.setProperty('--sl', stemLeft + 'px');
  }
  // Fix root stems
  var roots = container.querySelectorAll('.tv-root');
  for (var j = 0; j < roots.length; j++) {
    var root = roots[j];
    var firstLeaf = root.querySelector('.tv-leaf');
    if (firstLeaf) {
      var rootRect = root.getBoundingClientRect();
      var leafRect = firstLeaf.getBoundingClientRect();
      var stemLeft = leafRect.left + leafRect.width / 2 - rootRect.left - 1;
      root.style.setProperty('--sl', stemLeft + 'px');
    }
  }
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
  TR.updateAllBeatsSelects();
  document.getElementById('btn-generate').click();
});

document.getElementById('struct-prev').addEventListener('click', function() { TR.navigateStruct(-1); });
document.getElementById('struct-next').addEventListener('click', function() { TR.navigateStruct(1); });

/* ─── Populate default-struct select dynamically ─── */
var defSel = document.getElementById('default-struct');
defSel.innerHTML = TR.buildStructOptions(false);

/* ─── Div × Simpson heatmap matrix ─── */
(function() {
  var canvas = document.getElementById('div-simpson-chart');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;

  if (!window.STRUCTURE_DATA) return;

  // Color constants (canvas 2D context can't read CSS variables directly)
  var COL_DEFAULT_FILL = '#ffd54f';
  var COL_DEFAULT_BORDER = '#c08800';
  var COL_SELECTED_FRAME = '#333';        // matches --surface-dark
  var COL_HOVER_FILL = 'rgba(80,80,80,0.35)';
  var COL_HOVER_BORDER = '#555';          // matches --border-strong
  var COL_CELL_FILLED = '#ccc';
  var COL_CELL_EMPTY = '#d8d8d8';         // matches --bg
  var COL_CELL_BORDER = '#b0b0b0';
  var COL_AXIS_TEXT = '#777';             // matches --text-muted
  var COL_COUNT_TEXT = '#1a1a1a';         // matches --text
  var COL_CHART_BG = '#e8e8e8';           // matches --surface

  var nCols = 10;
  var nRows = 10;
  function bin(v) {
    var b = Math.floor(v * 10);
    return b >= 10 ? 9 : b;
  }

  var allData = window.STRUCTURE_DATA; // [structure, div, simpson, leaves, ...]
  var grid, cellStructures;

  function rebuildGrid() {
    grid = [];
    cellStructures = [];
    for (var r = 0; r < nRows; r++) {
      grid[r] = [];
      cellStructures[r] = [];
      for (var c = 0; c < nCols; c++) {
        grid[r][c] = 0;
        cellStructures[r][c] = [];
      }
    }
    for (var i = 0; i < allData.length; i++) {
      var leaves = allData[i][3];
      var d = allData[i][1];
      var s = allData[i][2];
      var bc = bin(d), br = bin(s);
      grid[br][bc]++;
      cellStructures[br][bc].push({ structure: allData[i][0], leaves: leaves, beatLevel: allData[i][6] });
    }
    for (var r = 0; r < nRows; r++) {
      for (var c = 0; c < nCols; c++) {
        cellStructures[r][c].sort(function(a, b) { return a.leaves - b.leaves; });
      }
    }
  }
  rebuildGrid();

  // Layout
  var pad = { top: 20, right: 20, bottom: 50, left: 50 };
  var plotW = W - pad.left - pad.right;
  var plotH = H - pad.top - pad.bottom;
  var cellW = plotW / nCols;
  var cellH = plotH / nRows;
  var baseImage;
  var selectedCol = -1, selectedRow = -1;
  var defaultCol = -1, defaultRow = -1;

  // Lookup: structure JSON string → { col, row }
  var structCell = {};
  for (var i = 0; i < allData.length; i++) {
    structCell[allData[i][0]] = { col: bin(allData[i][1]), row: bin(allData[i][2]) };
  }

  function drawChart() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL_CHART_BG;
    ctx.fillRect(0, 0, W, H);

    for (var r = 0; r < nRows; r++) {
      for (var c = 0; c < nCols; c++) {
        var x = pad.left + c * cellW;
        var y = pad.top + (nRows - 1 - r) * cellH;
        var count = grid[r][c];
        var isSelected = (c === selectedCol && r === selectedRow);
        var isDefault = (c === defaultCol && r === defaultRow);
        ctx.fillStyle = isDefault ? COL_DEFAULT_FILL : (count > 0 ? COL_CELL_FILLED : COL_CELL_EMPTY);
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = isDefault ? COL_DEFAULT_BORDER : COL_CELL_BORDER;
        ctx.lineWidth = isDefault ? 2 : 1;
        ctx.strokeRect(x, y, cellW, cellH);
        // Selected cell: inner accent frame
        if (isSelected) {
          ctx.strokeStyle = COL_SELECTED_FRAME;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, cellW - 6, cellH - 6);
        }
        if (count > 0) {
          ctx.fillStyle = COL_COUNT_TEXT;
          ctx.font = '14px DotGothic16, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(count, x + cellW / 2, y + cellH / 2);
        }
      }
    }

    ctx.fillStyle = COL_AXIS_TEXT;
    ctx.font = '14px DotGothic16, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var c = 0; c <= nCols; c += 2) {
      ctx.fillText((c / 10).toFixed(1), pad.left + c * cellW, pad.top + plotH + 4);
    }
    ctx.fillText('\u5272\u308a\u3084\u3059\u3055', pad.left + plotW / 2, pad.top + plotH + 28);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var r = 0; r <= nRows; r += 2) {
      var y = pad.top + (nRows - r) * cellH;
      ctx.fillText((r / 10).toFixed(1), pad.left - 4, y);
    }
    ctx.save();
    ctx.font = '14px DotGothic16, sans-serif';
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u5747\u4e00\u6027', 0, 0);
    ctx.restore();

    baseImage = ctx.getImageData(0, 0, W, H);
  }
  drawChart();
  var hoverCol = -1, hoverRow = -1;

  function getCell(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = (e.clientX - rect.left) * (W / rect.width);
    var my = (e.clientY - rect.top) * (H / rect.height);
    var c = Math.floor((mx - pad.left) / cellW);
    var r = nRows - 1 - Math.floor((my - pad.top) / cellH);
    if (c < 0 || c >= nCols || r < 0 || r >= nRows) return null;
    return { col: c, row: r };
  }

  canvas.addEventListener('mousemove', function(e) {
    var cell = getCell(e);
    var c = cell ? cell.col : -1;
    var r = cell ? cell.row : -1;
    if (c === hoverCol && r === hoverRow) return;
    hoverCol = c; hoverRow = r;
    ctx.putImageData(baseImage, 0, 0);
    if (c >= 0 && r >= 0) {
      var x = pad.left + c * cellW;
      var y = pad.top + (nRows - 1 - r) * cellH;
      ctx.fillStyle = COL_HOVER_FILL;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = COL_HOVER_BORDER;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }
  });

  canvas.addEventListener('mouseleave', function() {
    hoverCol = -1; hoverRow = -1;
    ctx.putImageData(baseImage, 0, 0);
  });

  // Show structures for a given cell; optionally highlight & scroll to one
  var listDiv = document.getElementById('map-cell-list');
  function showCellList(c, r, highlightStruct) {
    var structures = cellStructures[r][c];
    if (structures.length === 0) {
      listDiv.textContent = '\u3053\u306e\u30de\u30b9\u306b\u30d1\u30bf\u30fc\u30f3\u306f\u3042\u308a\u307e\u305b\u3093';
      return;
    }
    var html = '';
    for (var i = 0; i < structures.length; i++) {
      var tree = JSON.parse(structures[i].structure);
      var isHi = structures[i].structure === highlightStruct;
      var treeAttr = structures[i].structure.replace(/"/g, '&quot;');
      html += '<div class="map-struct-row" data-hi="' + (isHi ? '1' : '0') + '" data-tree="' + treeAttr + '" data-beatlevel="' + structures[i].beatLevel + '">' +
        '<div class="map-struct-row-title">' +
          '<div class="map-struct-row-tree">' + structures[i].structure + ' (' + structures[i].leaves + '\u30b9\u30c6\u30c3\u30d7, ' + TR.computeBeats({ tree: tree, beatLevel: structures[i].beatLevel }) + '\u62cd)</div>' +
          '<div class="struct-actions">' +
            '<span class="struct-actions-label">Set as:</span>' +
            '<button class="btn-apply-struct default" data-target="default" title="\u65e2\u5b9a\u62cd\u69cb\u9020\u306b\u8a2d\u5b9a">\u65e2</button>' +
            '<button class="btn-apply-struct kick" data-target="kick" title="\u30ad\u30c3\u30af\u306e\u62cd\u69cb\u9020\u306b\u8a2d\u5b9a">K</button>' +
            '<button class="btn-apply-struct snare" data-target="snare" title="\u30b9\u30cd\u30a2\u306e\u62cd\u69cb\u9020\u306b\u8a2d\u5b9a">S</button>' +
            '<button class="btn-apply-struct hihat" data-target="hihat" title="\u30cf\u30a4\u30cf\u30c3\u30c8\u306e\u62cd\u69cb\u9020\u306b\u8a2d\u5b9a">H</button>' +
          '</div>' +
        '</div>' +
        '<div>' + TR.buildTreeHTML(tree, structures[i].beatLevel) + '</div>' +
        '</div>';
    }
    listDiv.innerHTML = html;
    TR.fixStemPositions(listDiv);
    // Scroll highlighted row into view
    var hiRow = listDiv.querySelector('.map-struct-row[data-hi="1"]');
    if (hiRow) {
      var listRect = listDiv.getBoundingClientRect();
      var rowRect = hiRow.getBoundingClientRect();
      if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
        listDiv.scrollTop += (rowRect.top - listRect.top) - 8;
      }
    }
  }

  canvas.addEventListener('click', function(e) {
    var cell = getCell(e);
    if (!cell) { listDiv.textContent = '\u30de\u30b9\u3092\u30af\u30ea\u30c3\u30af\u3059\u308b\u3068\u8a72\u5f53\u3059\u308b\u62cd\u69cb\u9020\u30d1\u30bf\u30fc\u30f3\u304c\u8868\u793a\u3055\u308c\u307e\u3059'; return; }
    selectedCol = cell.col; selectedRow = cell.row;
    // If the default structure falls in this cell, highlight its row
    var defDef = TR.resolveStructure('default');
    var hi = null;
    if (defDef && cell.col === defaultCol && cell.row === defaultRow) {
      hi = JSON.stringify(defDef.tree);
    }
    showCellList(cell.col, cell.row, hi);
    drawChart();
    hoverCol = -1; hoverRow = -1;
  });

  // When default-struct changes: move both default and selected markers to its cell
  function updateSelection() {
    var def = TR.resolveStructure('default');
    if (!def) return;
    var treeStr = JSON.stringify(def.tree);
    var cell = structCell[treeStr];
    if (!cell) {
      defaultCol = -1; defaultRow = -1;
      selectedCol = -1; selectedRow = -1;
    } else {
      defaultCol = cell.col; defaultRow = cell.row;
      selectedCol = cell.col; selectedRow = cell.row;
      showCellList(cell.col, cell.row, treeStr);
    }
    drawChart();
    hoverCol = -1; hoverRow = -1;
  }
  document.getElementById('default-struct').addEventListener('change', updateSelection);
  TR.updateMapSelection = updateSelection;

  // Delegated click handler for "apply to target" buttons in the cell list
  listDiv.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('.btn-apply-struct');
    if (!btn) return;
    var row = btn.closest('.map-struct-row');
    if (!row) return;
    var tree = JSON.parse(row.dataset.tree);
    var bl = parseInt(row.dataset.beatlevel, 10);
    TR.setCustomStructure(btn.dataset.target, tree, bl);
  });

  updateSelection();
})();

/* ═══ Repeat Map ═══ */
TR.updateRepeatMap = function(key) {
  var chunkSize = parseInt(document.getElementById('rf-chunk-' + key).value, 10);
  var bias = parseFloat(document.getElementById('rf-bias-' + key).value);
  var result = genRepeat(TR.PATTERN_COUNT, chunkSize, bias);
  var cells = document.getElementById('rf-blocks-' + key).children;
  for (var i = 0; i < cells.length; i++) {
    cells[i].textContent = result.indexes[i];
  }
  TR.renderRepeatProbChart(key);
};

/* ─── Repeat probability chart ─── */
TR.renderRepeatProbChart = function(key) {
  var el = document.getElementById('prob-repeat-' + key);
  if (!el) return;
  var chunkSize = parseInt(document.getElementById('rf-chunk-' + key).value, 10);
  var bias = parseFloat(document.getElementById('rf-bias-' + key).value);
  var res = genRepeatProbabilities(TR.PATTERN_COUNT, chunkSize, bias);
  var probs = res.probs;
  var color = TR.rgbCSS(TR.INST_COLORS[key]);
  var BAR_MAX = 60;
  var entries = [];
  for (var i = 0; i < probs.length; i++) {
    var h = Math.round(probs[i] * BAR_MAX);
    if (h < 1) h = 1;
    entries.push({ height: h, color: color });
  }
  el.innerHTML = TR.buildProbChartHTML(entries);
};

/* ─── Repeat Map UI ─── */
(function() {
  var body = document.getElementById('repeat-map-body');

  var instruments = ['kick', 'snare', 'hihat'];
  var labels = { kick: 'Kick', snare: 'Snare', hihat: 'HiHat' };
  for (var i = 0; i < instruments.length; i++) {
    var key = instruments[i];

    // Separator between instruments
    if (i > 0) {
      var hr = document.createElement('hr');
      hr.style.cssText = 'border:none; border-top:2px dashed var(--border); margin:10px 0;';
      body.appendChild(hr);
    }

    // Label
    var header = document.createElement('div');
    header.className = 'grid-label ' + key;
    header.style.cssText = 'margin-top:10px; margin-bottom:6px;';
    header.textContent = labels[key];
    body.appendChild(header);

    // chunkSize slider (integer, 1..PATTERN_COUNT)
    var chunkGroup = document.createElement('div');
    chunkGroup.className = 'param-group';
    chunkGroup.innerHTML =
      '<div class="param-row">' +
      '<span class="param-label">\u307e\u3068\u307e\u308a<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="rf-chunk-' + key + '" min="1" max="' + TR.PATTERN_COUNT + '" step="1" value="1" style="flex:1;">' +
      '<span class="param-value" id="rf-chunk-' + key + '-val">1</span>' +
      '</div>' +
      '<div class="help-popup">\u3072\u3068\u307e\u3068\u307e\u308a\u3068\u3057\u3066\u6271\u3046\u30d1\u30bf\u30fc\u30f3\u306e\u6570\u3092\u6307\u5b9a\u3057\u307e\u3059\u30021\u3060\u3068\u5404\u30d1\u30bf\u30fc\u30f3\u304c\u305d\u308c\u305e\u308c\u72ec\u7acb\u306b\u6271\u308f\u308c\u307e\u3059\u3002\u5024\u3092\u4e0a\u3052\u308b\u3068\u3001\u3088\u308a\u591a\u304f\u306e\u30d1\u30bf\u30fc\u30f3\u3092\u3072\u3068\u307e\u3068\u307e\u308a\u3068\u3057\u3066\u6271\u3044\u307e\u3059\u3002</div>';
    body.appendChild(chunkGroup);

    // bias slider
    var biasGroup = document.createElement('div');
    biasGroup.className = 'param-group';
    biasGroup.innerHTML =
      '<div class="param-row">' +
      '<span class="param-label">\u504f\u308a<button class="help-btn" onclick="TR.toggleHelp(this)">?</button></span>' +
      '<input type="range" id="rf-bias-' + key + '" min="-1" max="1" step="0.01" value="0" style="flex:1;">' +
      '<span class="param-value" id="rf-bias-' + key + '-val">0.00</span>' +
      '</div>' +
      '<div class="help-popup">\u7e70\u308a\u8fd4\u3057\u304c\u767a\u751f\u3059\u308b\u78ba\u7387\u3092\u8abf\u6574\u3057\u307e\u3059\u3002\u6b63\u306e\u5024\u3060\u3068\u7e70\u308a\u8fd4\u3057\u304c\u8d77\u304d\u3084\u3059\u304f\u306a\u308a\u3001\u8ca0\u306e\u5024\u3060\u3068\u8d77\u304d\u306b\u304f\u304f\u306a\u308a\u307e\u3059\u30020\u3067\u30c7\u30d5\u30a9\u30eb\u30c8\u306e\u78ba\u7387\u3067\u3059\u3002</div>';
    body.appendChild(biasGroup);

    // Number blocks (0 ~ PATTERN_COUNT - 1)
    var blockRow = document.createElement('div');
    blockRow.className = 'pattern-bank';
    blockRow.id = 'rf-blocks-' + key;
    blockRow.style.cssText = 'grid-template-columns: repeat(' + TR.PATTERN_COUNT + ', 36px); margin-top:4px;';
    for (var n = 0; n < TR.PATTERN_COUNT; n++) {
      var cell = document.createElement('span');
      cell.textContent = n;
      blockRow.appendChild(cell);
    }
    body.appendChild(blockRow);

    // Probability distribution chart for this track
    var probRow = document.createElement('div');
    probRow.className = 'prob-chart prob-chart-repeat';
    probRow.id = 'prob-repeat-' + key;
    body.appendChild(probRow);

    // Wire up sliders
    (function(key) {
      var chunkSlider = document.getElementById('rf-chunk-' + key);
      var chunkVal = document.getElementById('rf-chunk-' + key + '-val');
      chunkSlider.addEventListener('input', function() {
        chunkVal.textContent = this.value;
        TR.updateRepeatMap(key);
      });

      var biasSlider = document.getElementById('rf-bias-' + key);
      var biasVal = document.getElementById('rf-bias-' + key + '-val');
      biasSlider.addEventListener('input', function() {
        biasVal.textContent = parseFloat(this.value).toFixed(2);
        TR.updateRepeatMap(key);
      });

    })(key);
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
