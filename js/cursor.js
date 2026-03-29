(function(TR) {
TR.showInstCursor = function(gridId, step) {
  var el = document.getElementById(gridId);
  if (!el) return;
  var dots = el.querySelectorAll('.grid-step');
  for (var i = 0; i < dots.length; i++) dots[i].classList.remove('cursor-on');
  if (dots[step]) dots[step].classList.add('cursor-on');
  // Visualizer hook
  var keyMap = { 'grid-kick': 'kick', 'grid-snare': 'snare', 'grid-hihat': 'hihat' };
  var key = keyMap[gridId];
  if (key && typeof TR.vizOnHit === 'function') {
    var flat = key === 'kick' ? TR.state.kickFlat : key === 'snare' ? TR.state.snareFlat : TR.state.hihatFlat;
    if (flat && flat[step]) {
      var pat = TR.state.patterns[TR.state.currentPattern];
      var def = pat ? pat[key + 'Def'] : null;
      if (def) {
        var levels = TR.computeLevels(def.tree);
        TR.vizOnHit(key, step, levels[step] || 0);
      }
    }
  }
};

TR.showTreeCursor = function(step) {
  var leaves = document.querySelectorAll('#tree-viz .tv-leaf');
  for (var i = 0; i < leaves.length; i++) leaves[i].classList.remove('cursor-on');
  if (leaves[step]) leaves[step].classList.add('cursor-on');
};

TR.clearCursor = function() {
  var all = document.querySelectorAll('.cursor-on');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('cursor-on');
};

TR.updatePlayBtn = function() {
  var btn = document.getElementById('btn-play');
  if (TR.state.isPlaying) {
    btn.textContent = '\u25A0 \u505c\u6b62';
    btn.classList.add('playing');
  } else {
    btn.textContent = '\u25B6 \u518d\u751f';
    btn.classList.remove('playing');
  }
};
})(window.TR);
