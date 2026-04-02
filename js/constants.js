(function() {
/* ═══ Global namespace & Constants ═══ */
window.TR = {};

/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Score = 1/(cellTypes x spanRatio). See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── ★1.0 — Pure (cellTypes=1, spanRatio=1.0) ──
  'p-4':     { tree: [2,2], beatLevel: 1, label: '2拍子 (4ステップ, 2拍)' },
  'p-6a':    { tree: [3,3], beatLevel: 1, label: '6/8拍子 (6ステップ, 2拍)' },
  'p-6b':    { tree: [2,2,2], beatLevel: 1, label: '3拍子 (6ステップ, 3拍)' },
  'p-8':     { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート (8ステップ, 4拍)' },
  'p-9':     { tree: [3,3,3], beatLevel: 1, label: '9/8拍子 (9ステップ, 3拍)' },
  'p-12a':   { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子 (12ステップ, 4拍)' },
  'p-12b':   { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6拍子 (12ステップ, 6拍)' },
  'p-12c':   { tree: [[2,2],[2,2],[2,2]], beatLevel: 1, label: '6拍子B (12ステップ, 6拍)' },
  'p-16':    { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート (16ステップ, 4拍)' },
  'p-18a':   { tree: [[3,3,3],[3,3,3]], beatLevel: 1, label: '6拍3連 (18ステップ, 6拍)' },
  'p-18b':   { tree: [[3,3],[3,3],[3,3]], beatLevel: 1, label: '6拍3連B (18ステップ, 6拍)' },
  'p-18c':   { tree: [[2,2,2],[2,2,2],[2,2,2]], beatLevel: 1, label: '9拍子 (18ステップ, 9拍)' },
  // ── ★0.67 — Uneven (cellTypes=1, spanRatio=1.5) ──
  'u-5a':    { tree: [2,3], beatLevel: 1, label: '5/8(2+3) (5ステップ, 2拍)' },
  'u-5b':    { tree: [3,2], beatLevel: 1, label: '5/8(3+2) (5ステップ, 2拍)' },
  'u-7a':    { tree: [2,2,3], beatLevel: 1, label: '7/8(2+2+3) (7ステップ, 3拍)' },
  'u-7c':    { tree: [3,2,2], beatLevel: 1, label: '7/8(3+2+2) (7ステップ, 3拍)' },
  'u-8a':    { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ (8ステップ, 3拍)' },
  'u-8b':    { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ (8ステップ, 3拍)' },
  'u-10a':   { tree: [[2,3],[2,3]], beatLevel: 1, label: '10/8(2+3) ×2 (10ステップ, 4拍)' },
  'u-16a':   { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'トレシーロ ×2 (16ステップ, 6拍)' },
  'u-20a':   { tree: [[[2,2],[2,2]],[[2,2],[2,2],[2,2]]], beatLevel: 2, label: '4+6拍子 (20ステップ, 5拍)' },
  // ── ★0.5 — Mixed balanced (cellTypes=2, spanRatio=1.0) ──
  'm-12a':   { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ (12ステップ, 5拍)' },
  'm-12b':   { tree: [[2,2,2],[3,3]], beatLevel: 1, label: '逆ヘミオラ (12ステップ, 5拍)' },
  'm-18':    { tree: [[3,3],[2,2,2],[3,3]], beatLevel: 1, label: 'ヘミオラ挟み (18ステップ, 7拍)' },
  // ── ★0.33 — Mixed uneven (cellTypes=2, spanRatio=1.5) ──
  'x-9':     { tree: [[2,2],[2,3]], beatLevel: 1, label: '4+5拍 (9ステップ, 4拍)' },
  'x-10a':   { tree: [[2,2],[3,3]], beatLevel: 1, label: '4+6拍 (10ステップ, 4拍)' },
  'x-10b':   { tree: [[3,3],[2,2]], beatLevel: 1, label: '6+4拍 (10ステップ, 4拍)' },
  'x-10c':   { tree: [[2,2],[2,2,2]], beatLevel: 1, label: '4+6拍B (10ステップ, 5拍)' },
  'x-14':    { tree: [[3,3],[2,3,3]], beatLevel: 1, label: '6+8拍 (14ステップ, 5拍)' },
  'x-15':    { tree: [[3,3],[3,3,3]], beatLevel: 1, label: '6+9拍 (15ステップ, 5拍)' },
  'x-16a':   { tree: [[3,3,3],[2,2,3]], beatLevel: 1, label: '9+7拍 (16ステップ, 6拍)' },
  'x-16b':   { tree: [[3,3],[3,3],[2,2]], beatLevel: 1, label: '6+6+4拍 (16ステップ, 6拍)' }
};

TR.PATTERN_COUNT = 16;
TR.INSTRUMENTS = ['kick', 'snare', 'hihat'];
TR.SCHEDULER_LOOKAHEAD = 0.1;
TR.SCHEDULER_INTERVAL = 25;

TR.STRUCT_GROUPS = [
  { prefix: 'p-', label: '\u2605 1.0 \u2014 \u5747\u4e00' },
  { prefix: 'u-', label: '\u2605 0.67 \u2014 \u4e0d\u5747\u4e00' },
  { prefix: 'm-', label: '\u2605 0.5 \u2014 \u6df7\u5408\u5747\u4e00' },
  { prefix: 'x-', label: '\u2605 0.33 \u2014 \u6df7\u5408\u4e0d\u5747\u4e00' }
];

TR.buildStructOptions = function(includeDefault) {
  var html = '';
  if (includeDefault) {
    html += '<option value="default" selected>\u65e2\u5b9a</option>';
  }
  for (var g = 0; g < TR.STRUCT_GROUPS.length; g++) {
    var group = TR.STRUCT_GROUPS[g];
    html += '<optgroup label="' + group.label + '">';
    for (var key in TR.STRUCTURES) {
      if (key.indexOf(group.prefix) === 0) {
        var s = TR.STRUCTURES[key];
        html += '<option value="' + key + '">' + s.label + '</option>';
      }
    }
    html += '</optgroup>';
  }
  return html;
};

/* ═══ State ═══ */
TR.state = {
  patterns: new Array(TR.PATTERN_COUNT).fill(null),
  currentPattern: 0,
  kickFlat: null,
  snareFlat: null,
  hihatFlat: null,
  isPlaying: false,
  schedulerTimer: null,
  toneStarted: false,
  masterGain: null,
  noiseBuffer: null,
  instPlayback: [
    { key: 'kick',  gridId: 'grid-kick',  getFlat: function() { return TR.state.kickFlat; },  play: null },
    { key: 'snare', gridId: 'grid-snare', getFlat: function() { return TR.state.snareFlat; }, play: null },
    { key: 'hihat', gridId: 'grid-hihat', getFlat: function() { return TR.state.hihatFlat; }, play: null }
  ]
};

document.documentElement.style.setProperty('--pattern-count', TR.PATTERN_COUNT);

/* ═══ Tree utilities ═══ */
/* ─── Flatten tree to array ─── */
TR.flattenTree = function(node) {
  if (!Array.isArray(node)) return [node];
  var result = [];
  for (var i = 0; i < node.length; i++)
    result = result.concat(TR.flattenTree(node[i]));
  return result;
};

/* ─── Compute levels for display ─── */
TR.computeLevels = function(structure) {
  var levels = [];
  function walk(node) {
    if (!Array.isArray(node)) {
      var firstIdx = levels.length;
      for (var j = 0; j < node; j++) levels.push(0);
      if (node > 1) levels[firstIdx] += 1;
      return;
    }
    for (var i = 0; i < node.length; i++) {
      var firstIdx = levels.length;
      walk(node[i]);
      if (i === 0) levels[firstIdx] += 1;
    }
  }
  walk(structure);
  return levels;
};

/* ─── Count leaves in a tree node ─── */
TR.countLeaves = function(node) {
  if (!Array.isArray(node)) return node;
  var count = 0;
  for (var i = 0; i < node.length; i++) count += TR.countLeaves(node[i]);
  return count;
};

/* ─── Compute group boundaries from top-level structure ─── */
TR.getGroupBoundaries = function(structure) {
  var boundaries = {};
  var pos = 0;
  for (var i = 0; i < structure.length; i++) {
    if (i > 0) boundaries[pos] = true;
    pos += TR.countLeaves(structure[i]);
  }
  return boundaries;
};

/* ─── Compute beats from beatLevel ─── */
TR.computeBeats = function(def) {
  var levels = TR.computeLevels(def.tree);
  var beats = 0;
  for (var i = 0; i < levels.length; i++) {
    if (levels[i] >= def.beatLevel) beats++;
  }
  return beats;
};
})();
