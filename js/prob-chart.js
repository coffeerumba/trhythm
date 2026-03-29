(function(TR) {
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
})(window.TR);
