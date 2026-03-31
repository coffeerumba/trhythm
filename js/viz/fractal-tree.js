/* ═══════════════════════════════════════════════════════════════
   FRACTAL TREE VISUALIZER — rhythm structure as a growing tree
   ═══════════════════════════════════════════════════════════════ */
TR.registerVisualizer((function(TR) {
var ctx, vizW, vizH;
var CELL = 8;

/* ── Palette (shared with circuit board) ── */
var BG = [10, 26, 10];
var DIM = [26, 42, 26];
var PAL = {
  kick:  { dark: [108, 0, 32], mid: [208, 48, 80], bright: [255, 128, 144] },
  snare: { dark: [12, 48, 96], mid: [34, 119, 204], bright: [96, 187, 255] },
  hihat: { dark: [26, 64, 32], mid: [85, 153, 85], bright: [144, 221, 144] }
};
var TRUNK_COLOR = [60, 90, 60];
var CURSOR_COLOR = [255, 204, 0];

function palColor(key, shade) {
  var p = PAL[key];
  return shade <= 0 ? p.dark : shade >= 2 ? p.bright : p.mid;
}

function cell(x, y, r, g, b) {
  var gx = Math.floor(x / CELL) * CELL;
  var gy = Math.floor(y / CELL) * CELL;
  if (gx < 0 || gx >= vizW || gy < 0 || gy >= vizH) return;
  ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
  ctx.fillRect(gx, gy, CELL - 1, CELL - 1);
}

/* ── Tree structure layout ── */
var branches = []; // [{x, y, depth, leafIdx, isLeaf, children, key, lit, litAge}]
var leaves = [];   // references to leaf nodes in branches
var trunkX, trunkBaseY;

function buildBranch(node, x, y, depth, spread, key) {
  if (!Array.isArray(node)) {
    // Leaf group: node = number of leaves (2 or 3)
    var leafNodes = [];
    for (var i = 0; i < node; i++) {
      var lx = x + (i - (node - 1) / 2) * spread * 0.4;
      var ly = y;
      var leaf = { x: lx, y: ly, depth: depth, leafIdx: leaves.length, isLeaf: true, children: [], key: key, lit: 0, litAge: 0 };
      branches.push(leaf);
      leaves.push(leaf);
      leafNodes.push(leaf);
    }
    return leafNodes;
  }
  // Internal node: create branch point and recurse
  var branchNode = { x: x, y: y, depth: depth, leafIdx: -1, isLeaf: false, children: [], key: key, lit: 0, litAge: 0 };
  branches.push(branchNode);
  var childSpread = spread / node.length;
  var stepY = Math.max(CELL * 3, Math.floor((vizH * 0.6) / (depth + 4)));
  for (var i = 0; i < node.length; i++) {
    var cx = x + (i - (node.length - 1) / 2) * spread;
    var cy = y - stepY;
    var childNodes = buildBranch(node[i], cx, cy, depth + 1, childSpread, key);
    branchNode.children = branchNode.children.concat(childNodes);
  }
  return [branchNode];
}

function rebuildTree() {
  branches = [];
  leaves = [];
  var pat = TR.state.patterns[TR.state.currentPattern];
  if (!pat) return;

  // Use kick's structure as the tree shape (most prominent)
  var def = pat.kickDef;
  if (!def) return;

  trunkX = vizW / 2;
  trunkBaseY = vizH - CELL * 3;
  var topMargin = CELL * 4;
  var spread = vizW * 0.35;

  buildBranch(def.tree, trunkX, trunkBaseY - CELL * 6, 0, spread, 'kick');
}

/* ── Per-track hit state ── */
var trackHits = {
  kick:  { active: [], cursor: -1 },
  snare: { active: [], cursor: -1 },
  hihat: { active: [], cursor: -1 }
};

function getFlat(key) {
  return key === 'kick' ? TR.state.kickFlat : key === 'snare' ? TR.state.snareFlat : TR.state.hihatFlat;
}

function getCursor(key) {
  if (!TR.state.isPlaying) return -1;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) return TR.state.instPlayback[i].step;
  }
  return -1;
}

/* ── Pulse rings from hits ── */
var pulses = []; // {x, y, r, g, b, radius, maxRadius, age}

/* ── Drawing ── */
function drawTrunk() {
  // Draw trunk from base to first branch point
  var c = TRUNK_COLOR;
  for (var y = trunkBaseY; y > trunkBaseY - CELL * 8; y -= CELL) {
    cell(trunkX - CELL, y, c[0], c[1], c[2]);
    cell(trunkX, y, c[0], c[1], c[2]);
  }
}

function drawBranches() {
  // Draw connections between branch points
  for (var i = 0; i < branches.length; i++) {
    var b = branches[i];
    if (b.isLeaf) continue;
    var c = b.lit > 0 ? palColor(b.key, 1) : TRUNK_COLOR;
    for (var j = 0; j < b.children.length; j++) {
      var child = b.children[j];
      // Vertical line from parent to child height
      var yFrom = b.y;
      var yTo = child.y;
      for (var y = Math.min(yFrom, yTo); y <= Math.max(yFrom, yTo); y += CELL) {
        cell(b.x, y, c[0], c[1], c[2]);
      }
      // Horizontal line to child x
      var xFrom = Math.min(b.x, child.x);
      var xTo = Math.max(b.x, child.x);
      for (var x = xFrom; x <= xTo; x += CELL) {
        cell(x, child.y, c[0], c[1], c[2]);
      }
    }
  }
}

function drawLeaves() {
  var keys = ['kick', 'snare', 'hihat'];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var flat = getFlat(key);
    var cursor = getCursor(key);
    if (!flat) continue;

    var pat = TR.state.patterns[TR.state.currentPattern];
    var def = pat ? pat[key + 'Def'] : null;
    if (!def) continue;
    var levels = TR.computeLevels(def.tree);
    var maxLevel = 0;
    for (var i = 0; i < levels.length; i++) if (levels[i] > maxLevel) maxLevel = levels[i];

    for (var i = 0; i < Math.min(flat.length, leaves.length); i++) {
      var leaf = leaves[i];
      var lvl = levels[i] || 0;
      var size = 1 + Math.floor(lvl / Math.max(maxLevel, 1) * 2);

      // Vertical offset per track to avoid overlap
      var offsetY = k * CELL * 2;

      var cr, cg, cb;
      if (cursor === i) {
        cr = CURSOR_COLOR[0]; cg = CURSOR_COLOR[1]; cb = CURSOR_COLOR[2];
        size += 1;
      } else if (flat[i]) {
        var c = palColor(key, lvl > maxLevel * 0.6 ? 2 : 1);
        cr = c[0]; cg = c[1]; cb = c[2];
      } else {
        var c = DIM;
        cr = c[0]; cg = c[1]; cb = c[2];
        size = 1;
      }

      // Draw as cluster of cells
      for (var dy = 0; dy < size; dy++) {
        for (var dx = 0; dx < size; dx++) {
          cell(leaf.x + (dx - Math.floor(size / 2)) * CELL,
               leaf.y - offsetY + (dy - Math.floor(size / 2)) * CELL,
               cr, cg, cb);
        }
      }
    }
  }
}

