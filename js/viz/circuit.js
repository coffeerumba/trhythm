/* ═══════════════════════════════════════════════════════════════
   8-BIT CIRCUIT BOARD — viz mode
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {
var ctx, vizW, vizH;
var CELL = 8;
var VIZ_FADE_FRAMES = 300;
var VIZ_MAX_SEGS = 30;
var vizSegOrder = 0;

/* ── Palette ── */
var VIZ_BG = [10, 26, 10];
var VIZ_DIM = [26, 42, 26];
var VIZ_PAL = {
  kick:  { dark: [108, 0, 32], mid: [208, 48, 80], bright: [255, 128, 144] },
  snare: { dark: [12, 48, 96], mid: [34, 119, 204], bright: [96, 187, 255] },
  hihat: { dark: [26, 64, 32], mid: [85, 153, 85], bright: [144, 221, 144] }
};
var VIZ_CURSOR = [255, 204, 0];

function vizPalColor(key, shade) {
  var p = VIZ_PAL[key];
  return shade <= 0 ? p.dark : shade >= 2 ? p.bright : p.mid;
}
function vizFadeColor(c, fade) {
  var f = Math.min(1, fade);
  return [
    Math.round(c[0] + (VIZ_BG[0] - c[0]) * f),
    Math.round(c[1] + (VIZ_BG[1] - c[1]) * f),
    Math.round(c[2] + (VIZ_BG[2] - c[2]) * f)
  ];
}

function vizGetFlat(key) {
  return key === 'kick' ? TR.state.kickFlat : key === 'snare' ? TR.state.snareFlat : TR.state.hihatFlat;
}
function vizGetCursor(key) {
  if (!TR.state.isPlaying) return -1;
  for (var i = 0; i < TR.state.instPlayback.length; i++) {
    if (TR.state.instPlayback[i].key === key) return TR.state.instPlayback[i].step;
  }
  return -1;
}
function vizCell(x, y, r, g, b) {
  ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
  ctx.fillRect(Math.floor(x / CELL) * CELL, Math.floor(y / CELL) * CELL, CELL, CELL);
}
function vizWrap(x, y) {
  return [((x % vizW) + vizW) % vizW, ((y % vizH) + vizH) % vizH];
}
function vizPickDir(excludeDir) {
  var dirs = [0, 1, 2, 3];
  if (excludeDir >= 0) dirs.splice(dirs.indexOf(excludeDir), 1);
  return dirs[Math.floor(Math.random() * dirs.length)];
}

/* ── Signal Traces ── */
var traces = [];

function vizGenerateTraces() {
  traces = [];
  for (var t = 0; t < 12; t++) {
    var pts = [], x = Math.random() < 0.5 ? 0 : vizW, y = Math.random() * vizH;
    pts.push({ x: x, y: y });
    for (var s = 0, n = 3 + Math.floor(Math.random() * 5); s < n; s++) {
      if (s % 2 === 0) x = Math.random() * vizW; else y = Math.random() * vizH;
      pts.push({ x: x, y: y });
    }
    traces.push({ points: pts, signals: [] });
  }
}

function vizAddSignal(key) {
  var c = VIZ_PAL[key].mid;
  for (var i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
    var ti = Math.floor(Math.random() * traces.length);
    traces[ti].signals.push({ pos: 0, speed: 2 + Math.random() * 4, r: c[0], g: c[1], b: c[2] });
  }
}

function vizDrawTraces() {
  ctx.fillStyle = 'rgb(22,38,22)';
  for (var t = 0; t < traces.length; t++) {
    var pts = traces[t].points;
    for (var p = 1; p < pts.length; p++) {
      var x0 = pts[p - 1].x, y0 = pts[p - 1].y, x1 = pts[p].x, y1 = pts[p].y;
      if (x0 === x1) {
        for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y += CELL * 3)
          ctx.fillRect(Math.floor(x0 / CELL) * CELL, Math.floor(y / CELL) * CELL, CELL, 1);
      } else {
        for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x += CELL * 3)
          ctx.fillRect(Math.floor(x / CELL) * CELL, Math.floor(y0 / CELL) * CELL, 1, CELL);
      }
    }
    for (var si = traces[t].signals.length - 1; si >= 0; si--) {
      var sig = traces[t].signals[si];
      sig.pos += sig.speed;
      var totalLen = 0;
      for (var p = 1; p < pts.length; p++)
        totalLen += Math.abs(pts[p].x - pts[p - 1].x) + Math.abs(pts[p].y - pts[p - 1].y);
      if (sig.pos >= totalLen) { traces[t].signals.splice(si, 1); continue; }
      var remain = sig.pos, sx = pts[0].x, sy = pts[0].y;
      for (var p = 1; p < pts.length; p++) {
        var segLen = Math.abs(pts[p].x - pts[p - 1].x) + Math.abs(pts[p].y - pts[p - 1].y);
        if (remain <= segLen) {
          var frac = segLen > 0 ? remain / segLen : 0;
          sx = pts[p - 1].x + (pts[p].x - pts[p - 1].x) * frac;
          sy = pts[p - 1].y + (pts[p].y - pts[p - 1].y) * frac;
          break;
        }
        remain -= segLen;
      }
      vizCell(sx, sy, sig.r, sig.g, sig.b);
    }
  }
}

