/* ═══════════════════════════════════════════════════════════════
   FRACTAL TREE — viz mode (80s Macintosh monochrome style)
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;

/* ── Monochrome palette ── */
var WHITE = '#fff';
var BLACK = '#000';
var GRAY  = '#999';
var LIGHT = '#ccc';

/* ── Tree state ── */
var nodes = [];    // all nodes (branches + leaves)
var leaves = [];   // leaf nodes only
var trunkX, trunkBaseY;

/* ── Hit flash state ── */
var flashLeaves = {};  // { leafIdx: { key, age } }
var pulses = [];       // { x, y, radius, maxRadius }

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

/* ── Build tree layout ── */
function buildNode(tree, x, y, depth, totalW) {
  if (!Array.isArray(tree)) {
    // Leaf group
    var spacing = Math.min(totalW / tree, 20);
    for (var i = 0; i < tree; i++) {
      var lx = x + (i - (tree - 1) / 2) * spacing;
      var leaf = { x: lx, y: y, depth: depth, isLeaf: true, parent: null, children: [] };
      nodes.push(leaf);
      leaves.push(leaf);
    }
    return;
  }
  var node = { x: x, y: y, depth: depth, isLeaf: false, parent: null, children: [] };
  nodes.push(node);

  var childW = totalW / tree.length;
  var stepY = Math.min(60, Math.max(30, vizH * 0.12));
  for (var i = 0; i < tree.length; i++) {
    var cx = x + (i - (tree.length - 1) / 2) * childW;
    var cy = y - stepY;
    var childStart = nodes.length;
    buildNode(tree[i], cx, cy, depth + 1, childW * 0.9);
    // Link first node added as child
    var child = nodes[childStart];
    if (child) {
      child.parent = node;
      node.children.push(child);
    }
  }
}

function rebuildTree() {
  nodes = [];
  leaves = [];
  flashLeaves = {};
  pulses = [];
  var pat = TR.state.patterns[TR.state.currentPattern];
  if (!pat || !pat.kickDef) return;

  trunkX = vizW / 2;
  trunkBaseY = vizH - 30;
  var treeTop = 40;
  var spread = vizW * 0.7;

  buildNode(pat.kickDef.tree, trunkX, trunkBaseY - 50, 0, spread);
}

/* ── Drawing helpers ── */
function line(x0, y0, x1, y1, width, color) {
  ctx.beginPath();
  ctx.moveTo(Math.round(x0), Math.round(y0));
  ctx.lineTo(Math.round(x1), Math.round(y1));
  ctx.strokeStyle = color || BLACK;
  ctx.lineWidth = width || 1;
  ctx.stroke();
}

function circle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/* ── Draw tree structure ── */
function drawTree() {
  // Draw trunk
  var trunkW = 3;
  line(trunkX, trunkBaseY, trunkX, trunkBaseY - 50, trunkW, BLACK);

  // Draw branches (connections)
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.isLeaf || n.children.length === 0) continue;

    for (var j = 0; j < n.children.length; j++) {
      var child = n.children[j];
      // L-shaped connector: vertical down from parent, then horizontal to child
      var thickness = Math.max(1, 3 - n.depth);
      line(n.x, n.y, n.x, child.y, thickness, BLACK);
      line(n.x, child.y, child.x, child.y, thickness, BLACK);
      // Vertical stem down to child's subtree
      if (!child.isLeaf) {
        line(child.x, child.y, child.x, child.y + 5, thickness, BLACK);
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
      var baseR = 3 + Math.floor(lvl / Math.max(maxLevel, 1) * 5);
      var offsetY = (k - 1) * (baseR * 2 + 4);

      var flash = flashLeaves[i + '_' + key];
      var isFlashing = flash && flash.age < 15;
      var isCursor = cursor === i;

      if (isCursor) {
        // Cursor: inverted filled circle
        circle(leaf.x, leaf.y + offsetY, baseR + 2, BLACK, null);
        circle(leaf.x, leaf.y + offsetY, baseR - 1, WHITE, null);
      } else if (flat[i]) {
        if (isFlashing) {
          // Flash: filled black
          circle(leaf.x, leaf.y + offsetY, baseR + 1, BLACK, null);
        } else {
          // Active: filled with border
          circle(leaf.x, leaf.y + offsetY, baseR, BLACK, BLACK);
        }
      } else {
        // Inactive: hollow
        circle(leaf.x, leaf.y + offsetY, baseR, null, LIGHT);
      }

      // Track label on first leaf
      if (i === 0) {
        ctx.font = '10px monospace';
        ctx.fillStyle = BLACK;
        ctx.textAlign = 'right';
        ctx.fillText(key[0].toUpperCase(), leaf.x - baseR - 6, leaf.y + offsetY + 4);
      }
    }
  }
}

function drawPulses() {
  for (var i = pulses.length - 1; i >= 0; i--) {
    var p = pulses[i];
    p.radius += 3;
    if (p.radius > p.maxRadius) { pulses.splice(i, 1); continue; }
    var alpha = 1 - p.radius / p.maxRadius;
    ctx.beginPath();
    ctx.arc(Math.round(p.x), Math.round(p.y), p.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBorder() {
  // Mac-style window border
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, vizW - 2, vizH - 2);
  // Title bar
  ctx.fillStyle = WHITE;
  ctx.fillRect(2, 2, vizW - 4, 16);
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1;
  line(2, 18, vizW - 2, 18, 1, BLACK);
  // Title bar stripes
  for (var y = 5; y < 16; y += 2) {
    line(20, y, vizW - 20, y, 1, BLACK);
  }
  // Close box
  ctx.strokeRect(5, 4, 11, 11);
  // Title
  ctx.fillStyle = WHITE;
  ctx.fillRect(vizW / 2 - 50, 3, 100, 13);
  ctx.fillStyle = BLACK;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Fractal Tree', vizW / 2, 13);
}

/* ── Plugin interface ── */
return {
  name: 'フラクタルツリー',
  init: function(_canvas, _ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
    rebuildTree();
  },
  resize: function(w, h) {
    vizW = w;
    vizH = h;
    rebuildTree();
  },
  frame: function(_ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;

    // White background
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, vizW, vizH);

    var pat = TR.state.patterns[TR.state.currentPattern];
    if (pat && leaves.length === 0) rebuildTree();

    // Age flashes
    for (var key in flashLeaves) {
      flashLeaves[key].age++;
      if (flashLeaves[key].age > 30) delete flashLeaves[key];
    }

    drawBorder();
    drawTree();
    drawLeaves();
    drawPulses();
  },
  onHit: function(key, step, level) {
    if (step < leaves.length) {
      var leaf = leaves[step];
      flashLeaves[step + '_' + key] = { key: key, age: 0 };
      pulses.push({
        x: leaf.x, y: leaf.y,
        radius: 0, maxRadius: 20 + level * 15
      });
    }
  },
  destroy: function() {
    nodes = [];
    leaves = [];
    flashLeaves = {};
    pulses = [];
  }
};
})(window.TR));
