/* ═══════════════════════════════════════════════════════════════
   VIZ FRAMEWORK — manages multiple viz modes
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {
var canvas = document.getElementById('viz-canvas');
var ctx = canvas.getContext('2d');
var w = 0, h = 0;
var animId = null;

TR.vizModes = [];
TR.activeVizMode = null;

TR.registerVizMode = function(modeDef) {
  TR.vizModes.push(modeDef);
  // Update select dropdown
  var sel = document.getElementById('viz-mode-select');
  var opt = document.createElement('option');
  opt.value = TR.vizModes.length - 1;
  opt.textContent = modeDef.name;
  sel.appendChild(opt);
  // Auto-activate the first one registered
  if (TR.vizModes.length === 1) {
    TR.switchVizMode(0);
  }
};

TR.switchVizMode = function(index) {
  if (TR.activeVizMode && TR.activeVizMode.destroy) {
    TR.activeVizMode.destroy();
  }
  TR.activeVizMode = TR.vizModes[index] || null;
  if (TR.activeVizMode && TR.activeVizMode.init) {
    TR.activeVizMode.init(canvas, ctx, w, h);
  }
  document.getElementById('viz-mode-select').value = index;
};

TR.vizOnHit = function(key, step, level) {
  if (TR.activeVizMode && TR.activeVizMode.onHit) {
    TR.activeVizMode.onHit(key, step, level);
  }
};

TR.vizResize = function() {
  var wrap = document.getElementById('viz-wrap');
  w = wrap.clientWidth;
  h = Math.floor(w * 9 / 16);
  canvas.width = w;
  canvas.height = h;
  if (TR.activeVizMode && TR.activeVizMode.resize) {
    TR.activeVizMode.resize(w, h);
  }
};

function frame() {
  if (TR.activeVizMode && TR.activeVizMode.frame) {
    TR.activeVizMode.frame(ctx, w, h);
  }
  animId = requestAnimationFrame(frame);
}

TR.vizStart = function() { if (!animId) animId = requestAnimationFrame(frame); };

// Select change handler
document.getElementById('viz-mode-select').addEventListener('change', function() {
  TR.switchVizMode(parseInt(this.value));
  TR.vizResize();
});

window.addEventListener('resize', TR.vizResize);
TR.vizResize();
TR.vizStart();
})(window.TR);
