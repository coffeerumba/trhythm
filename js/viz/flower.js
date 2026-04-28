/* ═══════════════════════════════════════════════════════════════
   FLOWER (花) — viz mode

   Three flowers (kick / snare / hihat) overlaid on one canvas. Each
   track owns its own geometry and timing, sourced from THAT track's
   own playback state — so async (拍同期) tracks rotate at their own
   tempo independent of the virtual cycle.

   When a hit fires, an animation runs on that track's leaf:
     1. forward (one step):        yellow ball runs leaf → LCA, drawing
                                   a black trail behind it.
     2. reverse (½ track-cycle):   white eraser ball returns LCA → leaf,
                                   the trail retracting along with it.
     3. expire:                    marker winks out, animation deleted.
   Same step refiring before reverse finishes simply replaces the entry.

   The trunk dot pulses to marker-size at every beat-level leaf step of
   the default 拍構造 and eases back to its idle radius.

   Each frame we just clearRect → rebuild geometry → tick animations →
   redraw active animations. No persist canvas, no masks.
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {

var ctx, vizW, vizH;

/* ── Per-instrument shape parameters ────────────────────────────────
   `params[key + ':' + id]` is the canonical store. randomizeOnGenerate
   writes fresh values into it on every generation cycle. The reader
   `param(key, id)` falls back through DEFAULTS_PER_INST and DEFAULTS
   when no value has been set. ── */
var params = {};
var DEFAULTS = {
  'depth-curve': 1.0, 'bend':   0.0, 'leaf-spread': 0.0,
  'open':        1.0, 'radius': 0.45,'curve':       0.0,
  'leaf-len':    1.0
};
var DEFAULTS_PER_INST = {
  'leaf-len': { kick: 0.7, snare: 0.85, hihat: 1.0, crash: 0.55 }
};
function param(key, id) {
  var v = params[key + ':' + id];
  if (v != null) return v;
  var perInst = DEFAULTS_PER_INST[id];
  if (perInst && perInst[key] != null) return perInst[key];
  return DEFAULTS[id];
}
function setParam(key, id, val) { params[key + ':' + id] = val; }

/* ── Geometric primitives ────────────────────────────────────────── */
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

// Tessellate a bent edge p1 → vertex → p2 into a polyline whose corner
// approximates the same arcTo fillet the original draw code produced.
// The fillet is approximated by a 12-segment quadratic Bézier from
// tangent T1 to T2 with control = vertex — visually indistinguishable
// for our curve range, and crucial for partial drawing without the
// straight-snap we'd get from a sharp L corner.
function tessellateCorner(p1, vertex, p2, curveAmt) {
  var d1 = Math.hypot(vertex.x - p1.x, vertex.y - p1.y);
  var d2 = Math.hypot(p2.x - vertex.x, p2.y - vertex.y);
  if (d1 < 0.5 || d2 < 0.5) return [p1, p2];
  var maxR = Math.min(d1, d2) * 0.95;
  var r = curveAmt * maxR;
  if (r < 0.5) return [p1, vertex, p2];
  var T1 = { x: vertex.x + (p1.x - vertex.x) / d1 * r,
             y: vertex.y + (p1.y - vertex.y) / d1 * r };
  var T2 = { x: vertex.x + (p2.x - vertex.x) / d2 * r,
             y: vertex.y + (p2.y - vertex.y) / d2 * r };
  var poly = [p1, T1];
  for (var k = 1; k < 12; k++) {
    var t = k / 12, mt = 1 - t;
    poly.push({
      x: mt*mt*T1.x + 2*mt*t*vertex.x + t*t*T2.x,
      y: mt*mt*T1.y + 2*mt*t*vertex.y + t*t*T2.y
    });
  }
  poly.push(T2);
  poly.push(p2);
  return poly;
}