function drawPulses() {
  for (var i = pulses.length - 1; i >= 0; i--) {
    var p = pulses[i];
    p.radius += 2;
    p.age++;
    if (p.radius > p.maxRadius) { pulses.splice(i, 1); continue; }
    var fade = p.age / 30;
    var alpha = Math.max(0, 1 - fade);
    var r = Math.round(p.r * alpha + BG[0] * (1 - alpha));
    var g = Math.round(p.g * alpha + BG[1] * (1 - alpha));
    var b = Math.round(p.b * alpha + BG[2] * (1 - alpha));
    // Draw ring of cells
    var steps = Math.max(8, Math.floor(p.radius * 0.8));
    for (var s = 0; s < steps; s++) {
      var angle = (s / steps) * Math.PI * 2;
      var px = p.x + Math.cos(angle) * p.radius;
      var py = p.y + Math.sin(angle) * p.radius;
      cell(px, py, r, g, b);
    }
  }
}

/* ── Plugin interface ── */
return {
  name: 'フラクタルツリー',
  init: function(_canvas, _ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
    branches = [];
    leaves = [];
    pulses = [];
    rebuildTree();
  },
  resize: function(w, h) {
    vizW = w;
    vizH = h;
    pulses = [];
    rebuildTree();
  },
  frame: function(_ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;

    // Clear
    ctx.fillStyle = 'rgb(' + BG[0] + ',' + BG[1] + ',' + BG[2] + ')';
    ctx.fillRect(0, 0, vizW, vizH);

    // Rebuild tree if pattern changed
    var pat = TR.state.patterns[TR.state.currentPattern];
    if (pat && leaves.length === 0) rebuildTree();

    // Decay lit state
    for (var i = 0; i < branches.length; i++) {
      if (branches[i].lit > 0) branches[i].lit *= 0.92;
      if (branches[i].lit < 0.01) branches[i].lit = 0;
    }

    drawTrunk();
    drawBranches();
    drawLeaves();
    drawPulses();
  },
  onHit: function(key, step, level) {
    // Light up the leaf at this step
    if (step < leaves.length) {
      var leaf = leaves[step];
      leaf.lit = 1;
      leaf.key = key;

      // Propagate light up the tree
      for (var i = 0; i < branches.length; i++) {
        var b = branches[i];
        if (!b.isLeaf && b.children.indexOf(leaf) >= 0) {
          b.lit = 0.8;
          b.key = key;
        }
      }

      // Spawn pulse
      var c = palColor(key, 2);
      pulses.push({
        x: leaf.x, y: leaf.y,
        r: c[0], g: c[1], b: c[2],
        radius: 0, maxRadius: CELL * (4 + level * 2), age: 0
      });
    }
  },
  destroy: function() {
    branches = [];
    leaves = [];
    pulses = [];
  }
};
})(window.TR));
