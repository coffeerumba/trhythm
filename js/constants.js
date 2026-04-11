/* ─── Global namespace & Constants ─── */
(function() {
window.TR = {};

/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Two-axis scoring: div (step count divisibility) + simpson (structural uniformity).
   See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── A: ★1.0 — 均一 ──
  'a-4':     { tree: [2,2], beatLevel: 1, label: '2拍子 (4ステップ, 2拍)' },
  'a-6a':    { tree: [3,3], beatLevel: 1, label: '6/8拍子 (6ステップ, 2拍)' },
  'a-6b':    { tree: [2,2,2], beatLevel: 1, label: '3拍子 (6ステップ, 3拍)' },
  'a-8':     { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート (8ステップ, 4拍)' },
  'a-9':     { tree: [3,3,3], beatLevel: 1, label: '9/8拍子 (9ステップ, 3拍)' },
  'a-12a':   { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子 (12ステップ, 4拍)' },
  'a-12b':   { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6拍子 (12ステップ, 6拍)' },
  'a-12c':   { tree: [[2,2],[2,2],[2,2]], beatLevel: 1, label: '6拍子B (12ステップ, 6拍)' },
  'a-16':    { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート (16ステップ, 4拍)' },
  'a-18':    { tree: [[3,3],[3,3],[3,3]], beatLevel: 1, label: '6拍3連 (18ステップ, 6拍)' },
  // ── B: ★0.5~0.67 — 準均一 ──
  'b-7':     { tree: [2,2,3], beatLevel: 1, label: '7/8拍子 (7ステップ, 3拍)' },
  'b-8a':    { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ (8ステップ, 3拍)' },
  'b-8b':    { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ (8ステップ, 3拍)' },
  'b-12':    { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ (12ステップ, 5拍)' },
  'b-14a':   { tree: [[2,2,3],[2,2,3]], beatLevel: 1, label: '7/8×2 (14ステップ, 6拍)' },
  'b-14b':   { tree: [[2,2],[3,3],[2,2]], beatLevel: 1, label: '8挟み6 (14ステップ, 6拍)' },
  'b-16a':   { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'トレシーロ×2 (16ステップ, 6拍)' },
  'b-16b':   { tree: [[3,3],[3,3],[2,2]], beatLevel: 1, label: '12/8+4 (16ステップ, 6拍)' },
  'b-18a':   { tree: [[3,3],[2,2,2],[3,3]], beatLevel: 1, label: 'ヘミオラ挟み (18ステップ, 7拍)' },
  'b-18b':   { tree: [[3,3],[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ後置 (18ステップ, 7拍)' },
  'b-18c':   { tree: [[2,2,2],[3,3],[2,2,2]], beatLevel: 1, label: '逆ヘミオラ挟み (18ステップ, 7拍)' },
  'b-18d':   { tree: [[2,2,2],[2,2,2],[3,3]], beatLevel: 1, label: '6拍+ヘミオラ (18ステップ, 8拍)' },
  // ── C: ★0.3~0.49 — 変拍子 ──
  'c-5':     { tree: [2,3], beatLevel: 1, label: '5/8拍子 (5ステップ, 2拍)' },
  'c-10a':   { tree: [[2,3],[2,3]], beatLevel: 1, label: '5/8×2 (10ステップ, 4拍)' },
  'c-10b':   { tree: [[2,2],[2,2,2]], beatLevel: 1, label: '4+6 (10ステップ, 5拍)' },
  'c-10c':   { tree: [[2,2],[3,3]], beatLevel: 1, label: '4+6拍 (10ステップ, 4拍)' },
  'c-15a':   { tree: [[2,3],[2,3],[2,3]], beatLevel: 1, label: '5/8×3 (15ステップ, 6拍)' },
  'c-15b':   { tree: [[2,2,2],[3,3,3]], beatLevel: 1, label: '6+9拍 (15ステップ, 5拍)' },
  'c-17':    { tree: [[2,2],[2,2],[3,3,3]], beatLevel: 1, label: '4+4+9 (17ステップ, 7拍)' },
  'c-19':    { tree: [[2,2,2],[2,2,2],[2,2,3]], beatLevel: 1, label: '6+6+7 (19ステップ, 8拍)' },
  'c-20a':   { tree: [[[2,2],[3,3]],[[2,2],[3,3]]], beatLevel: 2, label: 'ヘミオラ×2 (20ステップ, 4拍)' },
  'c-20b':   { tree: [[[2,2],[2,2]],[[2,2],[2,2],[2,2]]], beatLevel: 2, label: '8+12 (20ステップ, 5拍)' },
  // ── D: ★<0.3 — 複合不規則 ──
  'd-9':     { tree: [[2,2],[2,3]], beatLevel: 1, label: '4+5拍 (9ステップ, 4拍)' },
  'd-11':    { tree: [[2,2,2],[2,3]], beatLevel: 1, label: '6+5拍 (11ステップ, 4拍)' },
  'd-13':    { tree: [[2,2],[2,2],[2,3]], beatLevel: 1, label: '4+4+5 (13ステップ, 6拍)' },
  'd-14':    { tree: [[3,3],[2,3,3]], beatLevel: 1, label: '6+8拍 (14ステップ, 5拍)' },
  'd-17':    { tree: [[2,2,2],[2,2],[3,3,3]], beatLevel: 1, label: '6+4+9 (17ステップ, 7拍)' },
  'd-18':    { tree: [[[2,2],[2,3]],[[2,2],[2,3]]], beatLevel: 2, label: '(4+5)×2 (18ステップ, 4拍)' },
  'd-20':    { tree: [[[2,2],[2,2]],[[2,2],[2,3]]], beatLevel: 2, label: '8+(4+5) (17ステップ, 4拍)' }
};

TR.PATTERN_COUNT = 16;
TR.INSTRUMENTS = ['kick', 'snare', 'hihat'];
TR.SCHEDULER_LOOKAHEAD = 0.1;
TR.SCHEDULER_INTERVAL = 25;

TR.STRUCT_GROUPS = [
  { prefix: 'a-', label: '\u2605 1.0 \u2014 \u5747\u4e00' },
  { prefix: 'b-', label: '\u2605 0.5\uff5e \u2014 \u6e96\u5747\u4e00' },
  { prefix: 'c-', label: '\u2605 0.3\uff5e \u2014 \u5909\u62cd\u5b50' },
  { prefix: 'd-', label: '\u2605 <0.3 \u2014 \u8907\u5408\u4e0d\u898f\u5247' }
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

/* ─── State ─── */
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

/* ─── Tree utility functions ─── */
TR.flattenTree = function(node) {
  if (!Array.isArray(node)) return [node];
  var result = [];
  for (var i = 0; i < node.length; i++)
    result = result.concat(TR.flattenTree(node[i]));
  return result;
};

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

TR.countLeaves = function(node) {
  if (!Array.isArray(node)) return node;
  var count = 0;
  for (var i = 0; i < node.length; i++) count += TR.countLeaves(node[i]);
  return count;
};

TR.getGroupBoundaries = function(structure) {
  var boundaries = {};
  var pos = 0;
  for (var i = 0; i < structure.length; i++) {
    if (i > 0) boundaries[pos] = true;
    pos += TR.countLeaves(structure[i]);
  }
  return boundaries;
};

TR.computeBeats = function(def) {
  var levels = TR.computeLevels(def.tree);
  var beats = 0;
  for (var i = 0; i < levels.length; i++) {
    if (levels[i] >= def.beatLevel) beats++;
  }
  return beats;
};
})();
