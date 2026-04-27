/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)

   Rendering model: stateless redraw from per-step animations. When audio
   fires for step k we register an animation: a yellow ball heads from
   the leaf inward to the LCA over one step's duration (drawing the
   trail behind it), then turns into a white eraser ball that retreats
   back to the leaf over half a virtual cycle (the visible trail
   retracts along with it). The marker stays solid for the whole
   lifespan and blinks out the instant the eraser reaches the leaf.

   Each frame we just clearRect, rebuild geometry, then redraw every
   active animation at its current elapsed time. No persist canvas, no
   masks. Same step refiring before reverse finishes simply replaces
   the old entry — old branches and marker disappear that frame.
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var leafTips  = { kick: [], snare: [], hihat: [] };
var leafPaths = { kick: [], snare: [], hihat: [] };  // polyline per leaf (for ball position)
var leafEdges = { kick: [], snare: [], hihat: [] };  // edge objects per leaf (for drawing)
var firstStepReached = { kick: false, snare: false, hihat: false };

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

// Active per-step animations. Each (key, step) has at most one entry. When
// audio fires for step k, we record the firing time and snapshot enough
// geometry to play the animation through to its end:
//   - forward phase (0..secPerStep): yellow ball travels leaf → LCA, leaving
//     a solid trail behind it.
//   - reverse phase (secPerStep .. secPerStep+reverseSec): white "eraser"
//     ball travels LCA → leaf, the trail behind it is removed.
//     reverseSec = 0.5 × virtualCycle (half-cycle reverse).
//   - past secPerStep+reverseSec: animation expires and is deleted; the
//     marker winks out at that exact instant (no fade).
// If the same step fires again before the prior animation's reverse finishes,
// the new firing replaces the entry — old branches & marker disappear, the
// new forward starts from leaf at frac=0.
var animations = { kick: {}, snare: {}, hihat: {} };
var lastPlayingStep = { kick: -1, snare: -1, hihat: -1 };

// Build a leaf→LCA edge list (with bend vertices preserved) and a polyline
// for the ball position. LCA is the deepest path node already traversed by
// any earlier hit step in the current cycle, mirroring the existing rule.
function captureAnimGeom(key, step, flat) {
  var edges = leafEdges[key][step];
  var path  = leafPaths[key][step];
  if (!edges || !path) return null;

  var traversed = {};
  for (var i = 0; i < step; i++) {
    if (flat && !flat[i]) continue;
    var p = leafPaths[key][i];
    if (!p) continue;
    for (var j = 0; j < p.length; j++) traversed[p[j].x + ',' + p[j].y] = true;
  }
  var skipEdges = 0;
  for (var i = 0; i < edges.length; i++) {
    if (traversed[edges[i].p2.x + ',' + edges[i].p2.y]) skipEdges = i + 1;
    else break;
  }
  // Reverse the LCA→leaf edges into leaf→LCA, swapping p1/p2 within each.
  var fwd = edges.slice(skipEdges);
  var remEdges = [];
  for (var ri = fwd.length - 1; ri >= 0; ri--) {
    var e = fwd[ri];
    remEdges.push({ p1: e.p2, vertex: e.vertex, p2: e.p1 });
  }
  // Polyline (leaf → vertices → LCA) for ball position via pointAlongPath.
  var pathSlice = [];
  for (var i = 0; i < remEdges.length; i++) {
    var e = remEdges[i];
    if (i === 0) pathSlice.push({ x: e.p1.x, y: e.p1.y });
    var hasBend = Math.hypot(e.vertex.x - e.p1.x, e.vertex.y - e.p1.y) > 0.5 &&
                  Math.hypot(e.p2.x - e.vertex.x, e.p2.y - e.vertex.y) > 0.5;
    if (hasBend) pathSlice.push({ x: e.vertex.x, y: e.vertex.y });
    pathSlice.push({ x: e.p2.x, y: e.p2.y });
  }
  var tip = leafTips[key][step];
  return {
    remEdges:  remEdges,
    pathSlice: pathSlice,
    leafTip:   tip ? { x: tip.x, y: tip.y } : null,
    curve:     curveAmount(key)
  };
}