/* ── Per-track flower geometry ─────────────────────────────────────
   leaves[key][i] = {
     nodes:     [root, depth1, ..., leaf]       — node-level path,
                                                  used for LCA detection
                                                  (shared root prefix).
     tessEdges: [tess(edge0), ..., tess(edgeN)] — root→leaf direction,
                                                  curve-aware polylines
                                                  (one per branch edge).
   }
   Tessellation happens once per geometry rebuild — animations just
   slice & reverse pre-computed polylines instead of regenerating them.
── */
var leaves = { kick: [], snare: [], hihat: [], crash: [] };

function findIp(key) {
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) return TR.state.instPlayback[i];
  }
  return null;
}

// During playback, each track shows its own current pattern's tree (so
// async tracks render their own structure even when their pattern lags
// behind the virtual one). When stopped, fall back to the visible
// virtual pattern so the static view still makes sense.
function trackPat(key) {
  if (TR.state.isPlaying) {
    var ip = findIp(key);
    if (ip) return TR.state.patterns[ip.currentPattern];
  }
  return TR.state.patterns[TR.state.currentPattern];
}

// Pure helper: given a track key, its def, and canvas dims, build the
// leaves array. Reads shape parameters from the global `params` map. Same
// math as the realtime path — used by both buildGeometry() (realtime) and
// the offline schedule builder (export).
function buildLeavesFor(key, def, w, h) {
  if (!def || !def.tree) return [];

  var totalDepth = treeDepth(def.tree);
  var cx = w / 2, cy = h / 2;
  var rMax     = Math.min(w, h) * param(key, 'radius');
  var p        = param(key, 'depth-curve');
  var bendAmt  = param(key, 'bend');
  var spread   = param(key, 'leaf-spread');
  var openT    = param(key, 'open');
  var leafL    = param(key, 'leaf-len');
  var curveAmt = param(key, 'curve');

  var out = [];
  function recur(tree, aStart, aEnd, parentX, parentY, pAngle, depth, parentNodes, parentTess) {
    var open    = 1 - Math.pow(1 - openT, totalDepth - depth);
    var rCurr   = rMax * Math.pow(depth        / totalDepth, p);
    var rChild  = rMax * Math.pow((depth + 1)  / totalDepth, p);
    var rBend   = rCurr + bendAmt * (rChild - rCurr);
    var mid     = (depth === 0) ? -Math.PI / 2 : (aStart + aEnd) / 2;

    if (!Array.isArray(tree)) {
      for (var i = 0; i < tree; i++) {
        var centered = (i + 0.5) / tree;
        var edged    = (tree > 1) ? i / (tree - 1) : 0.5;
        var t        = (1 - spread) * centered + spread * edged;
        var aDef     = nearestAngle(aStart + t * (aEnd - aStart), mid);
        var a        = mid + open * (aDef - mid);
        var defX     = cx + Math.cos(a) * rChild;
        var defY     = cy + Math.sin(a) * rChild;
        var tip      = { x: parentX + leafL * (defX - parentX),
                         y: parentY + leafL * (defY - parentY) };
        var bAng     = (depth === 0) ? a : pAngle;
        var p1       = { x: parentX, y: parentY };
        var v        = { x: cx + Math.cos(bAng) * rBend, y: cy + Math.sin(bAng) * rBend };
        out.push({
          nodes:     parentNodes.concat([tip]),
          tessEdges: parentTess.concat([tessellateCorner(p1, v, tip, curveAmt)])
        });
      }
      return;
    }

    var len = tree.length;
    var wedgeW  = (aEnd - aStart) / len;
    var scaledW = wedgeW * open;
    for (var i = 0; i < len; i++) {
      var defCenter = nearestAngle(aStart + (i + 0.5) * wedgeW, mid);
      var cMid      = mid + open * (defCenter - mid);
      var node      = { x: cx + Math.cos(cMid) * rChild,
                        y: cy + Math.sin(cMid) * rChild };
      var bAng      = (depth === 0) ? cMid : pAngle;
      var p1        = { x: parentX, y: parentY };
      var v         = { x: cx + Math.cos(bAng) * rBend, y: cy + Math.sin(bAng) * rBend };
      recur(tree[i],
            cMid - scaledW / 2, cMid + scaledW / 2,
            node.x, node.y, cMid, depth + 1,
            parentNodes.concat([node]),
            parentTess.concat([tessellateCorner(p1, v, node, curveAmt)]));
    }
  }

  var root = { x: cx, y: cy };
  recur(def.tree, -Math.PI / 2, Math.PI * 3 / 2, cx, cy, 0, 0, [root], []);
  return out;
}

