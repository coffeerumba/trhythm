/* ═══ Global namespace ═══ */
(function() {
window.TR = {};

/* ═══ Constants ═══ */
/* All patterns are balanced-depth trees with 2-or-3 children per node.
   Two-axis scoring: div (step count divisibility) + simpson (structural uniformity).
   See structures.tsv for full catalog. */
TR.STRUCTURES = {
  // ── 西洋拍子 ──
  // Removed alt names (restore into the `label` string if needed):
  //   '6-8':     '6/8拍子 / ユリュック・セマイ / ダードラ'
  //   '8ビート': '8ビート / ソフヤン / ケヘルワ'
  //   '9-8':     '9/8拍子 / スリップ・ジグ'
  //   '12-8':    '12/8拍子 / 複合4拍子 / シャッフル'   (シャッフル のみ残す)
  //   '6-4':     '6/4拍子 / エクタール'
  //   '16ビート': '16ビート / ティーンタール'
  '2ビート':       { tree: [2,2], beatLevel: 1, label: '2ビート' },
  '6-8':           { tree: [3,3], beatLevel: 1, label: '6/8拍子' },
  '3ビート':       { tree: [2,2,2], beatLevel: 1, label: '3ビート / ワルツ' },
  '8ビート':       { tree: [[2,2],[2,2]], beatLevel: 1, label: '8ビート' },
  '9-8':           { tree: [3,3,3], beatLevel: 1, label: '9/8拍子' },
  '12-8':          { tree: [[3,3],[3,3]], beatLevel: 1, label: '12/8拍子 / シャッフル' },
  '6-4':           { tree: [[2,2,2],[2,2,2]], beatLevel: 1, label: '6/4拍子' },
  '16ビート':      { tree: [[[2,2],[2,2]],[[2,2],[2,2]]], beatLevel: 2, label: '16ビート' },
  // ── クラーベ・ラテン系 ──
  // Removed alt names (restore into the `label` string if needed):
  //   'トレシーロ': 'トレシーロ / ハバネラ 近似 / シンキージョ 近似'
  'トレシーロ':       { tree: [3,3,2], beatLevel: 1, label: 'トレシーロ' },
  '逆トレシーロ':     { tree: [2,3,3], beatLevel: 1, label: '逆トレシーロ' },
  'ソンクラーベ 3-2': { tree: [[3,3],[2,2],[2,2,2]], beatLevel: 1, label: 'ソン・クラーベ 3-2 近似' },
  'ソンクラーベ 2-3': { tree: [[2,2,2],[3,3],[2,2]], beatLevel: 1, label: 'ソン・クラーベ 2-3 近似' },
  'ルンバクラーベ 3-2': { tree: [[3,2,2],[3,2],[2,2]], beatLevel: 1, label: 'ルンバ・クラーベ 3-2 近似' },
  'ルンバクラーベ 2-3': { tree: [[2,2],[2,3],[2,2,3]], beatLevel: 1, label: 'ルンバ・クラーベ 2-3 近似' },
  'ボサノヴァクラーベ': { tree: [[3,3],[2,2],[3,3]], beatLevel: 1, label: 'ボサノヴァ・クラーベ 近似' },
  'カスカラ':         { tree: [[3,3,2],[3,3,2]], beatLevel: 1, label: 'ダブルトレシーロ / カスカラ 近似' },
  'ヘミオラ':         { tree: [[3,3],[2,2,2]], beatLevel: 1, label: 'ヘミオラ / ソレア・ブレリア 近似 / ベンベ 近似' },
  '逆ヘミオラ':       { tree: [[2,2,2],[3,3]], beatLevel: 1, label: '逆ヘミオラ' },
  '10-8':             { tree: [[3,3],[2,2]], beatLevel: 1, label: '拡張トレシーロ' },
  '10-8R':            { tree: [[2,2],[3,3]], beatLevel: 1, label: '逆拡張トレシーロ' },
  'siguiriyas':       { tree: [[2,2,3],[3,2]], beatLevel: 1, label: 'シギリージャ（フラメンコ）' },
  'standard_bell':    { tree: [[2,2,3],[2,3]], beatLevel: 1, label: 'スタンダード・ベル / アフロ・キー・パターン 近似' },
  // ── バルカン舞踊 ──
  // Removed alt names (restore into the `label` string if needed):
  //   'lesnoto': 'レスノト / カラマティアノス / ルパク / ミシュラ・チャプ / チェトヴォルノ'
  'paydushko':       { tree: [2,3], beatLevel: 1, label: 'パイドゥシュコ / カンダ・チャプ' },
  'paydushkoR':      { tree: [3,2], beatLevel: 1, label: '逆パイドゥシュコ' },
  'rachenitsa':      { tree: [2,2,3], beatLevel: 1, label: 'ラチェニツァ / エレノ・モメ' },
  'lesnoto':         { tree: [3,2,2], beatLevel: 1, label: 'レスノト / カラマティアノス / チェトヴォルノ' },
  'devojce':         { tree: [[2,3],[2,2]], beatLevel: 1, label: 'デヴォイチェ / グランチャルスコ' },
  'kopanitsa':       { tree: [[2,2,3],[2,2]], beatLevel: 1, label: 'コパニッツァ / ガンキノ・ホロ' },
  'krivo':           { tree: [[2,2,2],[2,3,2]], beatLevel: 1, label: 'クリヴォ・サドフスコ・ホロ' },
  'buchimish':       { tree: [[2,2,2],[2,3],[2,2]], beatLevel: 1, label: 'ブチミシュ' },
  'aksak16':         { tree: [[3,3],[3,3],[2,2]], beatLevel: 1, label: 'バルカン・アクサク' },
  'yove_male_mome':  { tree: [[3,2,2],[2,2,3],[2,2]], beatLevel: 1, label: 'ヨヴェ・マレ・モメ' },
  // ── トルコ・南アジア系 ──
  // Removed alt names (restore into the `label` string if needed):
  //   'aksak9': 'アクサク / トルコ・アクサク / ダイチョヴォ / デヴェトルカ / カルシュラマ'
  'aksak9':          { tree: [[2,2],[2,3]], beatLevel: 1, label: 'アクサク / ダイチョヴォ / カルシュラマ' },
  'aksak9R':         { tree: [[3,2],[2,2]], beatLevel: 1, label: 'アクサク逆' },
  'semai':           { tree: [[3,2],[2,3]], beatLevel: 1, label: 'アクサク・セマイ / サマーイー・サキール' },
  'jhaptal':         { tree: [[2,3],[2,3]], beatLevel: 1, label: 'ジャプタル' },
  'deepchandi':      { tree: [[3,2,2],[3,2,2]], beatLevel: 1, label: 'ディープチャンディ / チャンチャル 近似' }
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
  { prefix: '西洋拍子', keys: ['2ビート','6-8','3ビート','8ビート','9-8','12-8','6-4','16ビート'] },
  { prefix: 'クラーベ・ラテン系', keys: ['トレシーロ','逆トレシーロ','ソンクラーベ 3-2','ソンクラーベ 2-3','ルンバクラーベ 3-2','ルンバクラーベ 2-3','ボサノヴァクラーベ','カスカラ','ヘミオラ','逆ヘミオラ','10-8','10-8R','siguiriyas','standard_bell'] },
  { prefix: 'バルカン舞踊', keys: ['paydushko','paydushkoR','rachenitsa','lesnoto','devojce','kopanitsa','krivo','buchimish','aksak16','yove_male_mome'] },
  { prefix: 'トルコ・南アジア系', keys: ['aksak9','aksak9R','semai','jhaptal','deepchandi'] }
];

/* Unified display format: "(Ns, Mb) [name] [arrayJson]"
 * The name part is omitted for defs without a label (custom structures). */
TR.formatStructLabel = function(def) {
  var leaves = TR.countLeaves(def.tree);
  var beats = TR.computeBeats(def);
  var name = def.label ? def.label + ' ' : '';
  var arr = JSON.stringify(def.tree);
  return '(' + leaves + 's,' + beats + 'b) ' + name + arr;
};

TR.buildStructOptions = function(includeDefault) {
  var html = '';
  if (includeDefault) {
    html += '<option value="default" selected>\u65e2\u5b9a</option>';
  }
  for (var g = 0; g < TR.STRUCT_GROUPS.length; g++) {
    var group = TR.STRUCT_GROUPS[g];
    html += '<optgroup label="' + group.prefix + '">';
    // Sort each group by step count ascending (matches the heatmap list ordering)
    var entries = [];
    for (var k = 0; k < group.keys.length; k++) {
      var s = TR.STRUCTURES[group.keys[k]];
      if (s) entries.push({ key: group.keys[k], def: s });
    }
    entries.sort(function(a, b) { return TR.countLeaves(a.def.tree) - TR.countLeaves(b.def.tree); });
    for (var j = 0; j < entries.length; j++) {
      html += '<option value="' + entries[j].key + '">' + TR.formatStructLabel(entries[j].def) + '</option>';
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
  cancelToken: null,
  toneStarted: false,
  masterGain: null,
  noiseBuffer: null,
  customStructures: { default: null, kick: null, snare: null, hihat: null },
  instPlayback: [
    { key: 'kick',  gridId: 'grid-kick',  play: null },
    { key: 'snare', gridId: 'grid-snare', play: null },
    { key: 'hihat', gridId: 'grid-hihat', play: null }
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
