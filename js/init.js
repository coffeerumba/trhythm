(function(TR) {
/* ─── Keyboard shortcut: Space = play/stop ─── */
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (TR.state.kickFlat) {
      if (TR.state.isPlaying) TR.stopPlayback();
      else TR.startPlayback();
    }
  }
});

/* ─── Set defaults and auto-generate on load ─── */
TR.setDefaultParams();
document.getElementById('btn-generate').click();
})(window.TR);