function buildGeometry(key) {
  var pat = trackPat(key);
  // Crash is a synthetic track keyed off the default 拍構造; the regular
  // tracks read their own per-instrument tree (pat[key + 'Def']).
  var def = (key === 'crash')
    ? (pat && pat.defaultDef)
    : ((pat && pat[key + 'Def']) || (TR.getInstStructure && TR.getInstStructure(key)));
  leaves[key] = buildLeavesFor(key, def, vizW, vizH);
}

/* ── Polyline utilities ─────────────────────────────────────────── */

// Cumulative segment lengths + total. Built once per animation, then
// reused by both pointAt() and strokePartial() each frame.
function precomputeLengths(poly) {
  var segs = [], total = 0;
  for (var i = 1; i < poly.length; i++) {
    var l = Math.hypot(poly[i].x - poly[i-1].x, poly[i].y - poly[i-1].y);
    segs.push(l);
    total += l;
  }
  return { segs: segs, total: total };
}

function pointAt(poly, lens, frac) {
  if (lens.total === 0) return poly[0];
  var target = frac * lens.total, acc = 0;
  for (var i = 0; i < lens.segs.length; i++) {
    if (acc + lens.segs[i] >= target) {
      var f = lens.segs[i] > 0 ? (target - acc) / lens.segs[i] : 0;
      return {
        x: poly[i].x + f * (poly[i+1].x - poly[i].x),
        y: poly[i].y + f * (poly[i+1].y - poly[i].y)
      };
    }
    acc += lens.segs[i];
  }
  return poly[poly.length - 1];
}

function strokePartial(c, poly, lens, frac) {
  if (lens.total === 0 || frac <= 0) return;
  var target = frac * lens.total, acc = 0;
  c.beginPath();
  c.moveTo(poly[0].x, poly[0].y);
  for (var i = 0; i < lens.segs.length; i++) {
    if (acc + lens.segs[i] <= target) {
      c.lineTo(poly[i+1].x, poly[i+1].y);
      acc += lens.segs[i];
    } else {
      var f = lens.segs[i] > 0 ? (target - acc) / lens.segs[i] : 0;
      c.lineTo(poly[i].x + f * (poly[i+1].x - poly[i].x),
               poly[i].y + f * (poly[i+1].y - poly[i].y));
      break;
    }
  }
  c.stroke();
}

/* ── Animations ───────────────────────────────────────────────────
   animations[key][step] holds at most one entry per leaf-step. New
   firings on the same step replace the entry (so old branches and
   marker disappear that frame). Each entry caches its own polyline
   (leaf → LCA, curve-aware) and the cumulative segment lengths so the
   draw path is just a couple of slice operations per frame. ── */
var animations      = { kick: {}, snare: {}, hihat: {}, crash: {} };
var lastPlayingStep = { kick: -1, snare: -1, hihat: -1 };
// Latches once per playback session. Until contStep first goes ≥ 0 we
// don't trust the mod-arithmetic playingStep (it would falsely report
// the last step at startup). After the first reach, contStep can dip
// negative again at every cycle wrap — that's expected and benign.
var started = { kick: false, snare: false, hihat: false };
// Crash is registered once per virtual cycle; track the start-time of the
// last cycle we registered so we don't double-fire within one cycle.
var crashLastCycleStart = -1;

// Common-prefix length of two node sequences (compared by coordinates).
// Both sequences start at the shared root, so the result is at least 1.
function commonPrefix(a, b) {
  var n = Math.min(a.length, b.length);
  for (var i = 0; i < n; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return i;
  }
  return n;
}

