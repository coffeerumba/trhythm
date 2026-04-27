/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)

   Rendering model: stateless redraw from per-step animations. When audio
   fires for step k we register an animation: a yellow ball heads from
   the leaf inward to the LCA over one step's duration (drawing the
   trail behind it), then turns into a white eraser ball that retreats
   back to the leaf over half of THIS TRACK'S own cycle (the visible
   trail retracts along with it). The marker stays solid for the whole
   lifespan and blinks out the instant the eraser reaches the leaf.

   Each track's geometry, hit lookup, and cycle length are sourced from
   the track's own ip.currentPattern + ip.secPerStep + leaves count, not
   from the virtual pattern, so polymeter (拍同期) tracks stay aligned
   with their own audio.

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

/* ── PARAMETERS (per-instrument shape values). The canonical store is
   the in-memory `params` map. Most parameters use a fixed default
   below; leaf-len gets a per-instrument default so the three flowers
   read as nested layers. randomizeOnGenerate() writes fresh values
   into `params` on every generation cycle (depth-curve, bend, curve). ── */
var params = {};   // params[key + ':' + paramId] -> number

function setParam(key, paramId, val) { params[key + ':' + paramId] = val; }
function getParam(key, paramId, def) {
  var v = params[key + ':' + paramId];
  return (v == null) ? def : v;
}

var LEAF_LEN_DEFAULTS = { kick: 0.7, snare: 0.85, hihat: 1.0 };
function depthPower(key)  { return getParam(key, 'depth-curve', 1.0); }
function bendAlpha(key)   { return getParam(key, 'bend',        0.0); }
function leafSpread(key)  { return getParam(key, 'leaf-spread', 0.0); }
function branchOpen(key)  { return getParam(key, 'open',        1.0); }
function radiusFrac(key)  { return getParam(key, 'radius',      0.45); }
function curveAmount(key) { return getParam(key, 'curve',       0.0); }
function leafLength(key)  { return getParam(key, 'leaf-len',    LEAF_LEN_DEFAULTS[key] != null ? LEAF_LEN_DEFAULTS[key] : 1.0); }
/* ── END PARAMETERS ── */

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

// While playing, each track's flower comes from THAT track's own current
// pattern (ip.currentPattern), not the virtual pattern — so an async track
// shows its own structure even when its pattern lags behind the virtual one.
// When stopped, fall back to the visible virtual pattern for the static view.
function getTrackPat(key) {
  if (TR.state.isPlaying) {
    var ip = findIp(key);
    if (ip) return TR.state.patterns[ip.currentPattern];
  }
  return TR.state.patterns[TR.state.currentPattern];
}

