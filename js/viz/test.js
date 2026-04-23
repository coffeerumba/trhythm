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
function branchOpen()  { return dbgNum('test-open',        1.0); }
function leafLength()  { return dbgNum('test-leaf-len',    1.0); }
function curveAmount() { return dbgNum('test-curve',       0.0); }
/* ── END DEBUG SLIDERS ── */

function treeDepth(t) {
  if (!Array.isArray(t)) return 1;
  var m = 0;
  for (var i = 0; i < t.length; i++) m = Math.max(m, treeDepth(t[i]));
  return 1 + m;
}

// Return the angle closest to ref that is equivalent to target mod 2π.
function nearestAngle(target, ref) {
  var d = target - ref;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return ref + d;
}

// Draw a branch from (px,py) via the bend vertex (vx,vy) to (ex,ey).
// curve=0: sharp L (two straight segments). curve=1: maximally rounded
// corner (arcTo with the largest fitting radius). When the L is degenerate
// (bend≈0, so vx≈px,py), just draws a straight line.
function drawEdge(px, py, ex, ey, vx, vy, curve) {
  var d1 = Math.hypot(vx - px, vy - py);
  var d2 = Math.hypot(ex - vx, ey - vy);
  ctx.beginPath();
  ctx.moveTo(px, py);
  if (d1 < 0.5 || d2 < 0.5) {
    ctx.lineTo(ex, ey);
  } else {
    var maxR = Math.min(d1, d2) * 0.95;
    var r = curve * maxR;
    if (r < 0.5) {
      ctx.lineTo(vx, vy);
      ctx.lineTo(ex, ey);
    } else {
      ctx.arcTo(vx, vy, ex, ey, r);
      ctx.lineTo(ex, ey);
    }
  }
  ctx.stroke();
}

function drawBranch(tree, cx, cy, aStart, aEnd, parentX, parentY, pAngle, depthFromRoot, totalDepth) {
  var p      = depthPower();
  var bend   = bendAlpha();
  var spread = leafSpread();
  var leafL  = leafLength();
  var curve  = curveAmount();
  // Soft opening: t=0 all closed, t=1 all open. Root-side branches rise
  // fastest; descendants also respond (more weakly) for all t in (0,1).
  // open_d = 1 - (1-t)^(D-d): larger exponent at shallow levels → steeper rise.
  var openT  = branchOpen();
  var open   = 1 - Math.pow(1 - openT, totalDepth - depthFromRoot);
  var rMax   = Math.min(vizW, vizH) * 0.45;

  var rCurrent = rMax * Math.pow(depthFromRoot     / totalDepth, p);
  var rChild   = rMax * Math.pow((depthFromRoot+1) / totalDepth, p);
  // Leaf rays: scale final step by leafL (1 = default, 0 = no ray, 2 = double)
  var isLeaf   = !Array.isArray(tree);
  var rEnd     = isLeaf ? (rCurrent + leafL * (rChild - rCurrent)) : rChild;
  var rBend    = rCurrent + bend * (rEnd - rCurrent);
  // At root, collapse children toward 12 o'clock (step 0's direction).
  // At deeper levels, collapse toward the parent's wedge mid.
  var mid = (depthFromRoot === 0) ? -Math.PI / 2 : (aStart + aEnd) / 2;

  if (isLeaf) {
    var n = tree;
    for (var i = 0; i < n; i++) {
      var centered = (i + 0.5) / n;
      var edge     = (n > 1) ? i / (n - 1) : 0.5;
      var t = (1 - spread) * centered + spread * edge;
      var aDef = nearestAngle(aStart + t * (aEnd - aStart), mid);
      var a = mid + open * (aDef - mid);
      var tx = cx + Math.cos(a) * rEnd;
      var ty = cy + Math.sin(a) * rEnd;
      var vx = cx + Math.cos(pAngle) * rBend;
      var vy = cy + Math.sin(pAngle) * rBend;
      drawEdge(parentX, parentY, tx, ty, vx, vy, curve);
      leafTips.push({ x: tx, y: ty });
    }
    return;
  }

  var len = tree.length;
  var wedgeW = (aEnd - aStart) / len;
  var scaledW = wedgeW * open;
  for (var i = 0; i < len; i++) {
    var defCenter = nearestAngle(aStart + (i + 0.5) * wedgeW, mid);
    var cMid = mid + open * (defCenter - mid);
    var cAStart = cMid - scaledW / 2;
    var cAEnd   = cMid + scaledW / 2;
    var cxC = cx + Math.cos(cMid) * rChild;
    var cyC = cy + Math.sin(cMid) * rChild;
    var vx  = cx + Math.cos(pAngle) * rBend;
    var vy  = cy + Math.sin(pAngle) * rBend;
    drawEdge(parentX, parentY, cxC, cyC, vx, vy, curve);
    drawBranch(tree[i], cx, cy, cAStart, cAEnd, cxC, cyC, cMid, depthFromRoot + 1, totalDepth);
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

  // Small black dot at the flower center
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

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
bindSlider('test-open',        'test-open-val',       2);
bindSlider('test-leaf-len',    'test-leaf-len-val',   2);
bindSlider('test-curve',       'test-curve-val',      2);
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