/* ── Timeline Snakes ── */
var vizSnakes = [
  { key: 'kick',  segs: [], nextSeg: null, lastCursorStep: -1 },
  { key: 'snare', segs: [], nextSeg: null, lastCursorStep: -1 },
  { key: 'hihat', segs: [], nextSeg: null, lastCursorStep: -1 }
];

function vizSegEndpoint(seg) {
  var N = seg.flat ? seg.flat.length : 16;
  var isH = (seg.dir === 0 || seg.dir === 2);
  var sign = (seg.dir === 0 || seg.dir === 1) ? 1 : -1;
  return vizWrap(seg.cx + (isH ? sign * N * CELL : 0),
                 seg.cy + (isH ? 0 : sign * N * CELL));
}

function vizMakeSegment(cx, cy, dir, key) {
  var liveFlat = vizGetFlat(key);
  return {
    cx: cx, cy: cy, dir: dir,
    flat: liveFlat ? liveFlat.slice() : null,
    levels: (function() {
      var pat = TR.state.patterns[TR.state.currentPattern];
      var def = pat ? pat[key + 'Def'] : null;
      return def ? TR.computeLevels(def.tree).slice() : [];
    })(),
    order: vizSegOrder++, age: 0, visibleSteps: -1
  };
}

function vizInitSnake(snake, excludeDir) {
  snake.segs = [];
  snake.nextSeg = null;
  snake.lastCursorStep = -1;
  var dir = vizPickDir(excludeDir >= 0 ? excludeDir : -1);
  var margin = 20, cx, cy;
  if (dir === 0)      { cx = margin; cy = margin + Math.random() * (vizH - margin * 2); }
  else if (dir === 1) { cx = margin + Math.random() * (vizW - margin * 2); cy = margin; }
  else if (dir === 2) { cx = vizW - margin; cy = margin + Math.random() * (vizH - margin * 2); }
  else                { cx = margin + Math.random() * (vizW - margin * 2); cy = vizH - margin; }
  snake.segs.push(vizMakeSegment(cx, cy, dir, snake.key));
}

function vizUpdateSnakes() {
  for (var s = 0; s < vizSnakes.length; s++) {
    var snake = vizSnakes[s];
    if (snake.segs.length === 0) continue;

    for (var i = 0; i < snake.segs.length - 1; i++) snake.segs[i].age++;
    while (snake.segs.length > 1 && snake.segs[0].age >= VIZ_FADE_FRAMES) snake.segs.shift();

    var cursorStep = vizGetCursor(snake.key);
    if (!vizGetFlat(snake.key)) { snake.lastCursorStep = cursorStep; continue; }
    var active = snake.segs[snake.segs.length - 1];

    if (cursorStep === 1 && snake.lastCursorStep <= 0 && !snake.nextSeg) {
      var ep = vizSegEndpoint(active);
      var dir = vizPickDir((active.dir + 2) % 4);
      snake.nextSeg = vizMakeSegment(ep[0], ep[1], dir, snake.key);
      snake.nextSeg.visibleSteps = 0;
    }

    if (snake.nextSeg && cursorStep >= 0) {
      snake.nextSeg.visibleSteps = cursorStep;
    }

    if (cursorStep === 0 && snake.lastCursorStep > 0 && snake.nextSeg) {
      snake.nextSeg.visibleSteps = -1;
      snake.segs.push(snake.nextSeg);
      if (snake.segs.length > VIZ_MAX_SEGS) snake.segs.shift();
      snake.nextSeg = null;
    }

    snake.lastCursorStep = cursorStep;
  }
}