function buildGeometry(key) {
  leafTips[key]  = [];
  leafPaths[key] = [];
  leafEdges[key] = [];
  var curPat = getTrackPat(key);
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
//     reverseSec = 0.5 × this track's own cycle (= secPerStep × leaves).
//   - past secPerStep+reverseSec: animation expires and is deleted; the
//     marker winks out at that exact instant (no fade).
// If the same step fires again before the prior animation's reverse finishes,
// the new firing replaces the entry — old branches & marker disappear, the
// new forward starts from leaf at frac=0.
var animations = { kick: {}, snare: {}, hihat: {} };
var lastPlayingStep = { kick: -1, snare: -1, hihat: -1 };

// Tessellate one bent edge (p1 → vertex → p2) into a polyline that follows
// the same arcTo-style rounded corner drawEdge() draws. We approximate the
// circular fillet with a quadratic Bézier from tangent T1 to T2, control at
// the vertex — visually indistinguishable for the curve range we use, and
// the polyline form lets us draw arbitrary partial portions of the curve
// without the arcTo→straight snap bug at the eraser tip. ──
function tessellateEdge(p1, vertex, p2, curve) {
  var d1 = Math.hypot(vertex.x - p1.x, vertex.y - p1.y);
  var d2 = Math.hypot(p2.x - vertex.x, p2.y - vertex.y);
  if (d1 < 0.5 || d2 < 0.5) {
    return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
  }
  var maxR = Math.min(d1, d2) * 0.95;
  var r = curve * maxR;
  if (r < 0.5) {
    return [{ x: p1.x, y: p1.y }, { x: vertex.x, y: vertex.y }, { x: p2.x, y: p2.y }];
  }
  // Tangent points on each leg, distance r from the vertex.
  var u1x = (p1.x - vertex.x) / d1, u1y = (p1.y - vertex.y) / d1;
  var u2x = (p2.x - vertex.x) / d2, u2y = (p2.y - vertex.y) / d2;
  var T1x = vertex.x + u1x * r, T1y = vertex.y + u1y * r;
  var T2x = vertex.x + u2x * r, T2y = vertex.y + u2y * r;

  var poly = [];
  poly.push({ x: p1.x, y: p1.y });
  poly.push({ x: T1x,  y: T1y  });
  var N = 12; // segments along the rounded corner
  for (var k = 1; k < N; k++) {
    var t  = k / N;
    var mt = 1 - t;
    poly.push({
      x: mt * mt * T1x + 2 * mt * t * vertex.x + t * t * T2x,
      y: mt * mt * T1y + 2 * mt * t * vertex.y + t * t * T2y
    });
  }
  poly.push({ x: T2x, y: T2y });
  poly.push({ x: p2.x, y: p2.y });
  return poly;
}

// Build a single leaf→LCA polyline (curve-aware) used for both the trail
// drawing and the ball's position. LCA is the deepest path node already
// traversed by any earlier hit step in the current cycle.
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
  var curve = curveAmount(key);
  var pathSlice = [];
  for (var ri = fwd.length - 1; ri >= 0; ri--) {
    var e = fwd[ri];
    var sub = tessellateEdge(e.p2, e.vertex, e.p1, curve);
    if (pathSlice.length === 0) pathSlice.push(sub[0]);
    for (var k = 1; k < sub.length; k++) pathSlice.push(sub[k]);
  }
  var tip = leafTips[key][step];
  return {
    pathSlice: pathSlice,
    leafTip:   tip ? { x: tip.x, y: tip.y } : null
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
    // Per-track hit lookup: read from this track's own current pattern.
    // TR.state.kickFlat etc. only follow the virtual pattern, which lags for
    // async (拍同期) tracks.
    var trackPat = TR.state.patterns[ip.currentPattern];
    var flat = trackPat ? trackPat[key] : null;
    if (flat && flat[playingStep]) {
      var geom = captureAnimGeom(key, playingStep, flat);
      if (geom) {
        // Reverse runs over half of THIS track's own cycle, not the virtual
        // cycle — so async tracks erase at their own tempo.
        var trackLeaves = flat.length;
        var trackCycle  = ip.secPerStep * trackLeaves;
        animations[key][playingStep] = {
          firingTime: Tone.now(),
          secPerStep: ip.secPerStep,
          cycleSec:   0.5 * trackCycle,
          pathSlice:  geom.pathSlice,
          leafTip:    geom.leafTip
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

// Stroke the visible portion of one animation's polyline: from the leaf
// (poly[0]) up to fraction `frac` of the total polyline length. Forward
// uses frac growing 0→1; reverse uses frac shrinking 1→0. Because the
// polyline already encodes the curve via tessellation, the partial edge
// follows the curve smoothly with no straight-snap at the eraser tip.
function strokeAnimPath(poly, frac) {
  if (!poly || poly.length < 2 || frac <= 0) return;
  var lens = [], total = 0;
  for (var i = 1; i < poly.length; i++) {
    var l = Math.hypot(poly[i].x - poly[i-1].x, poly[i].y - poly[i-1].y);
    lens.push(l);
    total += l;
  }
  if (total === 0) return;
  var target = frac * total;
  var acc = 0;
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (var i = 0; i < lens.length; i++) {
    if (acc + lens[i] <= target) {
      ctx.lineTo(poly[i+1].x, poly[i+1].y);
      acc += lens[i];
    } else {
      var rem = target - acc;
      var f = lens[i] > 0 ? rem / lens[i] : 0;
      ctx.lineTo(poly[i].x + f * (poly[i+1].x - poly[i].x),
                 poly[i].y + f * (poly[i+1].y - poly[i].y));
      break;
    }
  }
  ctx.stroke();
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
  strokeAnimPath(anim.pathSlice, frac);

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

// Returns the 0..1 progress through the current leaf-step of the default
// 拍構造 — but only when that step is a beat (computeLevels >= beatLevel).
// Outside a beat step (or playback off), returns null. Used by drawCenterDot
// to ease the trunk dot from marker-size at the beat onset down to its
// idle size as the beat step elapses.
function defaultBeatStepProgress() {
  if (!TR.state.isPlaying || !TR.state.virtualCycle || !TR.state.virtualCycleEnd) return null;
  var pat = TR.state.patterns[TR.state.currentPattern];
  var defaultDef = pat && pat.defaultDef;
  if (!defaultDef || !defaultDef.tree) return null;
  var levels = TR.computeLevels(defaultDef.tree);
  if (!levels.length) return null;
  var elapsed = Tone.now() - (TR.state.virtualCycleEnd - TR.state.virtualCycle);
  var pos = ((elapsed / TR.state.virtualCycle) % 1 + 1) % 1;
  var stepFloat = pos * levels.length;
  var step = Math.floor(stepFloat);
  if (step < 0 || step >= levels.length) return null;
  if (levels[step] < (defaultDef.beatLevel || 1)) return null;
  return stepFloat - step;
}

function drawCenterDot() {
  var idleR = 4;
  var beatR = Math.max(3, Math.min(vizW, vizH) * 0.018);
  var p = defaultBeatStepProgress();
  // Linear shrink from beatR back to idleR across the beat-step's duration.
  var r = (p == null) ? idleR : beatR + (idleR - beatR) * p;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(vizW / 2, vizH / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ── RANDOMIZE-ON-GENERATE ──
   Every time 'btn-generate' fires (whether a real click or a synthetic
   one from struct/beats changes), pick a fresh random value per entry
   in RANDOM_PARAMS and apply it identically to every track in
   TR.INSTRUMENTS. Writes go through setParam(), which feeds the
   in-memory `params` map that the readers (depthPower etc.) consume.
   Add a new randomized param by appending to the list. ── */
var RANDOM_PARAMS = [
  { id: 'depth-curve', min: 0.3, max: 3 },
  { id: 'bend',        min: 0,   max: 1 },
  { id: 'curve',       min: 0,   max: 1 }
];
function randomizeOnGenerate() {
  var keys = (window.TR && TR.INSTRUMENTS) || ['kick', 'snare', 'hihat'];
  for (var p = 0; p < RANDOM_PARAMS.length; p++) {
    var spec = RANDOM_PARAMS[p];
    var v = +(spec.min + Math.random() * (spec.max - spec.min)).toFixed(2);
    for (var i = 0; i < keys.length; i++) setParam(keys[i], spec.id, v);
  }
}
var _genBtn = document.getElementById('btn-generate');
if (_genBtn) _genBtn.addEventListener('click', randomizeOnGenerate);

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
