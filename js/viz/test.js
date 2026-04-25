/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)

   Rendering model: every frame draws the same full flower, but only the
   parts the ball has traversed *during a hit step in this cycle* survive,
   thanks to a destination-in mask. So branches are not "stroked piece
   by piece" — they fade in via mask growth, and curve / radius / etc.
   are honored end-to-end because the underlying flower draw is one
   complete pass with drawEdge.
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var leafTips  = { kick: [], snare: [], hihat: [] };
var leafPaths = { kick: [], snare: [], hihat: [] };  // polyline per leaf (for ball position)
var leafEdges = { kick: [], snare: [], hihat: [] };  // edge objects per leaf (for drawing)
var hitSet           = { kick: {},    snare: {},    hihat: {} };
var lastStep         = { kick: -1,    snare: -1,    hihat: -1 };
var firstStepReached = { kick: false, snare: false, hihat: false };
var lastCurrent      = { kick: -1,    snare: -1,    hihat: -1 };

/* ── DEBUG SLIDERS (remove this block + matching HTML in index.html
   to revert. Defaults: depthPower=1, bend=0, leafSpread=0, open=1,
   radius=0.45, curve=0, leafLen=1 — per instrument). ── */
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

function nearestAngle(target, ref) {
  var d = target - ref;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return ref + d;
}

// Stroke one branch from (px,py) via the bend vertex (vx,vy) to (ex,ey).
// curve=0: sharp L; curve=1: maximally rounded corner via arcTo.
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

function edgeLen(e) {
  return Math.hypot(e.vertex.x - e.p1.x, e.vertex.y - e.p1.y) +
         Math.hypot(e.p2.x - e.vertex.x, e.p2.y - e.vertex.y);
}

// Walk the tree to populate leafTips / leafPaths / leafEdges. NO drawing.
function buildBranch(key, tree, cx, cy, aStart, aEnd, parentX, parentY, pAngle, depthFromRoot, totalDepth, parentPath, parentEdges) {
  var p      = depthPower(key);
  var bend   = bendAlpha(key);
  var spread = leafSpread(key);
  var leafL  = leafLength(key);
  var openT  = branchOpen(key);
  var open   = 1 - Math.pow(1 - openT, totalDepth - depthFromRoot);
  var rMax   = Math.min(vizW, vizH) * radiusFrac(key);

  var rCurrent = rMax * Math.pow(depthFromRoot     / totalDepth, p);
  var rChild   = rMax * Math.pow((depthFromRoot+1) / totalDepth, p);
  var isLeaf   = !Array.isArray(tree);
  var rBend    = rCurrent + bend * (rChild - rCurrent);
  var mid = (depthFromRoot === 0) ? -Math.PI / 2 : (aStart + aEnd) / 2;

  if (isLeaf) {
    var n = tree;
    for (var i = 0; i < n; i++) {
      var centered = (i + 0.5) / n;
      var edge     = (n > 1) ? i / (n - 1) : 0.5;
      var t = (1 - spread) * centered + spread * edge;
      var aDef = nearestAngle(aStart + t * (aEnd - aStart), mid);
      var a = mid + open * (aDef - mid);
      var defX = cx + Math.cos(a) * rChild;
      var defY = cy + Math.sin(a) * rChild;
      var tx = parentX + leafL * (defX - parentX);
      var ty = parentY + leafL * (defY - parentY);
      var bendAngle = (depthFromRoot === 0) ? a : pAngle;
      var vx = cx + Math.cos(bendAngle) * rBend;
      var vy = cy + Math.sin(bendAngle) * rBend;

      leafTips[key].push({ x: tx, y: ty });
      var path = parentPath.slice();
      if (Math.hypot(vx - parentX, vy - parentY) > 0.5 &&
          Math.hypot(tx - vx, ty - vy) > 0.5) {
        path.push({ x: vx, y: vy });
      }
      path.push({ x: tx, y: ty });
      leafPaths[key].push(path);

      var edges = parentEdges.slice();
      edges.push({ p1: { x: parentX, y: parentY },
                   vertex: { x: vx, y: vy },
                   p2: { x: tx, y: ty } });
      leafEdges[key].push(edges);
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

    var childPath = parentPath.slice();
    if (Math.hypot(vx - parentX, vy - parentY) > 0.5 &&
        Math.hypot(cxC - vx, cyC - vy) > 0.5) {
      childPath.push({ x: vx, y: vy });
    }
    childPath.push({ x: cxC, y: cyC });

    var childEdges = parentEdges.slice();
    childEdges.push({ p1: { x: parentX, y: parentY },
                      vertex: { x: vx, y: vy },
                      p2: { x: cxC, y: cyC } });

    buildBranch(key, tree[i], cx, cy, cAStart, cAEnd, cxC, cyC, cMid, depthFromRoot + 1, totalDepth, childPath, childEdges);
  }
}

function buildGeometry(key) {
  leafTips[key]  = [];
  leafPaths[key] = [];
  leafEdges[key] = [];
  var curPat = TR.state.patterns[TR.state.currentPattern];
  var def = (curPat && curPat[key + 'Def']) || (TR.getInstStructure && TR.getInstStructure(key));
  if (!def || !def.tree) return;
  var depth = treeDepth(def.tree);
  var cx = vizW / 2;
  var cy = vizH / 2;
  var aStart = -Math.PI / 2;
  var aEnd   = Math.PI * 3 / 2;
  buildBranch(key, def.tree, cx, cy, aStart, aEnd, cx, cy, (aStart + aEnd) / 2, 0, depth, [{ x: cx, y: cy }], []);
}

function findIp(key) {
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) return TR.state.instPlayback[i];
  }
  return null;
}

