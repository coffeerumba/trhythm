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

// Per-instrument current/previous mask canvases. Each frame:
//   delta[key] = mask[key] - prevMask[key]   (only newly traversed pixels)
//   combined delta = delta.kick OR delta.snare OR delta.hihat
// The combined delta is what we paint into persist this frame, so each
// stroke is added once at full alpha and then decays from then on.
var instMaskCanvas = { kick: null, snare: null, hihat: null };
var instMaskCtx    = { kick: null, snare: null, hihat: null };
var instPrevCanvas = { kick: null, snare: null, hihat: null };
var instPrevCtx    = { kick: null, snare: null, hihat: null };
// Combined delta + a scratch temp used while computing each instrument's delta.
var deltaCanvas = null, deltaCtx = null;
var tempCanvas  = null, tempCtx  = null;
// Frame canvas: flower edges masked by combined delta, before compositing onto persist.
var frameCanvas = null, frameCtx = null;
// Persist canvas: holds every drawn pixel. Decays each frame so strokes / markers
// fade to ~invisible after one virtual cycle from the moment they were laid down.
var persistCanvas = null, persistCtx = null;
var lastFrameMs = null;
// Per-cycle marker bookkeeping: we draw each (key, step) marker exactly once
// (when its step first becomes the playing step in a given cycle), so the
// marker too begins fading from its own draw moment.
var markerDrawn = { kick: {}, snare: {}, hihat: {} };
var lastPlayingStep = { kick: -1, snare: -1, hihat: -1 };

