/* ═══════════════════════════════════════════════════════════════
   EXPORT PNG SEQUENCE — render every frame of one loop iteration as
   a transparent PNG, ZIP them into a single download.

   Why this exists: WebCodecs alpha-encoding is unsupported on most
   Chrome builds, so we can't produce a transparent WebM. PNG sequence
   is the lossless escape hatch: any video editor (Premiere, DaVinci,
   FCP, AE, Blender) can import a PNG sequence and treat it as alpha
   footage. Audio is a separate Audio download.

   Strategy mirrors the video exporter: build a doubled schedule and
   render frames from the second iteration so decay tails from the
   "previous loop" are present at frame 0 — keeping the output a
   genuine seamless loop when imported into a video timeline.

   Cancellation: clicking DL again during render flips
   `currentToken.aborted = true`; the render loop bails on its next
   iteration.

   Requires JSZip (loaded as window.JSZip via CDN).
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {

TR.exportPngSeqAvailable = function() {
  return typeof JSZip !== 'undefined';
};

var currentToken = null;
function CancelError() {
  var e = new Error('cancelled');
  e.cancelled = true;
  return e;
}
function checkCancel(token) { if (token && token.aborted) throw CancelError(); }
TR.pngInProgress = function() { return !!currentToken; };
TR.cancelPng = function() { if (currentToken) currentToken.aborted = true; };

// Convert a canvas (OffscreenCanvas or HTMLCanvasElement) to a PNG blob.
// OffscreenCanvas exposes convertToBlob (async, can run off-main-thread);
// HTMLCanvasElement uses toBlob (callback-style, wrapped in a promise).
function canvasToPng(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise(function(resolve, reject) {
    canvas.toBlob(function(blob) {
      if (blob) resolve(blob);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

function pad4(n) {
  return ('0000' + n).slice(-4);
}

function timestamp() {
  var now = new Date();
  return now.getFullYear()
    + ('0' + (now.getMonth() + 1)).slice(-2)
    + ('0' + now.getDate()).slice(-2)
    + '_' + ('0' + now.getHours()).slice(-2)
    + ('0' + now.getMinutes()).slice(-2)
    + ('0' + now.getSeconds()).slice(-2);
}

function downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Progress weights ──────────────────────────────────────────────
   render: 0.7 — dominates wall time (PNG encode + draw per frame)
   zip:    0.3 — JSZip generateAsync runs deflate on every entry
── */
var PROGRESS_WEIGHTS = { render: 0.7, zip: 0.3 };
TR.exportPngSeq = async function(onProgress) {
  function emit(phase, sub) {
    if (!onProgress) return;
    var sum = 0;
    for (var k in PROGRESS_WEIGHTS) {
      if (k === phase) { sum += PROGRESS_WEIGHTS[k] * sub; break; }
      sum += PROGRESS_WEIGHTS[k];
    }
    onProgress(Math.max(0, Math.min(1, sum)));
  }

  if (!TR.exportPngSeqAvailable()) throw new Error('JSZip not loaded');
  if (currentToken) throw new Error('PNG export already in progress');
  var token = currentToken = { aborted: false };

  try {
    var pats = TR.collectPatternsForRender();
    if (pats.length === 0) throw new Error('No patterns to render');

    var bpm = parseInt(document.getElementById('bpm').value);
    var fps = 30;
    var canvas = document.getElementById('viz-canvas');
    var w = canvas.width;
    var h = canvas.height;

    var accentMode = TR.getAccentMode();

    // Build a single-loop schedule, then double it so frames at t in
    // [loopDur, 2*loopDur) carry residuals (eraser-ball trails, marker
    // fades) from the previous iteration — same trick exportVideo uses
    // to make the loop seamless.
    var single = TR.flower.buildSchedule(pats, bpm, accentMode, w, h);
    var loopDur = single.totalDuration;
    if (!(loopDur > 0)) throw new Error('Empty schedule');
    var doubleSlots = single.slots.concat(single.slots.map(function(s) {
      return { offset: s.offset + loopDur, duration: s.duration, defaultDef: s.defaultDef };
    }));
    var doubleFirings = single.firings.concat(single.firings.map(function(f) {
      return {
        firingTime: f.firingTime + loopDur,
        forwardSec: f.forwardSec, reverseSec: f.reverseSec,
        poly: f.poly, lens: f.lens, key: f.key
      };
    }));
    doubleFirings.sort(function(a, b) { return a.firingTime - b.firingTime; });
    var doubleSchedule = {
      totalDuration: 2 * loopDur,
      slots:   doubleSlots,
      firings: doubleFirings
    };

    // Off-screen canvas for rendering. OffscreenCanvas keeps the work
    // off the visible canvas (no flicker in the realtime preview).
    var offCanvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(w, h)
      : (function() { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
    var offCtx = offCanvas.getContext('2d');

    var totalFrames = Math.round(loopDur * fps);
    var zip = new JSZip();
    var folderName = timestamp() + '_trhythm_pngs';
    var folder = zip.folder(folderName);

    emit('render', 0);
    for (var i = 0; i < totalFrames; i++) {
      checkCancel(token);
      var t = loopDur + i / fps;
      // bgFill=null → transparent backdrop; the canvas pixels carry
      // alpha=0 outside drawn elements, which is exactly what PNG
      // captures.
      TR.flower.renderFrame(offCtx, w, h, t, doubleSchedule, null);

      var blob = await canvasToPng(offCanvas);
      checkCancel(token);
      folder.file('frame_' + pad4(i + 1) + '.png', blob);

      // Yield to event loop every few frames so the page stays
      // responsive (cancel clicks get a chance to run).
      if (i % 4 === 0) await new Promise(function(r) { setTimeout(r, 0); });

      emit('render', (i + 1) / totalFrames);
    }

    emit('zip', 0);
    // STORE (no DEFLATE) — PNG is already compressed, so deflating it
    // again costs CPU for ~no size gain. ZIP becomes mostly a container.
    var zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      function(meta) {
        // JSZip callback runs on its own throttle; route to progress.
        emit('zip', meta.percent / 100);
        if (token.aborted) throw CancelError();
      }
    );
    checkCancel(token);
    emit('zip', 1);

    downloadBlob(zipBlob, folderName + '.zip');
  } finally {
    if (currentToken === token) currentToken = null;
  }
};

})(window.TR);
