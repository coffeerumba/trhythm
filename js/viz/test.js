/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;

function treeDepth(t) {
  if (!Array.isArray(t)) return 1;
  var m = 0;
  for (var i = 0; i < t.length; i++) m = Math.max(m, treeDepth(t[i]));
  return 1 + m;
}

function drawBranch(tree, cx, cy, aStart, aEnd, radius, rStep) {
  var aMid = (aStart + aEnd) / 2;
  var px = cx + Math.cos(aMid) * radius;
  var py = cy + Math.sin(aMid) * radius;

  if (!Array.isArray(tree)) {
    var n = tree;
    for (var i = 0; i < n; i++) {
      var a = aStart + (i + 0.5) * (aEnd - aStart) / n;
      var tx = cx + Math.cos(a) * (radius + rStep);
      var ty = cy + Math.sin(a) * (radius + rStep);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    return;
  }

  var len = tree.length;
  for (var i = 0; i < len; i++) {
    var cAStart = aStart + i * (aEnd - aStart) / len;
    var cAEnd = aStart + (i + 1) * (aEnd - aStart) / len;
    var cAMid = (cAStart + cAEnd) / 2;
    var cxChild = cx + Math.cos(cAMid) * (radius + rStep);
    var cyChild = cy + Math.sin(cAMid) * (radius + rStep);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(cxChild, cyChild);
    ctx.stroke();
    drawBranch(tree[i], cx, cy, cAStart, cAEnd, radius + rStep, rStep);
  }
}

function drawKickFlower() {
  var def = TR.getInstStructure && TR.getInstStructure('kick');
  if (!def || !def.tree) return;
  var depth = treeDepth(def.tree);
  var cx = vizW / 2;
  var cy = vizH / 2;
  var rMax = Math.min(vizW, vizH) * 0.45;
  var rStep = rMax / depth;
  // Rotate so step 0 is at 12 o'clock
  drawBranch(def.tree, cx, cy, -Math.PI / 2, Math.PI * 3 / 2, 0, rStep);
}

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
    drawKickFlower();
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