// Build the leaf → LCA polyline for `step` within a single track's leaves
// array. LCA = deepest tree node shared with any earlier hit step in this
// cycle. Concatenates the kept edge tessellations in reverse order
// (leaf-most first), reversing each internally and dropping boundary
// duplicates.
function buildLeafToLcaPath(leavesArr, step, flat) {
  var leaf = leavesArr[step];
  if (!leaf) return null;

  var sharedNodes = 1;  // the root is always shared
  for (var i = 0; i < step; i++) {
    if (!flat[i]) continue;
    var other = leavesArr[i];
    if (!other) continue;
    var c = commonPrefix(leaf.nodes, other.nodes);
    if (c > sharedNodes) sharedNodes = c;
  }
  var keep = leaf.tessEdges.slice(sharedNodes - 1);

  var poly = [];
  for (var ei = keep.length - 1; ei >= 0; ei--) {
    var tess = keep[ei];
    var startI = (poly.length === 0) ? tess.length - 1 : tess.length - 2;
    for (var pi = startI; pi >= 0; pi--) poly.push(tess[pi]);
  }
  return poly;
}

function tick(key) {
  if (!TR.state.isPlaying) {
    animations[key] = {};
    lastPlayingStep[key] = -1;
    started[key] = false;
    return;
  }
  var ip = findIp(key);
  if (!ip || !ip.secPerStep || !ip.count) return;

  var stepsUntilNext = Math.max(0, (ip.nextTime - Tone.now()) / ip.secPerStep);
  var contStep = ip.step - stepsUntilNext;
  if (!started[key]) {
    if (contStep < 0) { prune(key); return; }
    started[key] = true;
  }
  var playingStep = ((Math.floor(contStep) % ip.count) + ip.count) % ip.count;

  if (playingStep !== lastPlayingStep[key]) {
    var pat  = TR.state.patterns[ip.currentPattern];
    var flat = pat && pat[key];
    if (flat && flat[playingStep]) {
      var poly = buildLeafToLcaPath(leaves[key], playingStep, flat);
      if (poly && poly.length >= 1) {
        animations[key][playingStep] = {
          firingTime: Tone.now(),
          forwardSec: ip.secPerStep,
          reverseSec: 0.5 * ip.secPerStep * flat.length,  // half this track's own cycle
          poly:       poly,
          lens:       precomputeLengths(poly)
        };
      }
    }
    lastPlayingStep[key] = playingStep;
  }
  prune(key);
}

function prune(key) {
  var now = Tone.now();
  var anims = animations[key];
  for (var s in anims) {
    var a = anims[s];
    if (now > a.firingTime + a.forwardSec + a.reverseSec) delete anims[s];
  }
}

// Crash uses a different audio model: it fires once per virtual cycle,
// only when the accent mode is non-'off', regardless of step pattern. We
// detect cycle wraps by watching virtualCycleEnd advance and register
// (or skip) the leaf-0 animation accordingly. Lifetime / shape / colors
// otherwise mirror a regular track's animation.
function tickCrash() {
  if (!TR.state.isPlaying) {
    animations.crash = {};
    crashLastCycleStart = -1;
    return;
  }
  if (!TR.state.virtualCycle || TR.state.virtualCycleEnd == null) return;

  // Accent OFF: clear any in-flight crash animation; nothing visible.
  if (TR.getAccentMode && TR.getAccentMode() === 'off') {
    animations.crash = {};
    crashLastCycleStart = -1;
    return;
  }

  var cycleStart = TR.state.virtualCycleEnd - TR.state.virtualCycle;
  if (cycleStart !== crashLastCycleStart) {
    crashLastCycleStart = cycleStart;
    var crashLeaves = leaves.crash;
    if (crashLeaves.length) {
      var poly = buildLeafToLcaPath(crashLeaves, 0, []);
      if (poly && poly.length >= 1) {
        animations.crash[0] = {
          firingTime: cycleStart,
          forwardSec: TR.state.virtualCycle / crashLeaves.length,
          reverseSec: 0.5 * TR.state.virtualCycle,
          poly:       poly,
          lens:       precomputeLengths(poly)
        };
      }
    }
  }
  prune('crash');
}

