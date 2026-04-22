/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var leafTips = [];

/* ── DEBUG SLIDERS (remove this block + matching HTML in index.html
   to revert to defaults: depthPower=1, bend=0, leafSpread=0) ── */
function dbgNum(id, def) {
  var el = document.getElementById(id);
  if (!el) return def;
  var v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}
function depthPower()  { return dbgNum('test-depth-curve', 1.0); }
function bendAlpha()   { return dbgNum('test-bend',        0.0); }
function leafSpread()  { return dbgNum('test-leaf-spread', 0.0); }
/* ── END DEBUG SLIDERS ── */

function treeDepth(t) {
  if (!Array.isArray(t)) return 1;
  var m = 0;
  for (var i = 0; i < t.length; i++) m = Math.max(m, treeDepth(t[i]));
  return 1 + m;
}

function drawBranch(tree, cx, cy, aStart, aEnd, parentX, parentY, pAngle, depthFromRoot, totalDepth) {
  var p      = depthPower();
  var bend   = bendAlpha();
  var spread = leafSpread();
  var rMax   = Math.min(vizW, vizH) * 0.45;

  var rCurrent = rMax * Math.pow(depthFromRoot     / totalDepth, p);
  var rChild   = rMax * Math.pow((depthFromRoot+1) / totalDepth, p);
  var rBend    = rCurrent + bend * (rChild - rCurrent);

  if (!Array.isArray(tree)) {
    var n = tree;
    for (var i = 0; i < n; i++) {
      var centered = (i + 0.5) / n;
      var edge     = (n > 1) ? i / (n - 1) : 0.5;
      var t = (1 - spread) * centered + spread * edge;
      var a = aStart + t * (aEnd - aStart);
      var tx = cx + Math.cos(a) * rChild;
      var ty = cy + Math.sin(a) * rChild;
      var vx = cx + Math.cos(pAngle) * rBend;
      var vy = cy + Math.sin(pAngle) * rBend;
      ctx.beginPath();
      ctx.moveTo(parentX, parentY);
      ctx.lineTo(vx, vy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      leafTips.push({ x: tx, y: ty });
    }
    return;
  }

  var len = tree.length;
  for (var i = 0; i < len; i++) {
    var cAStart = aStart + i * (aEnd - aStart) / len;
    var cAEnd   = aStart + (i + 1) * (aEnd - aStart) / len;
    var cAMid   = (cAStart + cAEnd) / 2;
    var cxC = cx + Math.cos(cAMid) * rChild;
    var cyC = cy + Math.sin(cAMid) * rChild;
    var vx  = cx + Math.cos(pAngle) * rBend;
    var vy  = cy + Math.sin(pAngle) * rBend;
    ctx.beginPath();
    ctx.moveTo(parentX, parentY);
    ctx.lineTo(vx, vy);
    ctx.lineTo(cxC, cyC);
    ctx.stroke();
    drawBranch(tree[i], cx, cy, cAStart, cAEnd, cxC, cyC, cAMid, depthFromRoot + 1, totalDepth);
  }
}

function drawKickFlower() {
  // Prefer current pattern's kickDef so flat length always matches the tree
  var curPat = TR.state.patterns[TR.state.currentPattern];
  var def = (curPat && curPat.kickDef) || (TR.getInstStructure && TR.getInstStructure('kick'));
  if (!def || !def.tree) return;
  var flat = TR.state.kickFlat;

  var depth = treeDepth(def.tree);
  var cx = vizW / 2;
  var cy = vizH / 2;
  var aStart = -Math.PI / 2;
  var aEnd   = Math.PI * 3 / 2;
  leafTips = [];
  drawBranch(def.tree, cx, cy, aStart, aEnd, cx, cy, (aStart + aEnd) / 2, 0, depth);

  // Circles only on active (on) steps, in kick track color
  if (!flat) return;
  ctx.strokeStyle = TR.rgbCSS(TR.INST_COLORS.kick);
  ctx.lineWidth = 1.5;
  var tipR = Math.max(3, Math.min(vizW, vizH) * 0.018);
  for (var i = 0; i < leafTips.length; i++) {
    if (!flat[i]) continue;
    ctx.beginPath();
    ctx.arc(leafTips[i].x, leafTips[i].y, tipR, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ── DEBUG SLIDERS: live value readout (remove with the block above) ── */
function bindSlider(inputId, displayId, digits) {
  var input = document.getElementById(inputId);
  var display = document.getElementById(displayId);
  if (!input || !display) return;
  var update = function() { display.textContent = parseFloat(input.value).toFixed(digits); };
  input.addEventListener('input', update);
  update();
}
bindSlider('test-depth-curve', 'test-p-val',          2);
bindSlider('test-bend',        'test-bend-val',       2);
bindSlider('test-leaf-spread', 'test-leaf-spread-val',2);
/* ── END DEBUG SLIDERS ── */

return {
  name: 'テスト',
  init: function(_canvas, _ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
  },
  resize: function(w, h) {
    vizW = w;
    vizH = h;
  },
  frame: function(_ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawKickFlower();
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
