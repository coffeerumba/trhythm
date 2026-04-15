/* ─── Global namespace & Constants ─── */
(function() {
window.TR = {};

/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Two-axis scoring: div (step count divisibility) + simpson (structural uniformity).
   See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── 西洋標準拍子 ──
  '2beat':       { tree: [2,2], beatLevel: 1, label: '2拍子 (steps=4, beats=2)' },
  '6-8':         { tree: [3,3], beatLevel: 1, label: '6/8拍子 (steps=6, beats=2)' },
  '3beat':       { tree: [2,2,2], beatLevel: 1, label: '3拍子 / Waltz (steps=6, beats=3)' },
  '8beat':       { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート (steps=8, beats=4)' },
  '9-8':         { tree: [3,3,3], beatLevel: 1, label: '9/8拍子 (steps=9, beats=3)' },
  '12-8':        { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子 (steps=12, beats=4)' },
  '6-4':         { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6/4拍子 (steps=12, beats=6)' },
  '6beatB':      { tree: [[2,2],[2,2],[2,2]], beatLevel: 1, label: '6拍子B (steps=12, beats=6)' },
  '16beat':      { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート (steps=16, beats=4)' },
  '18-8':        { tree: [[3,3],[3,3],[3,3]], beatLevel: 1, label: '18/8 (steps=18, beats=6)' },
  '18-8B':       { tree: [[3,3,3],[3,3,3]], beatLevel: 1, label: '18/8B (steps=18, beats=6)' },
  // ── アフロキューバン系 ──
  'tresillo':    { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ (steps=8, beats=3)' },
  'revtresillo': { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ (steps=8, beats=3)' },
  'sonclave':    { tree: [3,2,3], beatLevel: 1, label: 'Son clave前半型 (steps=8, beats=3)' },
  'tresillox2':  { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'ダブルトレシーロ (steps=16, beats=6)' },
  'hemiola':     { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ (steps=12, beats=5)' },
  // ── バルカン・トルコ系変拍子 ──
  'paydushko':   { tree: [2,3], beatLevel: 1, label: '5/8 Paydushko (steps=5, beats=2)' },
  'paydushkoR':  { tree: [3,2], beatLevel: 1, label: '5/8逆 (steps=5, beats=2)' },
  'rachenitsa':  { tree: [2,2,3], beatLevel: 1, label: '7/8 Rachenitsa (steps=7, beats=3)' },
  'lesnoto':     { tree: [3,2,2], beatLevel: 1, label: '7/8 Lesnoto / Rupak (steps=7, beats=3)' },
  'chetvorno':   { tree: [2,3,2], beatLevel: 1, label: '7/8 Chetvorno (steps=7, beats=3)' },
  // ── 反復・複合系 ──
  'revhemiola':  { tree: [[2,2,2],[3,3]], beatLevel: 1, label: '逆ヘミオラ (steps=12, beats=5)' },
  '5-8x2':       { tree: [[2,3],[2,3]], beatLevel: 1, label: '5/8×2 (steps=10, beats=4)' },
  '7-8x2':       { tree: [[2,2,3],[2,2,3]], beatLevel: 1, label: '7/8×2 (steps=14, beats=6)' },
  '5-8x3':       { tree: [[2,3],[2,3],[2,3]], beatLevel: 1, label: '5/8×3 (steps=15, beats=6)' },
  'hemiolax2':   { tree: [[[2,2],[3,3]],[[2,2],[3,3]]], beatLevel: 2, label: 'ヘミオラ×2 (steps=20, beats=4)' },
  '8plus12':     { tree: [[[2,2],[2,2]],[[2,2],[2,2],[2,2]]], beatLevel: 2, label: '8+12 ポリメトリック (steps=20, beats=5)' }
};

TR.PATTERN_COUNT = 16;
TR.INSTRUMENTS = ['kick', 'snare', 'hihat'];
TR.SCHEDULER_LOOKAHEAD = 0.1;
TR.SCHEDULER_INTERVAL = 25;

TR.STRUCT_GROUPS = [
  { prefix: '西洋標準拍子', keys: ['2beat','6-8','3beat','8beat','9-8','12-8','6-4','6beatB','16beat','18-8','18-8B'] },
  { prefix: 'アフロキューバン系', keys: ['tresillo','revtresillo','sonclave','tresillox2','hemiola'] },
  { prefix: 'バルカン・トルコ系変拍子', keys: ['paydushko','paydushkoR','rachenitsa','lesnoto','chetvorno'] },
  { prefix: '反復・複合系', keys: ['revhemiola','5-8x2','7-8x2','5-8x3','hemiolax2','8plus12'] }
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
