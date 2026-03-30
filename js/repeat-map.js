(function(TR) {

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

document.getElementById('btn-regen-map').addEventListener('click', function() {
  TR.updateRepeatMap('kick');
  TR.updateRepeatMap('snare');
  TR.updateRepeatMap('hihat');
});
})(window.TR);
