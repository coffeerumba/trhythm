/* ═══ Global namespace ═══ */
(function() {
window.TR = {};

/* ═══ Constants ═══ */
/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Two-axis scoring: div (step count divisibility) + simpson (structural uniformity).
   See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── 西洋標準拍子 ──
  '2beat':       { tree: [2,2], beatLevel: 1, label: '2拍子 (4ステップ, 2拍)' },
  '6-8':         { tree: [3,3], beatLevel: 1, label: '6/8拍子 (6ステップ, 2拍)' },
  '3beat':       { tree: [2,2,2], beatLevel: 1, label: '3拍子 / Waltz (6ステップ, 3拍)' },
  '8beat':       { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート (8ステップ, 4拍)' },
  '9-8':         { tree: [3,3,3], beatLevel: 1, label: '9/8拍子 (9ステップ, 3拍)' },
  '12-8':        { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子 (12ステップ, 4拍)' },
  '6-4':         { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6/4拍子 (12ステップ, 6拍)' },
  '6beatB':      { tree: [[2,2],[2,2],[2,2]], beatLevel: 1, label: '6拍子B (12ステップ, 6拍)' },
  '16beat':      { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート (16ステップ, 4拍)' },
  '18-8':        { tree: [[3,3],[3,3],[3,3]], beatLevel: 1, label: '18/8 (18ステップ, 6拍)' },
  // ── アフロキューバン系 ──
  'tresillo':    { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ 3+3+2 (8ステップ, 3拍)' },
  'revtresillo': { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ 2+3+3 (8ステップ, 3拍)' },
  'sonclave':    { tree: [3,2,3], beatLevel: 1, label: 'Son clave前半型 3+2+3 (8ステップ, 3拍)' },
  'tresillox2':  { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'ダブルトレシーロ (16ステップ, 6拍)' },
  'hemiola':     { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ (12ステップ, 5拍)' },
  '10-8':        { tree: [[3,3],[2,2]], beatLevel: 1, label: '10/8 拡張トレシーロ 3+3+2+2 (10ステップ, 4拍)' },
  '10-8R':       { tree: [[2,2],[3,3]], beatLevel: 1, label: '10/8 逆拡張トレシーロ 2+2+3+3 (10ステップ, 4拍)' },
  // ── バルカン・トルコ系変拍子 ──
  'paydushko':   { tree: [2,3], beatLevel: 1, label: '5/8 Paydushko 2+3 (5ステップ, 2拍)' },
  'paydushkoR':  { tree: [3,2], beatLevel: 1, label: '5/8逆 3+2 (5ステップ, 2拍)' },
  'rachenitsa':  { tree: [2,2,3], beatLevel: 1, label: '7/8 Rachenitsa 2+2+3 (7ステップ, 3拍)' },
  'lesnoto':     { tree: [3,2,2], beatLevel: 1, label: '7/8 Lesnoto / Rupak 3+2+2 (7ステップ, 3拍)' },
  'chetvorno':   { tree: [2,3,2], beatLevel: 1, label: '7/8 Chetvorno 2+3+2 (7ステップ, 3拍)' },
  'aksak9':      { tree: [[2,2],[2,3]], beatLevel: 1, label: '9/8 アクサク 2+2+2+3 (9ステップ, 4拍)' },
  // ── 反復・複合系 ──
  'revhemiola':  { tree: [[2,2,2],[3,3]], beatLevel: 1, label: '逆ヘミオラ (12ステップ, 5拍)' },
  '5-8x2':       { tree: [[2,3],[2,3]], beatLevel: 1, label: '5/8×2 (10ステップ, 4拍)' },
  '7-8x2':       { tree: [[2,2,3],[2,2,3]], beatLevel: 1, label: '7/8×2 (14ステップ, 6拍)' },
  '5-8x3':       { tree: [[2,3],[2,3],[2,3]], beatLevel: 1, label: '5/8×3 (15ステップ, 6拍)' },
  'hemiolax2':   { tree: [[[2,2],[3,3]],[[2,2],[3,3]]], beatLevel: 2, label: 'ヘミオラ×2 (20ステップ, 4拍)' },
  '8plus12':     { tree: [[[2,2],[2,2]],[[2,2],[2,2],[2,2]]], beatLevel: 2, label: '8+12 ポリメトリック (20ステップ, 5拍)' }
};

TR.PATTERN_COUNT = 16;
TR.INSTRUMENTS = ['kick', 'snare', 'hihat'];
TR.SCHEDULER_LOOKAHEAD = 0.1;
TR.SCHEDULER_INTERVAL = 25;

/* Instrument colors as RGB arrays (mirrors --kick/snare/hihat-color in style.css). */
TR.INST_COLORS = {
  kick:  [208, 48, 80],
  snare: [34, 119, 204],
  hihat: [85, 153, 85]
};
TR.rgbCSS = function(arr) { return 'rgb(' + arr[0] + ',' + arr[1] + ',' + arr[2] + ')'; };

TR.STRUCT_GROUPS = [
  { prefix: '西洋標準拍子', keys: ['2beat','6-8','3beat','8beat','9-8','12-8','6-4','6beatB','16beat','18-8'] },
  { prefix: 'アフロキューバン系', keys: ['tresillo','revtresillo','sonclave','tresillox2','hemiola','10-8','10-8R'] },
  { prefix: 'バルカン・トルコ系変拍子', keys: ['paydushko','paydushkoR','rachenitsa','lesnoto','chetvorno','aksak9'] },
  { prefix: '反復・複合系（上級）', keys: ['revhemiola','5-8x2','7-8x2','5-8x3','hemiolax2','8plus12'] }
];

TR.buildStructOptions = function(includeDefault) {
  var html = '';
  if (includeDefault) {
    html += '<option value="default" selected>\u65e2\u5b9a</option>';
  }
  for (var g = 0; g < TR.STRUCT_GROUPS.length; g++) {
    var group = TR.STRUCT_GROUPS[g];
    html += '<optgroup label="' + group.prefix + '">';
    for (var k = 0; k < group.keys.length; k++) {
      var key = group.keys[k];
      var s = TR.STRUCTURES[key];
      if (s) html += '<option value="' + key + '">' + s.label + '</option>';
    }
    html += '</optgroup>';
  }
  return html;
};

/* ═══ Runtime state ═══ */
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
  customStructures: { default: null, kick: null, snare: null, hihat: null },
  instPlayback: [
    { key: 'kick',  gridId: 'grid-kick',  getFlat: function() { return TR.state.kickFlat; },  play: null },
    { key: 'snare', gridId: 'grid-snare', getFlat: function() { return TR.state.snareFlat; }, play: null },
    { key: 'hihat', gridId: 'grid-hihat', getFlat: function() { return TR.state.hihatFlat; }, play: null }
  ]
};

document.documentElement.style.setProperty('--pattern-count', TR.PATTERN_COUNT);

/* ═══ Pure helper functions (tree structure utilities) ═══ */
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