function makeOffscreen(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function ensureMaskCanvases() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  ['kick', 'snare', 'hihat'].forEach(function(key) {
    if (!instMaskCanvas[key] || instMaskCanvas[key].width !== w || instMaskCanvas[key].height !== h) {
      instMaskCanvas[key] = makeOffscreen(w, h);
      instMaskCtx[key]    = instMaskCanvas[key].getContext('2d');
      instPrevCanvas[key] = makeOffscreen(w, h);
      instPrevCtx[key]    = instPrevCanvas[key].getContext('2d');
    }
  });
  if (!deltaCanvas || deltaCanvas.width !== w || deltaCanvas.height !== h) {
    deltaCanvas = makeOffscreen(w, h); deltaCtx = deltaCanvas.getContext('2d');
    tempCanvas  = makeOffscreen(w, h); tempCtx  = tempCanvas.getContext('2d');
  }
}
function ensureFrameCanvas() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  if (!frameCanvas || frameCanvas.width !== w || frameCanvas.height !== h) {
    frameCanvas = makeOffscreen(w, h);
    frameCtx = frameCanvas.getContext('2d');
  }
}
function ensurePersistCanvas() {
  var w = ctx.canvas.width, h = ctx.canvas.height;
  if (!persistCanvas || persistCanvas.width !== w || persistCanvas.height !== h) {
    persistCanvas = makeOffscreen(w, h);
    persistCtx = persistCanvas.getContext('2d');
  }
}
function drawTraversalMask(key, targetCtx) {
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

  // Swap ctx to the per-instrument mask ctx so drawEdge populates that canvas.
  var origCtx = ctx;
  ctx = targetCtx;
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

// Draw the marker for the current playing step exactly once per cycle, the
// first frame after that step becomes the playing step. Subsequent frames in
// the same cycle don't redraw it, so persistCanvas's decay can fade it out
// from the moment it was laid down.
function drawNewMarker(key) {
  if (!TR.state.isPlaying || !firstStepReached[key]) {
    markerDrawn[key] = {};
    lastPlayingStep[key] = -1;
    return;
  }
  var ip = findIp(key);
  if (!ip || !ip.secPerStep || !ip.count) return;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  var playingStep = ((Math.floor(contStep) % ip.count) + ip.count) % ip.count;

  // Cycle-wrap detection: a big drop means the cycle wrapped — clear the
  // per-cycle "drawn" set so this cycle's markers can fire again.
  if (lastPlayingStep[key] >= 0 &&
      playingStep < lastPlayingStep[key] &&
      (lastPlayingStep[key] - playingStep) > ip.count / 2) {
    markerDrawn[key] = {};
  }
  lastPlayingStep[key] = playingStep;

  var flat = TR.state[key + 'Flat'];
  if (!flat || !flat[playingStep] || markerDrawn[key][playingStep]) return;
  markerDrawn[key][playingStep] = true;

  var tip = leafTips[key][playingStep];
  if (!tip) return;
  ctx.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
  var tipR = Math.max(3, Math.min(vizW, vizH) * 0.018);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, tipR, 0, Math.PI * 2);
  ctx.fill();
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
['kick', 'snare', 'hihat'].forEach(function(k) {
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
    ensureMaskCanvases();
    ensureFrameCanvas();
    ensurePersistCanvas();

    var keys = ['kick', 'snare', 'hihat'];

    // Reset everything when not playing so each play starts clean.
    if (!TR.state.isPlaying) {
      persistCtx.clearRect(0, 0, w, h);
      lastFrameMs = null;
      for (var k = 0; k < keys.length; k++) {
        instPrevCtx[keys[k]].clearRect(0, 0, w, h);
        markerDrawn[keys[k]] = {};
        lastPlayingStep[keys[k]] = -1;
      }
    } else {
      // Time-based exponential alpha decay on persist: a pixel left alone
      // fades to ~2% one virtual cycle after it was last drawn. Because we
      // only paint NEW pixels into persist each frame (see step 4 below),
      // each stroke / marker fades independently from its own draw moment.
      var nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var cycle = TR.state.virtualCycle;
      if (lastFrameMs !== null && cycle > 0) {
        var dt = (nowMs - lastFrameMs) / 1000;
        var srcAlpha = 1 - Math.exp(-4 * dt / cycle);
        if (srcAlpha > 0) {
          persistCtx.globalCompositeOperation = 'destination-out';
          persistCtx.fillStyle = 'rgba(0,0,0,' + srcAlpha + ')';
          persistCtx.fillRect(0, 0, w, h);
          persistCtx.globalCompositeOperation = 'source-over';
        }
      }
      lastFrameMs = nowMs;
    }

    frameCtx.clearRect(0, 0, w, h);
    deltaCtx.clearRect(0, 0, w, h);

    // 1. Geometry
    for (var k = 0; k < keys.length; k++) buildGeometry(keys[k]);

    // 2. Per-instrument: build current mask, detect cycle wrap, compute
    //    delta = current - prev, OR delta into combined deltaCanvas, then
    //    save current as prev for next frame.
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var ip = findIp(key);
      var count = ip ? ip.count : 0;
      var prevCurrent = lastCurrent[key];
      instMaskCtx[key].clearRect(0, 0, w, h);
      drawTraversalMask(key, instMaskCtx[key]);
      var curCurrent = lastCurrent[key];
      // Wrap = significant drop in current step (guards against jitter).
      var wrapped = (prevCurrent >= 0 && curCurrent >= 0 &&
                     curCurrent < prevCurrent &&
                     count > 0 && (prevCurrent - curCurrent) > count / 2);
      if (wrapped) {
        instPrevCtx[key].clearRect(0, 0, w, h);
      }
      // Per-instrument delta into temp.
      tempCtx.globalCompositeOperation = 'source-over';
      tempCtx.clearRect(0, 0, w, h);
      tempCtx.drawImage(instMaskCanvas[key], 0, 0);
      tempCtx.globalCompositeOperation = 'destination-out';
      tempCtx.drawImage(instPrevCanvas[key], 0, 0);
      tempCtx.globalCompositeOperation = 'source-over';
      // OR into combined delta.
      deltaCtx.drawImage(tempCanvas, 0, 0);
      // Save current → prev for next frame.
      instPrevCtx[key].clearRect(0, 0, w, h);
      instPrevCtx[key].drawImage(instMaskCanvas[key], 0, 0);
    }

    // 3. Render flower edges (all instruments) onto frameCanvas, then mask
    //    with combined delta so only newly traversed pixels remain.
    var origCtx = ctx;
    ctx = frameCtx;
    for (var k = 0; k < keys.length; k++) drawAllEdges(keys[k]);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(deltaCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx = origCtx;

    // 4. Composite frame (only the new edge pixels) onto persist. Existing
    //    decayed pixels in persist keep their decay; new pixels go in at
    //    full alpha and start their own one-cycle fade.
    persistCtx.drawImage(frameCanvas, 0, 0);

    // 5. Draw the marker for any step that just became the playing step
    //    directly onto persist. Each marker is laid down once per cycle,
    //    then fades naturally with the rest of persist.
    ctx = persistCtx;
    for (var k = 0; k < keys.length; k++) drawNewMarker(keys[k]);
    ctx = origCtx;

    // 6. Display the accumulated image.
    ctx.drawImage(persistCanvas, 0, 0);

    // 7. Transient decorations on main only (not persisted).
    drawCenterDot();
    for (var k = 0; k < keys.length; k++) drawBall(keys[k]);

    // 8. Fill white behind everything.
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
