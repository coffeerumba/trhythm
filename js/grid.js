(function(TR) {
/* ─── Render all 3 grids with polymetric width scaling ─── */
TR.renderAllGrids = function(pat) {
  if (!pat) return;

  var tracks = [
    { id: 'grid-kick', flat: pat.kick, cls: 'on-kick', def: pat.kickDef, beats: pat.kickBeats },
    { id: 'grid-snare', flat: pat.snare, cls: 'on-snare', def: pat.snareDef, beats: pat.snareBeats },
    { id: 'grid-hihat', flat: pat.hihat, cls: 'on-hihat', def: pat.hihatDef, beats: pat.hihatBeats }
  ];

  // Find max beats across all tracks (the widest track fills 100%)
  var maxBeats = 0;
  for (var t = 0; t < tracks.length; t++) {
    if (tracks[t].beats > maxBeats) maxBeats = tracks[t].beats;
  }

  for (var t = 0; t < tracks.length; t++) {
    var tr = tracks[t];
    var boundaries = TR.getGroupBoundaries(tr.def.tree);
    var stepsPerBeat = tr.flat.length / tr.beats;
    // Total columns = maxBeats * stepsPerBeat (pads shorter tracks with empty columns)
    var totalCols = maxBeats * stepsPerBeat;

    var el = document.getElementById(tr.id);
    var html = '';
    for (var i = 0; i < tr.flat.length; i++) {
      var cls = tr.flat[i] ? 'grid-step ' + tr.cls : 'grid-step';
      var barStyle = boundaries[i] ? ' style="border-left:3px solid var(--border)"' : '';
      html += '<div class="step-cell"><span class="' + cls + '"' + barStyle + '></span></div>';
    }
    el.innerHTML = html;
    el.style.gridTemplateColumns = 'repeat(' + totalCols + ', 1fr)';
  }
};
})(window.TR);