/* ── Drawing ─────────────────────────────────────────────────────── */

// Crash isn't in TR.INST_COLORS (not a regular instrument). Hardcode its
// marker color to the same purple as the global --accent-color.
var CRASH_MARKER_COLOR = 'rgb(136,68,204)';
function markerColor(key) {
  return key === 'crash' ? CRASH_MARKER_COLOR : TR.rgbCSS(TR.INST_COLORS[key]);
}

// Pure draw routine — uses no closure state. The realtime path
// (drawAnimation) and the offline export both go through here.
function drawAnimationCore(c, w, h, t, key, anim) {
  var elapsed = t - anim.firingTime;
  if (elapsed < 0) return;
  var frac, ballColor;
  if (elapsed < anim.forwardSec) {
    frac      = elapsed / anim.forwardSec;
    ballColor = '#000';
  } else if (elapsed < anim.forwardSec + anim.reverseSec) {
    frac      = 1 - (elapsed - anim.forwardSec) / anim.reverseSec;
    ballColor = '#fff';
  } else return;

  // All pixel-sized constants below scale with min(w, h) so the visual
  // output is the same regardless of backing-store resolution. Tuned
  // against the legacy ~540px-tall canvas: 4px ball / 4px idle dot /
  // 1px line. Roughly: 0.008 for dots, 0.002 for line widths.
  var unit = Math.min(w, h);
  var ballR = Math.max(2, unit * 0.008);
  var lineW = Math.max(1, unit * 0.002);

  // Trail: leaf → ball position, in solid black.
  c.strokeStyle = '#000';
  c.lineWidth   = lineW;
  c.lineCap     = 'round';
  c.lineJoin    = 'round';
  strokePartial(c, anim.poly, anim.lens, frac);

  // Marker at the leaf tip (poly[0]) for the full lifespan.
  var tipR = Math.max(3, unit * 0.018);
  c.fillStyle = markerColor(key);
  c.beginPath();
  c.arc(anim.poly[0].x, anim.poly[0].y, tipR, 0, Math.PI * 2);
  c.fill();

  // Ball: black heading inward, white heading back out, both with a
  // black outline so they read clearly against any background.
  var pos = pointAt(anim.poly, anim.lens, frac);
  c.beginPath();
  c.arc(pos.x, pos.y, ballR, 0, Math.PI * 2);
  c.fillStyle = ballColor;
  c.fill();
  c.strokeStyle = '#000';
  c.lineWidth = lineW;
  c.stroke();
}

function drawAnimation(key, anim) {
  drawAnimationCore(ctx, vizW, vizH, Tone.now(), key, anim);
}

// Pure: returns 0..1 progress through the current beat-level leaf step of
// the supplied default 拍構造, or null when not in a beat step. `t` is
// time in seconds since the start of the cycle that contains it; given
// `cycleStart` and `cycleDur`, we wrap to find the position within cycle.
function beatStepProgressCore(t, defaultDef, cycleStart, cycleDur) {
  if (!defaultDef || !defaultDef.tree || !cycleDur) return null;
  var levels = TR.computeLevels(defaultDef.tree);
  if (!levels.length) return null;
  var elapsed = t - cycleStart;
  var pos = ((elapsed / cycleDur) % 1 + 1) % 1;
  var stepFloat = pos * levels.length;
  var step = Math.floor(stepFloat);
  if (step < 0 || step >= levels.length) return null;
  if (levels[step] < (defaultDef.beatLevel || 1)) return null;
  return stepFloat - step;
}

function drawCenterDotCore(c, w, h, progress) {
  var unit = Math.min(w, h);
  var idleR = Math.max(2, unit * 0.008);
  var beatR = Math.max(3, unit * 0.018);
  var r = (progress == null) ? idleR : beatR + (idleR - beatR) * progress;
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  c.fill();
}

