(function(TR) {
/* ─── Tree visualization (tournament bracket) ─── */
TR.renderTreeViz = function() {
  var key = document.getElementById('default-struct').value;
  var def = TR.STRUCTURES[key];
  var maxDepth = 0;
  function getMaxDepth(node, d) {
    if (!Array.isArray(node)) { if (d > maxDepth) maxDepth = d; return; }
    for (var i = 0; i < node.length; i++) getMaxDepth(node[i], d + 1);
  }
  getMaxDepth(def.tree, 0);

  var beatColorDepth = maxDepth - def.beatLevel + 1;
  function structLabel(node, depth) {
    if (!Array.isArray(node)) {
      if (depth === beatColorDepth) {
        return '<span style="color:var(--accent)">' + node + '</span>';
      }
      return String(node);
    }
    var inner = '';
    for (var i = 0; i < node.length; i++) {
      if (i > 0) inner += ',';
      inner += structLabel(node[i], depth + 1);
    }
    if (depth === beatColorDepth) {
      return '<span style="color:var(--accent)">[</span>' + inner + '<span style="color:var(--accent)">]</span>';
    }
    return '[' + inner + ']';
  }
  document.getElementById('tree-struct-label').innerHTML = structLabel(def.tree, 0);

  var el = document.getElementById('tree-viz');
  var colors = ['#666', '#888', '#aaa', '#bbb', '#ccc'];
  var levels = TR.computeLevels(def.tree);
  var leafIdx = 0;

  function build(node, depth) {
    var color = (depth === beatColorDepth && depth < maxDepth) ? 'var(--accent)' : colors[depth % colors.length];
    if (!Array.isArray(node)) {
      var cells = '';
      for (var j = 0; j < node; j++) {
        var isBeat = levels[leafIdx] >= def.beatLevel;
        cells += '<div class="tv-leaf' + (isBeat ? ' beat' : '') + '">' +
                 levels[leafIdx] + '</div>';
        leafIdx++;
      }
      return '<div class="tv-leaves">' + cells + '</div>';
    }
    var arms = '';
    for (var i = 0; i < node.length; i++) {
      arms += '<div class="tv-arm">' + build(node[i], depth + 1) + '</div>';
    }
    return '<div class="tv-fork" style="--fc:' + color + '">' +
           '<div class="tv-arms">' + arms + '</div></div>';
  }

  el.innerHTML = build(def.tree, 0);
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
  TR.renderTreeViz();
  TR.updateAllBeatsSelects();
  document.getElementById('btn-generate').click();
});

document.getElementById('struct-prev').addEventListener('click', function() { TR.navigateStruct(-1); });
document.getElementById('struct-next').addEventListener('click', function() { TR.navigateStruct(1); });

/* ─── Populate default-struct select dynamically ─── */
var defSel = document.getElementById('default-struct');
defSel.innerHTML = TR.buildStructOptions(false);
defSel.value = 'p-16';

/* ─── Initial render ─── */
TR.renderAllProbCharts();
TR.renderTreeViz();
TR.updateAllBeatsSelects();
})(window.TR);
