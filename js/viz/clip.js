/* ═══════════════════════════════════════════════════════════════
   CLIP (クリップ) — viz mode

   Switches between user-supplied video clips per instrument hit.

   Behavior:
     - Hits arriving within a small time window are treated as one
       "moment" (i.e. tracks that fire on the same audio step). The
       active set is the snapshot of which tracks fired in the most
       recent moment — REPLACING the previous snapshot, not adding to
       it. So step-0: K+S+H → 3-split, step-1: silence → held 3-split,
       step-2: H alone → H full-screen.
     - Display layout splits the canvas evenly among currently-active
       tracks in the fixed order [kick, snare, hihat]:
         1 active → full width
         2 active → left/right halves
         3 active → vertical thirds
     - On every hit, that track's video restarts from frame 0 and plays
       through once (one-shot). The last frame is held until the next
       moment.
     - If a track has no video assigned, its strip is filled with the
       track color instead.
     - When no track is active yet (or mode just (re)activated with no
       prior hits), the canvas holds whatever was last on it. We fill
       black on init so the initial state isn't random garbage.

   Videos are HTMLVideoElement instances created from File objects via
   URL.createObjectURL — kept module-scoped so they persist across mode
   switches and the user doesn't have to re-pick on every toggle.
   ═══════════════════════════════════════════════════════════════ */