// Detect new step transitions, register a fresh animation when the new step
// is a hit, and prune animations whose reverse has finished.
function updateAnimations(key) {
  if (!TR.state.isPlaying) {
    animations[key] = {};
    lastPlayingStep[key] = -1;
    firstStepReached[key] = false;
    return;
  }
  var ip = findIp(key);
  if (!ip || !ip.secPerStep || !ip.count) return;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  if (!firstStepReached[key]) {
    if (contStep < 0) {
      // Still expire any leftovers if they exist.
      pruneExpired(key);
      return;
    }
    firstStepReached[key] = true;
  }
  var playingStep = ((Math.floor(contStep) % ip.count) + ip.count) % ip.count;

  if (playingStep !== lastPlayingStep[key]) {
    var flat = TR.state[key + 'Flat'];
    if (flat && flat[playingStep]) {
      var geom = captureAnimGeom(key, playingStep, flat);
      if (geom) {
        animations[key][playingStep] = {
          firingTime: Tone.now(),
          secPerStep: ip.secPerStep,
          cycleSec:   0.5 * (TR.state.virtualCycle || (ip.secPerStep * ip.count)),
          remEdges:   geom.remEdges,
          pathSlice:  geom.pathSlice,
          leafTip:    geom.leafTip,
          curve:      geom.curve
        };
      }
    }
    lastPlayingStep[key] = playingStep;
  }
  pruneExpired(key);
}

function pruneExpired(key) {
  var now = Tone.now();
  for (var s in animations[key]) {
    var a = animations[key][s];
    if (now > a.firingTime + a.secPerStep + a.cycleSec) delete animations[key][s];
  }
}

// Stroke the visible portion of one animation's path: from the leaf inward
// up to fraction `frac` of the leaf→LCA route. Forward uses frac that grows
// 0→1; reverse uses frac that shrinks 1→0, so the visible segment grows out
// of the leaf and then retracts back into it — matching the ball's motion.
function strokeAnimSegment(remEdges, frac, curve) {
  if (!remEdges || remEdges.length === 0 || frac <= 0) return;
  var lens = [], total = 0;
  for (var i = 0; i < remEdges.length; i++) {
    var l = edgeLen(remEdges[i]);
    lens.push(l);
    total += l;
  }
  if (total === 0) return;
  var target = frac * total;
  var acc = 0;
  for (var i = 0; i < remEdges.length; i++) {
    var e = remEdges[i];
    if (acc + lens[i] <= target) {
      drawEdge(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.vertex.x, e.vertex.y, curve);
      acc += lens[i];
    } else {
      // Partial edge — sharp L ok, the visual snap on the leading tip is tiny.
      var remaining = target - acc;
      var l1 = Math.hypot(e.vertex.x - e.p1.x, e.vertex.y - e.p1.y);
      var l2 = Math.hypot(e.p2.x - e.vertex.x, e.p2.y - e.vertex.y);
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

function drawAnimation(key, anim) {
  var elapsed = Tone.now() - anim.firingTime;
  if (elapsed < 0) return;

  var frac, ballColor;
  if (elapsed < anim.secPerStep) {
    // Forward: visible segment expands from leaf toward LCA.
    frac = elapsed / anim.secPerStep;
    ballColor = '#ffcc00';
  } else if (elapsed < anim.secPerStep + anim.cycleSec) {
    // Reverse: white eraser drifts back toward leaf, visible segment retracts.
    frac = 1 - (elapsed - anim.secPerStep) / anim.cycleSec;
    ballColor = '#fff';
  } else {
    return; // expired — pruneExpired() will delete on the next updateAnimations
  }

  // 1. The visible trail (leaf → ball position).
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  strokeAnimSegment(anim.remEdges, frac, anim.curve);

  // 2. Marker at the leaf tip, full alpha throughout the animation lifespan.
  if (anim.leafTip) {
    ctx.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
    var tipR = Math.max(3, Math.min(vizW, vizH) * 0.018);
    ctx.beginPath();
    ctx.arc(anim.leafTip.x, anim.leafTip.y, tipR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. The ball itself — yellow heading inward, white heading back out.
  var pos = pointAlongPath(anim.pathSlice, frac);
  if (pos) {
    ctx.fillStyle = ballColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCenterDot() {
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(vizW / 2, vizH / 2, 4, 0, Math.PI * 2);
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

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    var keys = ['kick', 'snare', 'hihat'];

    // Geometry needs to be current for any animation that fires this frame.
    for (var k = 0; k < keys.length; k++) buildGeometry(keys[k]);

    // Pick up new firings, expire old animations.
    for (var k = 0; k < keys.length; k++) updateAnimations(keys[k]);

    // Render every active animation. Each one is fully self-contained —
    // it carries its own captured geometry and time origin.
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var anims = animations[key];
      for (var step in anims) drawAnimation(key, anims[step]);
    }

    drawCenterDot();
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
