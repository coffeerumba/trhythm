(function(TR) {
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
})(window.TR);