function drawCenterDot() {
  var p = TR.state.isPlaying
    ? beatStepProgressCore(
        Tone.now(),
        (TR.state.patterns[TR.state.currentPattern] || {}).defaultDef,
        (TR.state.virtualCycleEnd || 0) - (TR.state.virtualCycle || 0),
        TR.state.virtualCycle || 0
      )
    : null;
  drawCenterDotCore(ctx, vizW, vizH, p);
}

/* ── Randomize-on-generate ──────────────────────────────────────────
   Every 'btn-generate' click (real or synthetic, fired from
   struct/beats changes) rolls one fresh random value per entry below
   and applies it identically to every track in TR.INSTRUMENTS. New
   tracks are picked up automatically. ── */
var RANDOM_PARAMS = [
  { id: 'depth-curve', min: 0.3, max: 3 },
  { id: 'bend',        min: 0,   max: 1 },
  { id: 'curve',       min: 0,   max: 1 }
];
// All viz tracks: regular instruments + the synthetic Crash track.
var VIZ_KEYS = ((TR && TR.INSTRUMENTS) || ['kick', 'snare', 'hihat']).concat(['crash']);

function randomizeOnGenerate() {
  for (var p = 0; p < RANDOM_PARAMS.length; p++) {
    var spec = RANDOM_PARAMS[p];
    var v = +(spec.min + Math.random() * (spec.max - spec.min)).toFixed(2);
    for (var i = 0; i < VIZ_KEYS.length; i++) setParam(VIZ_KEYS[i], spec.id, v);
  }
}
var _genBtn = document.getElementById('btn-generate');
if (_genBtn) _genBtn.addEventListener('click', randomizeOnGenerate);

/* ── Public offline-export API ──────────────────────────────────────
   These two functions let the video exporter render the flower to any
   canvas at any virtual time, without going through the realtime
   playback state. They mirror what the realtime path produces, frame
   for frame, given the same shape parameters.

   buildSchedule(pats, bpm, accentMode, w, h):
     Returns { totalDuration, slots, firings } — one cycle's worth of
     animation events. Each `firing` has firingTime, forwardSec,
     reverseSec, poly, lens, key. The exporter doubles this list (for
     seamless looping) before rendering.

   renderFrame(targetCtx, w, h, t, schedule):
     Clears `targetCtx`, draws every animation in `schedule.firings`
     that is alive at time `t`, plus the trunk dot. Pure — does not
     read any realtime state.
── */
TR.flower = TR.flower || {};