TR.registerVizMode((function(TR) {

var ctx, vizW, vizH;
var isMounted = false;
// Setting canvas.width clears the backing store, so any fill we do at
// init() time gets wiped by the immediate vizResize() that follows. We
// flag the next "no active tracks" frame to repaint black so the held-
// frame contract is well-defined whenever we enter the empty state.
var needsBlackFill = false;

var KEYS = ['kick', 'snare', 'hihat'];

// Per-track state. videos[key] is the HTMLVideoElement that drives the
// realtime visible canvas. active[key] holds whether the track is in the
// current "moment" snapshot. clipFiles[key] caches the original File so
// the exporter can spin up its own dedicated video elements off the same
// source — keeping export seeks isolated from realtime preview.
var videos = { kick: null, snare: null, hihat: null };
var active = { kick: false, snare: false, hihat: false };
var clipFiles = { kick: null, snare: null, hihat: null };

// Per-track "last good frame" cache. drawImage on a video that's mid-seek
// can briefly return an empty / black frame (browser-dependent), which
// shows as a flicker at every clip switch — especially noticeable at high
// BPMs where seeks happen many times per second. Each frame() pass copies
// the video's stable frame into its cache; when the video is seeking we
// drawImage from the cache instead, so the strip stays smooth.
var frameCache = { kick: null, snare: null, hihat: null };

// Hits scheduled at the same audio time still arrive in separate JS
// callbacks (each track has its own setTimeout). We batch hits whose
// arrival times are within MOMENT_WINDOW seconds of each other into
// one snapshot. 30ms is comfortably below a 16th-note at BPM=200
// (75ms) while wide enough to absorb scheduler jitter.
var MOMENT_WINDOW = 0.03;
var lastHitTime = -Infinity;

function setVideo(key, file) {
  // Replace any existing video for this slot.
  var prev = videos[key];
  if (prev) {
    try { prev.pause(); } catch (e) {}
    if (prev.src) URL.revokeObjectURL(prev.src);
    videos[key] = null;
  }
  // Toss the per-track frame cache: it's pixels of the OLD source.
  frameCache[key] = null;
  clipFiles[key] = file || null;
  if (!file) return;
  var v = document.createElement('video');
  // Silence the audio track every way a browser might respect:
  //  - defaultMuted: mute even before any explicit play() call
  //  - muted attribute + property: standard mute
  //  - volume = 0: belt-and-suspenders against a stray un-mute
  v.defaultMuted = true;
  v.muted = true;
  v.volume = 0;
  v.setAttribute('muted', '');
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = URL.createObjectURL(file);
  // Don't autoplay — we drive playback from onHit. preload triggers
  // metadata + first-frame decode so drawImage works on first paint.
  v.load();
  videos[key] = v;

  // Snapshot the first frame into the cache as soon as the video is
  // decode-ready. This way the very first onHit (which puts the video
  // into a seeking state via currentTime=0) has a stable frame to fall
  // back to instead of a track-color flash.
  var captureFirstFrame = function() {
    v.removeEventListener('loadeddata', captureFirstFrame);
    if (videos[key] !== v) return;  // user replaced the video meanwhile
    if (!v.videoWidth || !v.videoHeight) return;
    var cache = ensureFrameCache(key, v.videoWidth, v.videoHeight);
    try {
      cache.getContext('2d').drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
    } catch (e) { /* swallow — we'll repopulate from frame() later */ }
  };
  v.addEventListener('loadeddata', captureFirstFrame);
}

function onHit(key) {
  if (!isMounted) return;
  if (KEYS.indexOf(key) < 0) return;
  // The export pipeline uses its own dedicated video elements
  // (schedule.exportVideos), so realtime hits no longer fight export
  // seeks for the same currentTime cursor — let realtime preview run
  // freely while a download is in flight.
  // If this hit lands outside the last moment's window, it starts a new
  // moment — clear the snapshot before populating it. Hits inside the
  // window simply append to the current snapshot.
  var now = (typeof Tone !== 'undefined' && Tone.now)
    ? Tone.now()
    : (performance.now() / 1000);
  if (now - lastHitTime > MOMENT_WINDOW) {
    active = { kick: false, snare: false, hihat: false };
  }
  lastHitTime = now;
  active[key] = true;
  var v = videos[key];
  if (!v) return;
  // Restart from frame 0, ワンショット. play() may reject if the user
  // hasn't interacted yet; muted videos are usually allowed without
  // gesture, but swallow any error rather than throwing in the audio
  // tick path. Re-assert mute on every hit in case anything cleared it.
  try {
    v.pause();
    v.muted = true;
    v.volume = 0;
    v.currentTime = 0;
    var p = v.play();
    if (p && typeof p.catch === 'function') p.catch(function(){});
  } catch (e) {}
}

function reset() {
  active = { kick: false, snare: false, hihat: false };
  lastHitTime = -Infinity;
  for (var i = 0; i < KEYS.length; i++) {
    var v = videos[KEYS[i]];
    if (!v) continue;
    try {
      v.pause();
      v.currentTime = 0;
    } catch (e) {}
  }
}

// Cover-fit drawImage: fills (dx,dy,dw,dh) with the source cropped to
// match the destination's aspect ratio. Mirrors object-fit: cover.
// Source can be any drawable: HTMLVideoElement (uses videoWidth/Height)
// or any canvas (uses width/height) — frame caching uses the latter.
function drawCover(c, src, dx, dy, dw, dh) {
  var sw0 = src.videoWidth || src.width || 0;
  var sh0 = src.videoHeight || src.height || 0;
  if (!sw0 || !sh0) return;
  var srcRatio = sw0 / sh0;
  var dstRatio = dw / dh;
  var sx, sy, sw, sh;
  if (srcRatio > dstRatio) {
    // Source wider — crop the sides.
    sh = sh0;
    sw = sh * dstRatio;
    sx = (sw0 - sw) / 2;
    sy = 0;
  } else {
    // Source taller — crop top/bottom.
    sw = sw0;
    sh = sw / dstRatio;
    sx = 0;
    sy = (sh0 - sh) / 2;
  }
  c.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Lazily allocate / resize the per-track frame cache canvas to match the
// video's native dimensions. Resizing in place avoids GC churn from
// re-allocating every time.
function ensureFrameCache(key, w, h) {
  var c = frameCache[key];
  if (c && c.width === w && c.height === h) return c;
  if (typeof OffscreenCanvas !== 'undefined') {
    c = new OffscreenCanvas(w, h);
  } else {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
  }
  frameCache[key] = c;
  return c;
}

function frame(c, w, h) {
  // Build the active list in fixed key order so the layout is stable.
  var list = [];
  for (var i = 0; i < KEYS.length; i++) {
    if (active[KEYS[i]]) list.push(KEYS[i]);
  }
  var n = list.length;
  if (n === 0) {
    if (needsBlackFill) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      needsBlackFill = false;
    }
    // Otherwise hold the previous frame — don't touch the canvas.
    return;
  }
  needsBlackFill = false;
  var stripW = w / n;
  for (var j = 0; j < n; j++) {
    var key = list[j];
    var x = j * stripW;
    var vid = videos[key];
    var stable = vid && vid.readyState >= 2 && vid.videoWidth > 0 && !vid.seeking;
    if (stable) {
      drawCover(c, vid, x, 0, stripW, h);
      // Snapshot this frame so a subsequent seek doesn't briefly reveal
      // the canvas backdrop. drawImage at native size into the cache
      // canvas — small overhead vs. the visible benefit at clip switches.
      var cache = ensureFrameCache(key, vid.videoWidth, vid.videoHeight);
      cache.getContext('2d').drawImage(vid, 0, 0, vid.videoWidth, vid.videoHeight);
    } else if (frameCache[key]) {
      // Mid-seek (or otherwise unstable): paint the last stable frame.
      drawCover(c, frameCache[key], x, 0, stripW, h);
    } else {
      // No video assigned (or first hit before any cache is populated) —
      // fill with the track color so the layout is still readable.
      c.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
      c.fillRect(x, 0, stripW, h);
    }
  }
}

/* ── Export-side: deterministic schedule + per-frame async render ──
   Mirrors flower's export contract: build → double → renderFrame(t).
   The schedule is "one cycle of moments"; each moment is the snapshot
   of which tracks fire (essentially) simultaneously. doubleSchedule
   concatenates a copy at +loopDur so frames near loop boundaries can
   straddle iterations cleanly. renderFrame finds the most-recent moment
   ≤ t and seeks each active video to (t − moment.firingTime), then
   draws its strip. ── */

// Wait for an HTMLVideoElement to seek to `target`. Resolves when the
// `seeked` event fires, or via a 1s safety timeout if the browser never
// emits it (some codecs fail to fire on edge-case targets). Resolves
// immediately when the cursor is already there.
function waitSeek(vid, target) {
  return new Promise(function(resolve) {
    var current = vid.currentTime || 0;
    if (Math.abs(current - target) < 1e-6) { resolve(); return; }
    var done = false;
    var fin = function() {
      if (done) return;
      done = true;
      vid.removeEventListener('seeked', fin);
      vid.removeEventListener('error', fin);
      resolve();
    };
    vid.addEventListener('seeked', fin);
    vid.addEventListener('error', fin);
    try { vid.currentTime = target; }
    catch (e) { fin(); return; }
    setTimeout(fin, 1000);
  });
}

// Wait until the video has decoded enough to be drawImage-safe (HAVE_CURRENT_DATA).
function waitReady(vid) {
  if (vid.readyState >= 2) return Promise.resolve();
  return new Promise(function(resolve) {
    var done = false;
    var fin = function() {
      if (done) return;
      done = true;
      vid.removeEventListener('loadeddata', fin);
      vid.removeEventListener('canplay',    fin);
      vid.removeEventListener('error',      fin);
      resolve();
    };
    vid.addEventListener('loadeddata', fin);
    vid.addEventListener('canplay',    fin);
    vid.addEventListener('error',      fin);
    setTimeout(fin, 5000);
  });
}

// Spin up a dedicated, decode-ready HTMLVideoElement off the supplied
// File. Used by the exporter so seeks don't disturb the realtime
// preview's video elements. Returns null when no file is set.
async function createExportVideo(file) {
  if (!file) return null;
  var v = document.createElement('video');
  v.defaultMuted = true;
  v.muted = true;
  v.volume = 0;
  v.setAttribute('muted', '');
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = URL.createObjectURL(file);
  v.load();
  await waitReady(v);
  return v;
}

async function buildScheduleAsync(pats, bpm, accentMode, w, h) {
  var allHits = [];  // { time, key }
  var offset = 0;
  for (var p = 0; p < pats.length; p++) {
    var entry = pats[p];
    var pat = (entry && entry.pat) ? entry.pat : entry;
    if (!pat) continue;

    // Per-track step duration; slot length = longest cycle, like the
    // existing audio renderer in exportVideo.js.
    var maxCycle = 0;
    var perTrack = {};
    for (var ti = 0; ti < KEYS.length; ti++) {
      var key = KEYS[ti];
      var def = pat[key + 'Def'];
      if (!def) continue;
      var leaves = TR.computeLevels(def.tree).length;
      var trackBeats = pat[key + 'Beats'] || TR.computeBeats(def);
      var spS = 60 * trackBeats / bpm / leaves;
      var cycle = spS * leaves;
      perTrack[key] = { spS: spS, leaves: leaves };
      if (cycle > maxCycle) maxCycle = cycle;
    }

    for (var ti2 = 0; ti2 < KEYS.length; ti2++) {
      var key2 = KEYS[ti2];
      var info = perTrack[key2];
      if (!info) continue;
      var flat = pat[key2];
      if (!flat) continue;
      for (var s = 0; s < flat.length; s++) {
        if (flat[s]) allHits.push({ time: offset + s * info.spS, key: key2 });
      }
    }

    offset += maxCycle;
  }

  // Group hits within MOMENT_WINDOW into single moments (matches realtime
  // batching so live preview and export look the same on edge cases).
  allHits.sort(function(a, b) { return a.time - b.time; });
  var moments = [];
  var current = null;
  for (var i = 0; i < allHits.length; i++) {
    var hit = allHits[i];
    if (!current || hit.time - current.firingTime > MOMENT_WINDOW) {
      current = { firingTime: hit.time, activeKeys: [hit.key] };
      moments.push(current);
    } else if (current.activeKeys.indexOf(hit.key) < 0) {
      current.activeKeys.push(hit.key);
    }
  }

  // Spin up dedicated video elements for the export. Sharing the
  // realtime ones would race against the export's per-frame seeks and
  // cause the visible canvas to flicker as the cursor jumps around. The
  // dispose() method below releases their object URLs at end-of-export
  // (called by the exporter from its finally block).
  var exportVideos = {};
  var createPromises = [];
  for (var ki = 0; ki < KEYS.length; ki++) {
    (function(key) {
      createPromises.push(createExportVideo(clipFiles[key]).then(function(v) {
        exportVideos[key] = v;
      }));
    })(KEYS[ki]);
  }
  await Promise.all(createPromises);

  function dispose() {
    for (var k in exportVideos) {
      var v = exportVideos[k];
      if (!v) continue;
      try { v.pause(); } catch (e) {}
      if (v.src) URL.revokeObjectURL(v.src);
      exportVideos[k] = null;
    }
  }

  return {
    totalDuration: offset,
    moments: moments,
    exportVideos: exportVideos,
    dispose: dispose
  };
}

// Double passes the export-video map and dispose hook through by
// reference so the cleanup-on-finally pattern works whether the
// exporter holds the single or the doubled schedule.
function doubleScheduleSync(single) {
  var loopDur = single.totalDuration;
  var doubled = single.moments.concat(single.moments.map(function(m) {
    return { firingTime: m.firingTime + loopDur, activeKeys: m.activeKeys.slice() };
  }));
  return {
    totalDuration: 2 * loopDur,
    moments: doubled,
    exportVideos: single.exportVideos,
    dispose: single.dispose
  };
}

// Find the most recent moment with firingTime ≤ t. moments[] is sorted.
function momentAt(moments, t) {
  var current = null;
  for (var i = 0; i < moments.length; i++) {
    if (moments[i].firingTime > t) break;
    current = moments[i];
  }
  return current;
}

async function renderFrameAsync(c, w, h, t, schedule, bgFill) {
  var moments = schedule.moments;
  var current = (moments && moments.length) ? momentAt(moments, t) : null;
  // Order activeKeys by KEYS index so the strip layout is stable.
  var keys = current
    ? current.activeKeys.slice().sort(function(a, b) {
        return KEYS.indexOf(a) - KEYS.indexOf(b);
      })
    : [];
  var n = keys.length;

  // Background only when no strips will cover the canvas. Otherwise the
  // strips fully tile [0,w]×[0,h] and the bg fill is both redundant and
  // a flash hazard (any one strip's drawImage hiccup would briefly
  // reveal black at the next encoder capture).
  if (n === 0) {
    if (bgFill === null) {
      c.clearRect(0, 0, w, h);
    } else {
      c.fillStyle = bgFill || '#000';
      c.fillRect(0, 0, w, h);
    }
    return;
  }
  var stripW = w / n;

  // Seek+draw each strip. Run in parallel so the seek latencies overlap
  // (each video has its own decoder); strips don't overlap on the canvas
  // so concurrent drawImage calls are safe. Use the schedule's dedicated
  // export videos — the realtime `videos` map is reserved for the
  // visible-canvas preview and must not be touched here.
  var exVideos = schedule.exportVideos || {};
  var tasks = [];
  for (var j = 0; j < n; j++) {
    tasks.push((function(idx) {
      return (async function() {
        var key = keys[idx];
        var x = idx * stripW;
        var vid = exVideos[key];
        if (!vid) {
          c.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
          c.fillRect(x, 0, stripW, h);
          return;
        }
        var target = t - current.firingTime;
        if (vid.duration && isFinite(vid.duration)) {
          target = Math.max(0, Math.min(vid.duration, target));
        } else {
          target = Math.max(0, target);
        }
        await waitSeek(vid, target);
        if (vid.videoWidth > 0 && vid.readyState >= 2) {
          drawCover(c, vid, x, 0, stripW, h);
        } else {
          c.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
          c.fillRect(x, 0, stripW, h);
        }
      })();
    })(j));
  }
  await Promise.all(tasks);
}

// ── Controls visibility ──────────────────────────────────────────
function showControls(show) {
  var el = document.getElementById('clip-controls');
  if (el) el.style.display = show ? '' : 'none';
}

// Wire up file inputs once on first DOM-ready. We only attach listeners;
// the inputs themselves are static markup in index.html.
var wired = false;
function wireInputs() {
  if (wired) return;
  for (var i = 0; i < KEYS.length; i++) (function(key) {
    var el = document.getElementById('clip-file-' + key);
    if (!el) return;
    el.addEventListener('change', function(e) {
      var f = e.target.files && e.target.files[0];
      setVideo(key, f || null);
    });
  })(KEYS[i]);
  wired = true;
}

// ── Public viz interface ────────────────────────────────────────
return {
  name: 'クリップ',
  init: function(_canvas, _ctx, w, h) {
    ctx = _ctx; vizW = w; vizH = h;
    isMounted = true;
    wireInputs();
    showControls(true);
    reset();
    // The vizResize() called right after switchVizMode would wipe any
    // immediate fillRect, so defer the black background paint to the
    // next frame() while we're still in the empty-active state.
    needsBlackFill = true;
  },
  resize: function(w, h) {
    vizW = w; vizH = h;
    // Backing-store reset just blanked the canvas — re-arm the black
    // fill so the empty-active state stays well-defined after a resize.
    needsBlackFill = true;
  },
  frame: function(c, w, h) {
    ctx = c; vizW = w; vizH = h;
    frame(c, w, h);
  },
  onHit: function(key, step, level) { onHit(key); },
  destroy: function() {
    isMounted = false;
    showControls(false);
    reset();
  },
  // Export-side methods, dispatched through TR.activeVizMode by the
  // Video / PNG-sequence exporters. buildSchedule is async (it waits for
  // any pending video loads to settle); doubleSchedule is sync;
  // renderFrame is async because each strip needs a per-frame seek.
  buildSchedule:  buildScheduleAsync,
  doubleSchedule: doubleScheduleSync,
  renderFrame:    renderFrameAsync,
  // Every frame is fully covered by opaque video pixels. PNG sequence
  // would balloon to GBs (no transparent regions to compress), and the
  // ALL ZIP would OOM allocating its final ArrayBuffer. Exporters use
  // this flag to skip the PNG path for this mode.
  supportsAlpha: false
};

})(window.TR));
