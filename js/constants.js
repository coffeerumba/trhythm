/* ─── Global namespace & Constants ─── */
(function() {
window.TR = {};

/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Two-axis scoring: div (step count divisibility) + simpson (structural uniformity).
   See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── 定番拍子・均一構造 (div≥1/3, simpson≥1/3) ──
  '2beat':       { tree: [2,2], beatLevel: 1, label: '2拍子: steps=4, beats=2, div=1, simp=1' },
  '6-8':         { tree: [3,3], beatLevel: 1, label: '6/8拍子: steps=6, beats=2, div=0.63, simp=1' },
  '3beat':       { tree: [2,2,2], beatLevel: 1, label: '3拍子: steps=6, beats=3, div=0.63, simp=1' },
  '8beat':       { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート: steps=8, beats=4, div=1, simp=1' },
  '9-8':         { tree: [3,3,3], beatLevel: 1, label: '9/8拍子: steps=9, beats=3, div=0.4, simp=1' },
  '12-8':        { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子: steps=12, beats=4, div=0.73, simp=1' },
  '6beat':       { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6拍子: steps=12, beats=6, div=0.73, simp=1' },
  '6beatB':      { tree: [[2,2],[2,2],[2,2]], beatLevel: 1, label: '6拍子B: steps=12, beats=6, div=0.73, simp=1' },
  '16beat':      { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート: steps=16, beats=4, div=1, simp=1' },
  '6-8x3':       { tree: [[3,3],[3,3],[3,3]], beatLevel: 1, label: '6/8×3: steps=18, beats=6, div=0.54, simp=1' },
  'hemiola':     { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ: steps=12, beats=5, div=0.73, simp=0.5' },
  'tresillox2':  { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'トレシーロ×2: steps=16, beats=6, div=1, simp=0.78' },
  'hemiolax2':   { tree: [[[2,2],[3,3]],[[2,2],[3,3]]], beatLevel: 2, label: 'ヘミオラ×2: steps=20, beats=8, div=0.46, simp=0.75' },
  'tresillo':    { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ: steps=8, beats=3, div=1, simp=0.33' },
  'revtresillo': { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ: steps=8, beats=3, div=1, simp=0.33' },
  '8plus12':     { tree: [[[2,2],[2,2]],[[2,2],[2,2],[2,2]]], beatLevel: 2, label: '8+12: steps=20, beats=10, div=0.46, simp=0.56' },
  '4-5x2':       { tree: [[[2,2],[2,3]],[[2,2],[2,3]]], beatLevel: 2, label: '(4+5)×2: steps=18, beats=8, div=0.54, simp=0.63' },
  // ── 定番拍子・変則構造 (div≥1/3, simpson<1/3) ──
  '4plus5':      { tree: [[2,2],[2,3]], beatLevel: 1, label: '4+5: steps=9, beats=4, div=0.4, simp=0.25' },
  '4plus8':      { tree: [[2,2],[2,3,3]], beatLevel: 1, label: '4+8: steps=12, beats=4, div=0.73, simp=0.33' },
  '8-3layer':    { tree: [[2,2,3],[2,2],[2,3]], beatLevel: 1, label: '7+4+5: steps=16, beats=9, div=1, simp=0.22' },
  '7plus5plus6': { tree: [[2,2,3],[2,3],[3,3]], beatLevel: 1, label: '7+5+6: steps=18, beats=7, div=0.54, simp=0.22' },
  // ── 変拍子・均一構造 (div<1/3, simpson≥1/3) ──
  '5-8x2':       { tree: [[2,3],[2,3]], beatLevel: 1, label: '5/8×2: steps=10, beats=4, div=0.3, simp=0.67' },
  '7-8x2':       { tree: [[2,2,3],[2,2,3]], beatLevel: 1, label: '7/8×2: steps=14, beats=6, div=0.26, simp=0.78' },
  '5-8x3':       { tree: [[2,3],[2,3],[2,3]], beatLevel: 1, label: '5/8×3: steps=15, beats=6, div=0.16, simp=0.75' },
  '4plus6':      { tree: [[2,2],[3,3]], beatLevel: 1, label: '4+6: steps=10, beats=4, div=0.3, simp=0.5' },
  '4plus6B':     { tree: [[2,2],[2,2,2]], beatLevel: 1, label: '4+6B: steps=10, beats=5, div=0.3, simp=0.5' },
  '4x2plus6':    { tree: [[2,2],[2,2],[3,3]], beatLevel: 1, label: '4+4+6: steps=14, beats=6, div=0.26, simp=0.6' },
  '4plus9':      { tree: [[2,2],[3,3,3]], beatLevel: 1, label: '4+9: steps=13, beats=4, div=0, simp=0.5' },
  '6plus5plus6': { tree: [[3,3],[2,3],[3,3]], beatLevel: 1, label: '6+5+6: steps=17, beats=6, div=0, simp=0.4' },
  '6plus9':      { tree: [[2,2,2],[3,3,3]], beatLevel: 1, label: '6+9: steps=15, beats=5, div=0.16, simp=0.5' },
  '6plus8':      { tree: [[3,3],[2,3,3]], beatLevel: 1, label: '6+8: steps=14, beats=5, div=0.26, simp=0.33' },
  // ── 変拍子・変則構造 (div<1/3, simpson<1/3) ──
  '5-8':         { tree: [2,3], beatLevel: 1, label: '5/8拍子: steps=5, beats=2, div=0, simp=0' },
  '7-8':         { tree: [2,2,3], beatLevel: 1, label: '7/8拍子: steps=7, beats=3, div=0, simp=0.33' },
  '6plus5':      { tree: [[2,2,2],[2,3]], beatLevel: 1, label: '6+5: steps=11, beats=4, div=0, simp=0.25' },
  '4x2plus5':    { tree: [[2,2],[2,2],[2,3]], beatLevel: 1, label: '4+4+5: steps=13, beats=6, div=0, simp=0.4' },
  '9plus5':      { tree: [[3,3,3],[2,3]], beatLevel: 1, label: '9+5: steps=14, beats=4, div=0.26, simp=0.25' }
};

TR.PATTERN_COUNT = 16;
TR.INSTRUMENTS = ['kick', 'snare', 'hihat'];
TR.SCHEDULER_LOOKAHEAD = 0.1;
TR.SCHEDULER_INTERVAL = 25;

TR.STRUCT_GROUPS = [
  { prefix: '定番拍子・均一構造', keys: ['2beat','6-8','3beat','8beat','tresillo','revtresillo','9-8','12-8','6beat','6beatB','hemiola','16beat','tresillox2','6-8x3','4-5x2','hemiolax2','8plus12'] },
  { prefix: '定番拍子・変則構造', keys: ['4plus5','4plus8','8-3layer','7plus5plus6'] },
  { prefix: '変拍子・均一構造', keys: ['5-8x2','4plus6','4plus6B','4plus9','7-8x2','4x2plus6','6plus8','5-8x3','6plus9','6plus5plus6'] },
  { prefix: '変拍子・変則構造', keys: ['5-8','7-8','6plus5','4x2plus5','9plus5'] }
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
