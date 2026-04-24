/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var leafTips = [];

/* ── DEBUG SLIDERS (remove this block + matching HTML in index.html
   to revert. Defaults: depthPower=1, bend=0, leafSpread=0, open=1,
   leafLen=1, curve=0 — per instrument). ── */
function dbgNum(id, def) {
  var el = document.getElementById(id);
  if (!el) return def;
  var v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}
function depthPower(key)  { return dbgNum('test-' + key + '-depth-curve', 1.0); }
function bendAlpha(key)   { return dbgNum('test-' + key + '-bend',        0.0); }
function leafSpread(key)  { return dbgNum('test-' + key + '-leaf-spread', 0.0); }
function branchOpen(key)  { return dbgNum('test-' + key + '-open',        1.0); }
function radiusFrac(key)  { return dbgNum('test-' + key + '-radius',      0.45); }
function curveAmount(key) { return dbgNum('test-' + key + '-curve',       0.0); }
function leafLength(key)  { return dbgNum('test-' + key + '-leaf-len',    1.0); }
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

function drawBranch(key, tree, cx, cy, aStart, aEnd, parentX, parentY, pAngle, depthFromRoot, totalDepth) {
  var p      = depthPower(key);
  var bend   = bendAlpha(key);
  var spread = leafSpread(key);
  var curve  = curveAmount(key);
  var leafL  = leafLength(key);
  // Soft opening: t=0 all closed, t=1 all open. Root-side branches rise
  // fastest; descendants also respond (more weakly) for all t in (0,1).
  // open_d = 1 - (1-t)^(D-d): larger exponent at shallow levels → steeper rise.
  var openT  = branchOpen(key);
  var open   = 1 - Math.pow(1 - openT, totalDepth - depthFromRoot);
  var rMax   = Math.min(vizW, vizH) * radiusFrac(key);

  var rCurrent = rMax * Math.pow(depthFromRoot     / totalDepth, p);
  var rChild   = rMax * Math.pow((depthFromRoot+1) / totalDepth, p);
  var isLeaf   = !Array.isArray(tree);
  var rBend    = rCurrent + bend * (rChild - rCurrent);
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
      // Pure length scaling: extend the parent→leaf segment by leafL in
      // its native direction (keeps leaf-segment angle fixed as leafL varies).
      var defX = cx + Math.cos(a) * rChild;
      var defY = cy + Math.sin(a) * rChild;
      var tx = parentX + leafL * (defX - parentX);
      var ty = parentY + leafL * (defY - parentY);
      // At root, parent has no direction — anchor the L along the child's
      // own angle (makes the first segment invisible, as expected).
      var bendAngle = (depthFromRoot === 0) ? a : pAngle;
      var vx = cx + Math.cos(bendAngle) * rBend;
      var vy = cy + Math.sin(bendAngle) * rBend;
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
    var bendAngle = (depthFromRoot === 0) ? cMid : pAngle;
    var vx  = cx + Math.cos(bendAngle) * rBend;
    var vy  = cy + Math.sin(bendAngle) * rBend;
    drawEdge(parentX, parentY, cxC, cyC, vx, vy, curve);
    drawBranch(key, tree[i], cx, cy, cAStart, cAEnd, cxC, cyC, cMid, depthFromRoot + 1, totalDepth);
  }
}

function drawInstrumentFlower(key) {
  // Prefer current pattern's def so flat length always matches the tree
  var curPat = TR.state.patterns[TR.state.currentPattern];
  var def = (curPat && curPat[key + 'Def']) || (TR.getInstStructure && TR.getInstStructure(key));
  if (!def || !def.tree) return;
  var flat = TR.state[key + 'Flat'];
  var color = TR.rgbCSS(TR.INST_COLORS[key]);

  var depth = treeDepth(def.tree);
  var cx = vizW / 2;
  var cy = vizH / 2;
  var aStart = -Math.PI / 2;
  var aEnd   = Math.PI * 3 / 2;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  leafTips = [];
  drawBranch(key, def.tree, cx, cy, aStart, aEnd, cx, cy, (aStart + aEnd) / 2, 0, depth);

  // Small black dot at the flower center
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Circles only on active (on) steps, in track color
  if (!flat) return;
  ctx.strokeStyle = color;
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
['kick', 'snare'].forEach(function(k) {
  bindSlider('test-' + k + '-depth-curve', 'test-' + k + '-depth-curve-val', 2);
  bindSlider('test-' + k + '-bend',        'test-' + k + '-bend-val',        2);
  bindSlider('test-' + k + '-leaf-spread', 'test-' + k + '-leaf-spread-val', 2);
  bindSlider('test-' + k + '-open',        'test-' + k + '-open-val',        2);
  bindSlider('test-' + k + '-radius',      'test-' + k + '-radius-val',      2);
  bindSlider('test-' + k + '-curve',       'test-' + k + '-curve-val',       2);
  bindSlider('test-' + k + '-leaf-len',    'test-' + k + '-leaf-len-val',    2);
});
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
    drawInstrumentFlower('kick');
    drawInstrumentFlower('snare');
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
