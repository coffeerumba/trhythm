/* ═══════════════════════════════════════════════════════════════
   EXPORT ALL — orchestrate Video / Audio / MIDI exports serially
   and bundle their outputs into a single parent ZIP.

   Each inner exporter returns `{ blob, filename }` (or undefined when
   there is nothing to render), so this orchestrator just collects the
   results and packs them into one JSZip — no DOM trickery required.

   Cancellation: inner exports already support cancellation via
   TR.cancelExport / TR.cancelAudio. ALL adds its own between-stage
   checkCancel so the user can also bail out at stage boundaries when
   no inner export is currently running.

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
};

/* Stage progress weights — rough share of total wall time on a
   typical run. Video dominates because per-frame canvas rendering +
   WebCodecs encoding is the slowest stage; MIDI is essentially
   instant. */
var WEIGHTS = { video: 0.92, audio: 0.04, midi: 0.04 };

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

    // Video — skip if WebCodecs isn't available; the ZIP still
    // contains audio/midi in that case.
    var video = null;
    if (TR.exportVideoAvailable && TR.exportVideoAvailable()) {
      video = await TR.exportVideo(makeStageProgress('video'));
    }
    completeStage('video');
    checkCancel(token);

    var audio = await TR.renderOffline(makeStageProgress('audio'));
    completeStage('audio');
    checkCancel(token);

    var midi = TR.exportMidi();
    completeStage('midi');
    checkCancel(token);

    // Build the parent ZIP with top-level files for video / audio / midi.
    var zip = new JSZip();
    if (video) zip.file(video.filename, video.blob);
    if (audio) zip.file(audio.filename, audio.blob);
    if (midi)  zip.file(midi.filename,  midi.blob);

    var allBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    checkCancel(token);

    TR.downloadBlob(allBlob, TR.timestamp() + '_trhythm_all.zip');
  } finally {
    if (currentToken === token) currentToken = null;
  }
};

})(window.TR);
