/* ═══════════════════════════════════════════════════════════════
   EXPORT ALL — orchestrate Video / Audio / PNG Seq / MIDI exports
   serially and bundle their outputs into a single parent ZIP.

   Strategy: each existing TR.exportXxx() function still does its own
   download via document.createElement('a') + a.click(). We
   temporarily monkey-patch document.createElement so that when an
   inner export's <a>.click() fires, we suppress the actual download
   and capture the blob (looked up by href via an URL.createObjectURL
   intercept). Then we wrap all four captured blobs into a single
   JSZip and trigger one real download.

   Why serial, not parallel: Chrome's VideoEncoder and OffscreenCanvas
   PNG encoder appear to share an internal image-conversion thread,
   so running them concurrently doesn't speed things up — and in
   practice slows them down due to contention and main-thread context
   switching. Serial is cleaner and faster overall.

   The PNG sequence's inner ZIP is *unwrapped* (its frames are added
   directly to the parent ZIP) so the user only has to unzip once to
   get to the PNGs.

   Cancellation: inner exports already support cancellation via
   TR.cancelExport / TR.cancelAudio / TR.cancelPng. ALL adds its own
   between-stage checkCancel so the user can also bail out at slot
   boundaries when no inner export is currently running.

   Requires JSZip (loaded via CDN in index.html).
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {

var currentToken = null;
function CancelError() {
  var e = new Error('cancelled');
  e.cancelled = true;
  return e;
}
function checkCancel(token) { if (token && token.aborted) throw CancelError(); }

TR.allInProgress = function() { return !!currentToken; };
TR.cancelAll = function() {
  if (currentToken) currentToken.aborted = true;
  // Also cancel whichever inner export is currently running so it
  // bails immediately instead of waiting until the next stage boundary.
  if (TR.cancelExport) TR.cancelExport();
  if (TR.cancelAudio)  TR.cancelAudio();
  if (TR.cancelPng)    TR.cancelPng();
};

/* Stage progress weights — rough share of total wall time on a
   typical run. PNG sequence dominates because PNG encoding at 1080p
   is single-threaded in Chrome's image encoder. */
var WEIGHTS = { video: 0.30, audio: 0.04, png: 0.62, midi: 0.04 };

/* Run an export function while suppressing the actual file download,
   capturing the blob + filename it would have written instead.
   Works because all four export paths download via:
     1. URL.createObjectURL(blob) → url
     2. <a href=url download=name>; a.click(); URL.revokeObjectURL(url)
   We intercept (1) to remember blob-by-url, and override <a>.click()
   to capture the filename and look up the blob.

   Note: revokeObjectURL is still called by the inner export, but
   that only revokes the URL; the underlying Blob object is still
   alive (we hold a reference) and can be re-published later. ── */
async function captureExport(runExport) {
  var capturedBlob = null;
  var capturedName = null;

  var origCreateEl = document.createElement.bind(document);
  var origCreateUrl = URL.createObjectURL;
  var blobByUrl = new Map();

  document.createElement = function(tag) {
    var el = origCreateEl(tag);
    if (tag === 'a') {
      el.click = function() {
        // Suppress the real download — just record what would have
        // been downloaded. The inner export proceeds normally
        // (appendChild / removeChild / revokeObjectURL all still run).
        capturedName = el.download;
        capturedBlob = blobByUrl.get(el.href) || null;
      };
    }
    return el;
  };
  URL.createObjectURL = function(blob) {
    var url = origCreateUrl.call(URL, blob);
    blobByUrl.set(url, blob);
    return url;
  };

  try {
    await runExport();
  } finally {
    document.createElement = origCreateEl;
    URL.createObjectURL = origCreateUrl;
  }
  return { blob: capturedBlob, name: capturedName };
}

function timestamp() {
  var d = new Date();
  return d.getFullYear()
    + ('0' + (d.getMonth() + 1)).slice(-2)
    + ('0' + d.getDate()).slice(-2)
    + '_' + ('0' + d.getHours()).slice(-2)
    + ('0' + d.getMinutes()).slice(-2)
    + ('0' + d.getSeconds()).slice(-2);
}

TR.exportAll = async function(onProgress) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
  if (currentToken) throw new Error('All export already in progress');
  var token = currentToken = { aborted: false };

  // Combined progress: each stage contributes its own [0,1] curve
  // weighted by WEIGHTS. doneWeight tracks how much weight is finished.
  var doneWeight = 0;
  function makeStageProgress(stage) {
    return function(p) {
      if (onProgress) onProgress(doneWeight + WEIGHTS[stage] * Math.max(0, Math.min(1, p)));
    };
  }
  function completeStage(stage) {
    doneWeight += WEIGHTS[stage];
    if (onProgress) onProgress(doneWeight);
  }

  try {
    if (onProgress) onProgress(0);

    // Video — skip if WebCodecs alpha encoding isn't available; the
    // ZIP still contains audio/png/midi in that case.
    var video = null;
    if (TR.exportVideoAvailable && TR.exportVideoAvailable()) {
      video = await captureExport(function() {
        return TR.exportVideo(makeStageProgress('video'));
      });
    }
    completeStage('video');
    checkCancel(token);

    var audio = await captureExport(function() {
      return TR.renderOffline(makeStageProgress('audio'));
    });
    completeStage('audio');
    checkCancel(token);

    var png = await captureExport(function() {
      return TR.exportPngSeq(makeStageProgress('png'));
    });
    completeStage('png');
    checkCancel(token);

    var midi = await captureExport(function() {
      return TR.exportMidi();  // sync; await on undefined is a no-op
    });
    completeStage('midi');
    checkCancel(token);

    // Build the parent ZIP. Top-level files for video / audio / midi.
    // For PNG, unwrap the inner ZIP so its frames sit at the top level
    // of the parent ZIP (or in their own subfolder) — saves the user a
    // second unzip.
    var zip = new JSZip();
    if (video && video.blob) zip.file(video.name, video.blob);
    if (audio && audio.blob) zip.file(audio.name, audio.blob);
    if (midi  && midi.blob)  zip.file(midi.name,  midi.blob);

    if (png && png.blob) {
      var inner = await JSZip.loadAsync(png.blob);
      var promises = [];
      inner.forEach(function(relPath, file) {
        if (file.dir) return;
        promises.push(file.async('blob').then(function(b) {
          zip.file(relPath, b);
        }));
      });
      await Promise.all(promises);
    }

    var allBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    checkCancel(token);

    var url = URL.createObjectURL(allBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = timestamp() + '_trhythm_all.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    if (currentToken === token) currentToken = null;
  }
};

})(window.TR);
