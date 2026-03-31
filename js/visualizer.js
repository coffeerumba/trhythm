/* ═══════════════════════════════════════════════════════════════
   VISUALIZER FRAMEWORK — manages multiple visualizer plugins
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {
var canvas = document.getElementById('viz-canvas');
var ctx = canvas.getContext('2d');
var w = 0, h = 0;
var animId = null;

TR.visualizers = [];
TR.activeViz = null;

TR.registerVisualizer = function(vizDef) {
  TR.visualizers.push(vizDef);
  // Update select dropdown
  var sel = document.getElementById('viz-select');
  var opt = document.createElement('option');
  opt.value = TR.visualizers.length - 1;
  opt.textContent = vizDef.name;
  sel.appendChild(opt);
  // Auto-activate the first one registered
  if (TR.visualizers.length === 1) {
    TR.switchVisualizer(0);
  }
};

TR.switchVisualizer = function(index) {
  if (TR.activeViz && TR.activeViz.destroy) {
    TR.activeViz.destroy();
  }
  TR.activeViz = TR.visualizers[index] || null;
  if (TR.activeViz && TR.activeViz.init) {
    TR.activeViz.init(canvas, ctx, w, h);
  }
  document.getElementById('viz-select').value = index;
};

TR.vizOnHit = function(key, step, level) {
  if (TR.activeViz && TR.activeViz.onHit) {
    TR.activeViz.onHit(key, step, level);
  }
};

TR.vizResize = function() {
  var wrap = document.getElementById('viz-wrap');
  w = Math.floor(wrap.clientWidth / 2);
  h = Math.floor(w * 9 / 16);
  canvas.width = w;
  canvas.height = h;
  if (TR.activeViz && TR.activeViz.resize) {
    TR.activeViz.resize(w, h);
  }
};

function frame() {
  if (TR.activeViz && TR.activeViz.frame) {
    TR.activeViz.frame(ctx, w, h);
  }
  animId = requestAnimationFrame(frame);
}

TR.vizStart = function() { if (!animId) animId = requestAnimationFrame(frame); };

// Select change handler
document.getElementById('viz-select').addEventListener('change', function() {
  TR.switchVisualizer(parseInt(this.value));
  TR.vizResize();
});

window.addEventListener('resize', TR.vizResize);
TR.vizResize();
TR.vizStart();
})(window.TR);
