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

// Per-track state. videos[key] is an HTMLVideoElement or null. active[key]
// holds whether the track is in the current "moment" snapshot — the set
// of tracks that fired on the most recent audio step.
var videos = { kick: null, snare: null, hihat: null };
var active = { kick: false, snare: false, hihat: false };

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
}

function onHit(key) {
  if (!isMounted) return;
  if (KEYS.indexOf(key) < 0) return;
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

// Cover-fit drawImage: fills (sx,sy)→(dx,dy,dw,dh) with the source
// cropped to match the destination's aspect ratio. Mirrors object-fit:
// cover for HTMLVideoElement.
function drawCover(c, vid, dx, dy, dw, dh) {
  var sw0 = vid.videoWidth, sh0 = vid.videoHeight;
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
  c.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh);
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
    if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
      drawCover(c, vid, x, 0, stripW, h);
    } else {
      // No video assigned (or not yet decoded a frame) — fill with the
      // track color so the layout is still readable.
      c.fillStyle = TR.rgbCSS(TR.INST_COLORS[key]);
      c.fillRect(x, 0, stripW, h);
    }
  }
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
  }
};

})(window.TR));