function vizDrawSegment(seg, key, maxSteps, showCursor) {
  var flat = seg.flat || (showCursor ? vizGetFlat(key) : null);
  if (!flat) return;
  var levels = seg.levels || (showCursor ? (function() {
    var pat = TR.state.patterns[TR.state.currentPattern];
    var def = pat ? pat[key + 'Def'] : null;
    return def ? TR.computeLevels(def.tree) : null;
  })() : null);
  if (!levels) return;

  var N = flat.length;
  var drawN = (maxSteps >= 0 && maxSteps < N) ? maxSteps : N;
  var cursorStep = showCursor ? vizGetCursor(key) : -1;
  var fade = seg.age / VIZ_FADE_FRAMES;
  if (fade >= 1) return;

  var maxLevel = 0;
  for (var i = 0; i < N; i++) if (levels[i] > maxLevel) maxLevel = levels[i];
  var isHoriz = (seg.dir === 0 || seg.dir === 2);
  var sign = (seg.dir === 0 || seg.dir === 1) ? 1 : -1;
  var maxDepth = Math.floor(Math.min(vizH, vizW) * 0.06 / CELL) * CELL;

  for (var i = 0; i < drawN; i++) {
    var lvlRatio = maxLevel > 0 ? levels[i] / maxLevel : 0;
    var cellsDepth = Math.max(1, Math.floor(maxDepth * (0.3 + lvlRatio * 0.7) / CELL));
    var rawX = isHoriz ? seg.cx + sign * i * CELL : seg.cx;
    var rawY = isHoriz ? seg.cy : seg.cy + sign * i * CELL;
    var cr, cg, cb;

    if (cursorStep === i) {
      cr = VIZ_CURSOR[0]; cg = VIZ_CURSOR[1]; cb = VIZ_CURSOR[2];
      cellsDepth = Math.floor(cellsDepth * 1.3);
    } else if (flat[i]) {
      var fc = vizFadeColor(vizPalColor(key, 1), fade);
      cr = fc[0]; cg = fc[1]; cb = fc[2];
    } else {
      if (fade < 0.8) {
        var fc = vizFadeColor(VIZ_DIM, fade);
        var w = vizWrap(rawX, rawY);
        vizCell(w[0], w[1], fc[0], fc[1], fc[2]);
      }
      continue;
    }
    for (var d = -cellsDepth; d <= cellsDepth; d++) {
      var w = vizWrap(isHoriz ? rawX : rawX + d * CELL, isHoriz ? rawY + d * CELL : rawY);
      vizCell(w[0], w[1], cr, cg, cb);
    }
  }
}

function vizDrawSnakes() {
  var all = [];
  for (var s = 0; s < vizSnakes.length; s++) {
    var snake = vizSnakes[s];
    for (var i = 0; i < snake.segs.length; i++) {
      var showCursor = (i === snake.segs.length - 1) && !snake.nextSeg;
      all.push({ seg: snake.segs[i], key: snake.key, maxSteps: -1, showCursor: showCursor });
    }
    if (snake.nextSeg) {
      all.push({ seg: snake.nextSeg, key: snake.key, maxSteps: snake.nextSeg.visibleSteps, showCursor: false });
    }
  }
  all.sort(function(a, b) { return a.seg.order - b.seg.order; });
  for (var i = 0; i < all.length; i++) {
    vizDrawSegment(all[i].seg, all[i].key, all[i].maxSteps, all[i].showCursor);
  }
}

/* ── Reset snakes for new size ── */
function resetSnakes() {
  vizSegOrder = 0;
  vizGenerateTraces();
  var dirs = [0, 1, 2];
  for (var i = 2; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t; }
  for (var i = 0; i < vizSnakes.length; i++) vizInitSnake(vizSnakes[i], (dirs[i] + 2) % 4);
}

/* ── Plugin interface ── */
return {
  name: 'サーキットボード',
  init: function(_canvas, _ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
    resetSnakes();
  },
  resize: function(w, h) {
    vizW = w;
    vizH = h;
    resetSnakes();
  },
  frame: function(_ctx, w, h) {
    ctx = _ctx;
    vizW = w;
    vizH = h;
    ctx.fillStyle = 'rgb(' + VIZ_BG[0] + ',' + VIZ_BG[1] + ',' + VIZ_BG[2] + ')';
    ctx.fillRect(0, 0, vizW, vizH);
    vizUpdateSnakes();
    vizDrawTraces();
    vizDrawSnakes();
  },
  onHit: function(key, step, level) {
    vizAddSignal(key);
  },
  destroy: function() {
    traces = [];
    for (var i = 0; i < vizSnakes.length; i++) {
      vizSnakes[i].segs = [];
      vizSnakes[i].nextSeg = null;
      vizSnakes[i].lastCursorStep = -1;
    }
  }
};
})(window.TR));