function pointAlongPath(path, frac) {
  if (!path || path.length < 2) return path && path[0];
  var totalLen = 0, segLens = [];
  for (var i = 1; i < path.length; i++) {
    var l = Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
    segLens.push(l);
    totalLen += l;
  }
  if (totalLen === 0) return path[0];
  var target = frac * totalLen;
  var acc = 0;
  for (var i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      var segFrac = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
      return {
        x: path[i].x + segFrac * (path[i+1].x - path[i].x),
        y: path[i].y + segFrac * (path[i+1].y - path[i].y)
      };
    }
    acc += segLens[i];
  }
  return path[path.length - 1];
}

// Stroke a wide path along the ball's hit-traversed route this cycle.
// Used as the alpha mask for the flower (combined with destination-in /
// source-in compositing).
// Offscreen canvas used to accumulate the combined mask before applying.
var maskCanvas = null, maskCtx = null;
// Frame canvas: this cycle's masked flower + markers, before compositing onto persist.
var frameCanvas = null, frameCtx = null;
// Persist canvas: accumulates every cycle's render so previous cycles stay visible.
var persistCanvas = null, persistCtx = null;
function ensureMaskCanvas() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  if (!maskCanvas || maskCanvas.width !== w || maskCanvas.height !== h) {
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = w; maskCanvas.height = h;
    maskCtx = maskCanvas.getContext('2d');
  }
}
function ensureFrameCanvas() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  if (!frameCanvas || frameCanvas.width !== w || frameCanvas.height !== h) {
    frameCanvas = document.createElement('canvas');
    frameCanvas.width = w; frameCanvas.height = h;
    frameCtx = frameCanvas.getContext('2d');
  }
}
function ensurePersistCanvas() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  if (!persistCanvas || persistCanvas.width !== w || persistCanvas.height !== h) {
    persistCanvas = document.createElement('canvas');
    persistCanvas.width = w; persistCanvas.height = h;
    persistCtx = persistCanvas.getContext('2d');
  }
}
function drawTraversalMask(key) {
  if (!TR.state.isPlaying) {
    firstStepReached[key] = false;
    lastCurrent[key] = -1;
    return;
  }
  var ip = findIp(key);
  if (!ip || !ip.secPerStep || !ip.count) return;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  if (!firstStepReached[key]) {
    if (contStep < 0) return;
    firstStepReached[key] = true;
  }
  var stepIdx = Math.floor(contStep);
  var fracWithinStep = contStep - stepIdx;
  var current = ((stepIdx % ip.count) + ip.count) % ip.count;
  // Cycle wrap is implicit — at the wrap, current resets to a small index
  // and the per-step mask logic naturally only includes 0..current-1 again.
  lastCurrent[key] = current;

  var flat = TR.state[key + 'Flat'];
  var curve = curveAmount(key);

  // Swap ctx to maskCtx so all drawEdge calls populate the offscreen mask.
  var origCtx = ctx;
  ctx = maskCtx;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  // Full edges of completed hit steps
  for (var i = 0; i < current; i++) {
    if (flat && !flat[i]) continue;
    var edges = leafEdges[key][i];
    if (!edges) continue;
    for (var j = 0; j < edges.length; j++) {
      var e = edges[j];
      drawEdge(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.vertex.x, e.vertex.y, curve);
    }
  }
  // Partial mask along current step's edges, only when this step is a hit
  if (flat && flat[current]) {
    var edges2 = leafEdges[key][current];
    if (edges2) {
      // Skip leading edges whose endpoints are already in any prior hit step
      var traversed = {};
      for (var i = 0; i < current; i++) {
        if (flat && !flat[i]) continue;
        var p = leafPaths[key][i];
        if (!p) continue;
        for (var j = 0; j < p.length; j++) {
          traversed[p[j].x + ',' + p[j].y] = true;
        }
      }
      var skip = 0;
      for (var i = 0; i < edges2.length; i++) {
        var p2 = edges2[i].p2;
        if (traversed[p2.x + ',' + p2.y]) skip = i + 1;
        else break;
      }
      var totalAll = 0;
      var lensAll = [];
      for (var i = 0; i < edges2.length; i++) {
        var l = edgeLen(edges2[i]);
        lensAll.push(l);
        totalAll += l;
      }
      var skippedLen = 0;
      for (var i = 0; i < skip; i++) skippedLen += lensAll[i];
      var ballAbsLen = fracWithinStep * totalAll;
      var ballRem = ballAbsLen - skippedLen;
      var fracRem = (totalAll - skippedLen) > 0 ? Math.max(0, ballRem / (totalAll - skippedLen)) : 0;

      // Stroke remainingEdges up to fracRem. Reverse the array AND swap
      // p1/p2 within each edge so the trail grows from the leaf inward
      // toward the LCA — matching the ball's leaf→center motion.
      var fwdRem = edges2.slice(skip);
      var remEdges = [];
      for (var ri = fwdRem.length - 1; ri >= 0; ri--) {
        var origE = fwdRem[ri];
        remEdges.push({ p1: origE.p2, vertex: origE.vertex, p2: origE.p1 });
      }
      var remTotal = 0;
      var remLens = [];
      for (var i = 0; i < remEdges.length; i++) {
        var l = edgeLen(remEdges[i]);
        remLens.push(l);
        remTotal += l;
      }
      if (remTotal > 0 && fracRem > 0) {
        var target = fracRem * remTotal;
        var acc = 0;
        for (var i = 0; i < remEdges.length; i++) {
          if (acc + remLens[i] <= target) {
            var e = remEdges[i];
            drawEdge(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.vertex.x, e.vertex.y, curve);
            acc += remLens[i];
          } else {
            // Partial edge: straight L (mask ends mid-edge — visual snap is
            // fine for the mask since the flower under it can stay curved)
            var e = remEdges[i];
            var l1 = Math.hypot(e.vertex.x - e.p1.x, e.vertex.y - e.p1.y);
            var l2 = Math.hypot(e.p2.x - e.vertex.x, e.p2.y - e.vertex.y);
            var remaining = target - acc;
            ctx.beginPath();
            ctx.moveTo(e.p1.x, e.p1.y);
            if (remaining <= l1) {
              var f = l1 > 0 ? remaining / l1 : 0;
              ctx.lineTo(e.p1.x + f * (e.vertex.x - e.p1.x),
                         e.p1.y + f * (e.vertex.y - e.p1.y));
            } else {
              ctx.lineTo(e.vertex.x, e.vertex.y);
              var f2 = l2 > 0 ? (remaining - l1) / l2 : 0;
              ctx.lineTo(e.vertex.x + f2 * (e.p2.x - e.vertex.x),
                         e.vertex.y + f2 * (e.p2.y - e.vertex.y));
            }
            ctx.stroke();
            break;
          }
        }
      }
    }
  }
  // Restore main ctx
  ctx = origCtx;
}

