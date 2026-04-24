/* ═══════════════════════════════════════════════════════════════
   TEST — viz mode (flower WIP)
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var leafTips = [];
// Polyline from center to each leaf (through bend vertices), per instrument.
// Used to animate a small ball traveling along the branches each step.
var leafPaths = { kick: [], snare: [], hihat: [] };
// Steps that have fired this cycle, per instrument. Cleared at cycle wrap.
var hitSet   = { kick: {}, snare: {}, hihat: {} };
var lastStep = { kick: -1, snare: -1, hihat: -1 };
// Becomes true once step 0 has actually played on this play session; reset
// on stop. Before that (during the 50 ms startup delay), contStep is
// negative and would wrap to count-1 — which would flash the trail as if
// a full cycle had already run.
var firstStepReached = { kick: false, snare: false, hihat: false };
// Polyline nodes that are already part of the solid trail this cycle
// (keyed by "x,y"). The next step's ball emerges from the deepest node
// of its path that is already in this set — i.e. the branch point it
// shares with the previously-traversed tree.
var traversedNodes = { kick: {}, snare: {}, hihat: {} };
var lastCurrent    = { kick: -1, snare: -1, hihat: -1 };

function startIndexFromTraversed(path, set) {
  var last = 0;
  for (var i = 0; i < path.length; i++) {
    if (set[path[i].x + ',' + path[i].y]) last = i;
    else break;
  }
  return last;
}

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

function drawBranch(key, tree, cx, cy, aStart, aEnd, parentX, parentY, pAngle, depthFromRoot, totalDepth, parentPath) {
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
      var path = parentPath.slice();
      if (Math.hypot(vx - parentX, vy - parentY) > 0.5 &&
          Math.hypot(tx - vx, ty - vy) > 0.5) {
        path.push({ x: vx, y: vy });
      }
      path.push({ x: tx, y: ty });
      leafPaths[key].push(path);
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
    var childPath = parentPath.slice();
    if (Math.hypot(vx - parentX, vy - parentY) > 0.5 &&
        Math.hypot(cxC - vx, cyC - vy) > 0.5) {
      childPath.push({ x: vx, y: vy });
    }
    childPath.push({ x: cxC, y: cyC });
    drawBranch(key, tree[i], cx, cy, cAStart, cAEnd, cxC, cyC, cMid, depthFromRoot + 1, totalDepth, childPath);
  }
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

// Re-draw, in solid ink, the portion of each path that the ball has
// already traversed during the current cycle: full polyline for completed
// steps, partial polyline up to the ball for the current step.
function drawTrail(key) {
  if (!TR.state.isPlaying) {
    firstStepReached[key] = false;
    traversedNodes[key] = {};
    lastCurrent[key] = -1;
    return;
  }
  var ip = null;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) { ip = TR.state.instPlayback[i]; break; }
  }
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
  // Cycle wrap: reset trail accumulation
  if (lastCurrent[key] > current) traversedNodes[key] = {};
  lastCurrent[key] = current;
  // Mark all nodes of completed paths as traversed
  for (var i = 0; i < current; i++) {
    var p = leafPaths[key][i];
    if (!p) continue;
    for (var j = 0; j < p.length; j++) {
      traversedNodes[key][p[j].x + ',' + p[j].y] = true;
    }
  }

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  function drawFull(path) {
    if (!path || path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  }
  function drawPartial(path, frac) {
    if (!path || path.length < 2 || frac <= 0) return;
    var totalLen = 0, segLens = [];
    for (var i = 1; i < path.length; i++) {
      var l = Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
      segLens.push(l);
      totalLen += l;
    }
    if (totalLen === 0) return;
    var target = frac * totalLen;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    var acc = 0;
    for (var i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] <= target) {
        ctx.lineTo(path[i+1].x, path[i+1].y);
        acc += segLens[i];
      } else {
        var segFrac = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
        ctx.lineTo(
          path[i].x + segFrac * (path[i+1].x - path[i].x),
          path[i].y + segFrac * (path[i+1].y - path[i].y)
        );
        break;
      }
    }
    ctx.stroke();
  }

  for (var i = 0; i < current; i++) drawFull(leafPaths[key][i]);
  // Current step: start from the deepest node shared with the trail so far
  var curPath = leafPaths[key][current];
  if (curPath) {
    var startIdx = startIndexFromTraversed(curPath, traversedNodes[key]);
    drawPartial(curPath.slice(startIdx), fracWithinStep);
  }
}

function drawBall(key) {
  if (!TR.state.isPlaying) return;
  var ip = null;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) { ip = TR.state.instPlayback[i]; break; }
  }
  if (!ip || !ip.secPerStep || !ip.count) return;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  if (contStep < 0 && !firstStepReached[key]) return;
  var stepIdx = Math.floor(contStep);
  var fracWithinStep = contStep - stepIdx;
  stepIdx = ((stepIdx % ip.count) + ip.count) % ip.count;
  var path = leafPaths[key][stepIdx];
  if (!path) return;
  var startIdx = startIndexFromTraversed(path, traversedNodes[key]);
  var pos = pointAlongPath(path.slice(startIdx), fracWithinStep);
  if (!pos) return;
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function currentPlaybackStep(key) {
  if (!TR.state.isPlaying) return -1;
  var ip = null;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) { ip = TR.state.instPlayback[i]; break; }
  }
  if (!ip || !ip.secPerStep || !ip.count) return -1;
  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  return ((Math.floor(contStep) % ip.count) + ip.count) % ip.count;
}

function drawInstrumentFlower(key) {
  // Prefer current pattern's def so flat length always matches the tree
  var curPat = TR.state.patterns[TR.state.currentPattern];
  var def = (curPat && curPat[key + 'Def']) || (TR.getInstStructure && TR.getInstStructure(key));
  if (!def || !def.tree) return;
  var flat = TR.state[key + 'Flat'];
  var color = TR.rgbCSS(TR.INST_COLORS[key]);
  var playingStep = currentPlaybackStep(key);

  var depth = treeDepth(def.tree);
  var cx = vizW / 2;
  var cy = vizH / 2;
  var aStart = -Math.PI / 2;
  var aEnd   = Math.PI * 3 / 2;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([3, 3]);
  leafTips = [];
  leafPaths[key] = [];
  drawBranch(key, def.tree, cx, cy, aStart, aEnd, cx, cy, (aStart + aEnd) / 2, 0, depth, [{ x: cx, y: cy }]);
  ctx.setLineDash([]);

  // Small black dot at the flower center
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Circles only on active (on) steps, in track color.
  // Steps that have fired this cycle stay filled; others are outlines.
  // Cycle wrap (step index decreases) or stop resets the accumulation.
  if (playingStep < 0 || (lastStep[key] >= 0 && playingStep < lastStep[key])) {
    hitSet[key] = {};
  }
  if (flat && playingStep >= 0 && flat[playingStep]) {
    hitSet[key][playingStep] = true;
  }
  lastStep[key] = playingStep;

  if (!flat) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  var tipR = Math.max(3, Math.min(vizW, vizH) * 0.018);
  for (var i = 0; i < leafTips.length; i++) {
    if (!flat[i]) continue;
    ctx.beginPath();
    ctx.arc(leafTips[i].x, leafTips[i].y, tipR, 0, Math.PI * 2);
    if (hitSet[key][i]) {
      ctx.setLineDash([]);
      ctx.fill();
    } else {
      ctx.setLineDash([2, 2]);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
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
    drawTrail('kick');
    drawTrail('snare');
    drawBall('kick');
    drawBall('snare');
  },
  onHit: function(_key, _step, _level) {
    // placeholder
  }
};
})(window.TR));