TR.flower.buildSchedule = function(pats, bpm, accentMode, w, h) {
  var slots = [];
  var firings = [];
  var offset = 0;

  for (var p = 0; p < pats.length; p++) {
    var entry = pats[p];
    var pat = entry.pat || entry;  // accept either { pat, bankIdx } or pat directly
    if (!pat) continue;

    // Per-track step durations + leaves count (matches existing renderOffline).
    var trackInfo = {};
    var maxCycle = 0;
    var REGULAR = ['kick', 'snare', 'hihat'];
    for (var ti = 0; ti < REGULAR.length; ti++) {
      var key = REGULAR[ti];
      var def = pat[key + 'Def'];
      if (!def) continue;
      var trackBeats  = pat[key + 'Beats'] || TR.computeBeats(def);
      var trackLeaves = TR.computeLevels(def.tree).length;
      var secPerStep  = 60.0 * trackBeats / bpm / trackLeaves;
      var cycle       = secPerStep * trackLeaves;
      trackInfo[key] = {
        secPerStep: secPerStep, leaves: trackLeaves, cycle: cycle, def: def,
        leavesGeom: buildLeavesFor(key, def, w, h)
      };
      if (cycle > maxCycle) maxCycle = cycle;
    }
    var slotDur = maxCycle;
    var crashLeavesGeom = buildLeavesFor('crash', pat.defaultDef, w, h);

    // One firing per hit step per regular track.
    for (var ti2 = 0; ti2 < REGULAR.length; ti2++) {
      var key2 = REGULAR[ti2];
      var info = trackInfo[key2];
      var flat = pat[key2];
      if (!info || !flat) continue;
      var reverseSec = 0.5 * info.cycle;
      for (var s = 0; s < flat.length; s++) {
        if (!flat[s]) continue;
        var poly = buildLeafToLcaPath(info.leavesGeom, s, flat);
        if (!poly || !poly.length) continue;
        firings.push({
          firingTime: offset + s * info.secPerStep,
          forwardSec: info.secPerStep,
          reverseSec: reverseSec,
          poly:       poly,
          lens:       precomputeLengths(poly),
          key:        key2
        });
      }
    }

    // Crash: one firing at slot start when accent isn't 'off'.
    if (accentMode !== 'off' && crashLeavesGeom.length && slotDur > 0) {
      var cPoly = buildLeafToLcaPath(crashLeavesGeom, 0, []);
      if (cPoly && cPoly.length) {
        firings.push({
          firingTime: offset,
          forwardSec: slotDur / crashLeavesGeom.length,
          reverseSec: 0.5 * slotDur,
          poly:       cPoly,
          lens:       precomputeLengths(cPoly),
          key:        'crash'
        });
      }
    }

    slots.push({ offset: offset, duration: slotDur, defaultDef: pat.defaultDef });
    offset += slotDur;
  }

  // Sort by firing time so renderFrame can short-circuit once it passes t.
  firings.sort(function(a, b) { return a.firingTime - b.firingTime; });
  return { totalDuration: offset, slots: slots, firings: firings };
};

// Find the slot covering virtual time `t`. Slots are sorted by offset
// and contiguous, so a linear scan is fine for the frame counts we emit.
function slotAtTime(slots, t) {
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    if (s.offset <= t && t < s.offset + s.duration) return s;
  }
  return null;
}

// Optional 6th arg `bgFill`:
//   undefined or string color → fill that color before drawing (default white)
//   null                      → clearRect (transparent backdrop, for the
//                               PNG-sequence export which needs alpha)
TR.flower.renderFrame = function(c, w, h, t, schedule, bgFill) {
  if (bgFill === null) {
    c.clearRect(0, 0, w, h);
  } else {
    c.fillStyle = bgFill || '#fff';
    c.fillRect(0, 0, w, h);
  }

  var firings = schedule.firings;
  for (var i = 0; i < firings.length; i++) {
    var f = firings[i];
    if (f.firingTime > t) break;  // sorted — none after this can be active yet
    if (f.firingTime + f.forwardSec + f.reverseSec <= t) continue;
    drawAnimationCore(c, w, h, t, f.key, f);
  }

  var slot = slotAtTime(schedule.slots, t);
  var p = slot ? beatStepProgressCore(t, slot.defaultDef, slot.offset, slot.duration) : null;
  drawCenterDotCore(c, w, h, p);
};

/* ── Public viz interface ──────────────────────────────────────── */
return {
  name: '花',
  init:   function(_canvas, _ctx, w, h) { ctx = _ctx; vizW = w; vizH = h; },
  resize: function(w, h) { vizW = w; vizH = h; },
  frame:  function(_ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    for (var k = 0; k < VIZ_KEYS.length; k++) buildGeometry(VIZ_KEYS[k]);
    // Per-track ticks: Crash uses its own cycle-boundary detector.
    for (var k = 0; k < VIZ_KEYS.length; k++) {
      VIZ_KEYS[k] === 'crash' ? tickCrash() : tick(VIZ_KEYS[k]);
    }
    for (var k = 0; k < VIZ_KEYS.length; k++) {
      var anims = animations[VIZ_KEYS[k]];
      for (var s in anims) drawAnimation(VIZ_KEYS[k], anims[s]);
    }
    drawCenterDot();
  },
  onHit: function() {}
};

})(window.TR));