// Stroke every edge of the flower (always full, in solid black). Combined
// with the mask via source-in composite, only mask-region pixels survive.
function drawAllEdges(key) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  var curve = curveAmount(key);
  var seen = {};
  for (var leafIdx = 0; leafIdx < leafEdges[key].length; leafIdx++) {
    var edges = leafEdges[key][leafIdx];
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var k = e.p1.x + ',' + e.p1.y + '|' + e.p2.x + ',' + e.p2.y;
      if (seen[k]) continue;
      seen[k] = true;
      drawEdge(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.vertex.x, e.vertex.y, curve);
    }
  }
}

function drawCenterDot() {
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(vizW / 2, vizH / 2, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawMarkers(key) {
  var color = TR.rgbCSS(TR.INST_COLORS[key]);
  var flat = TR.state[key + 'Flat'];
  var ip = findIp(key);

  // Update hitSet: mark a step as fired the moment it plays this cycle.
  // Note: at the audio tail of a cycle (e.g. step 15) the scheduler has
  // already advanced ip.step to 0, so contStep goes negative — must use
  // mod arithmetic to wrap back to count-1 instead of treating it as -1.
  var playingStep = -1;
  if (TR.state.isPlaying && ip && ip.secPerStep && ip.count && firstStepReached[key]) {
    var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
    var contStep = ip.step - stepsUntilNext;
    playingStep = ((Math.floor(contStep) % ip.count) + ip.count) % ip.count;
  }
  if (playingStep < 0 || (lastStep[key] >= 0 && playingStep < lastStep[key])) {
    hitSet[key] = {};
  }
  if (flat && playingStep >= 0 && flat[playingStep]) {
    hitSet[key][playingStep] = true;
  }
  lastStep[key] = playingStep;

  if (!flat) return;
  ctx.fillStyle = color;
  var tipR = Math.max(3, Math.min(vizW, vizH) * 0.018);
  for (var i = 0; i < leafTips[key].length; i++) {
    if (!flat[i]) continue;
    if (!hitSet[key][i]) continue;
    ctx.beginPath();
    ctx.arc(leafTips[key][i].x, leafTips[key][i].y, tipR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(key) {
  if (!TR.state.isPlaying) return;
  var ip = findIp(key);
  if (!ip || !ip.secPerStep || !ip.count) return;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  if (contStep < 0 && !firstStepReached[key]) return;
  var stepIdx = Math.floor(contStep);
  var fracWithinStep = contStep - stepIdx;
  stepIdx = ((stepIdx % ip.count) + ip.count) % ip.count;
  var flat = TR.state[key + 'Flat'];
  if (flat && !flat[stepIdx]) return;  // hide ball on non-hit branches
  var path = leafPaths[key][stepIdx];
  if (!path) return;
  // Compute LCA: nodes already covered by previous hit steps in this cycle.
  var traversed = {};
  for (var i = 0; i < stepIdx; i++) {
    if (flat && !flat[i]) continue;
    var p = leafPaths[key][i];
    if (!p) continue;
    for (var j = 0; j < p.length; j++) {
      traversed[p[j].x + ',' + p[j].y] = true;
    }
  }
  var startIdx = 0;
  for (var i = 0; i < path.length; i++) {
    if (traversed[path[i].x + ',' + path[i].y]) startIdx = i;
    else break;
  }
  // Ball travels from the leaf tip inward to the LCA (or center for step 0).
  // Reverse the non-traversed portion so frac=0 sits at the leaf.
  var pathSlice = path.slice(startIdx).slice().reverse();
  var pos = pointAlongPath(pathSlice, fracWithinStep);
  if (!pos) return;
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

/* ── DEBUG SLIDERS: live value readout ── */
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

    ctx.clearRect(0, 0, w, h);
    ensureMaskCanvas();
    ensureFrameCanvas();
    ensurePersistCanvas();

    // Reset accumulation when not playing — each play starts with a clean canvas.
    if (!TR.state.isPlaying) {
      persistCtx.clearRect(0, 0, w, h);
    }

    maskCtx.clearRect(0, 0, w, h);
    frameCtx.clearRect(0, 0, w, h);

    // 1. Geometry
    buildGeometry('kick');
    buildGeometry('snare');

    // 2. Build the current cycle's traversal mask offscreen
    drawTraversalMask('kick');
    drawTraversalMask('snare');

    // 3. Render this cycle's masked flower + markers onto frameCanvas
    var origCtx = ctx;
    ctx = frameCtx;
    drawAllEdges('kick');
    drawAllEdges('snare');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    drawMarkers('kick');
    drawMarkers('snare');
    ctx = origCtx;

    // 4. Accumulate this frame onto persistCanvas (additive — previous
    //    cycles' strokes and markers remain even after the current cycle
    //    wraps and the mask resets)
    persistCtx.drawImage(frameCanvas, 0, 0);

    // 5. Display the accumulated image
    ctx.drawImage(persistCanvas, 0, 0);

    // 6. Transient decorations on main only (not persisted)
    drawCenterDot();
    drawBall('kick');
    drawBall('snare');

    // 7. Fill white behind everything
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
