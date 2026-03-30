(function(TR) {
/* ─── State ─── */
TR.state = {
  patterns: new Array(TR.PATTERN_COUNT).fill(null),
  currentPattern: 0,
  kickFlat: null,
  snareFlat: null,
  hihatFlat: null,
  isPlaying: false,
  treeCursor: null,
  allMode: true,
  schedulerTimer: null,
  toneStarted: false,
  masterGain: null,
  noiseBuffer: null,
  instPlayback: [
    { key: 'kick',  gridId: 'grid-kick',  getFlat: function() { return TR.state.kickFlat; },  play: null },
    { key: 'snare', gridId: 'grid-snare', getFlat: function() { return TR.state.snareFlat; }, play: null },
    { key: 'hihat', gridId: 'grid-hihat', getFlat: function() { return TR.state.hihatFlat; }, play: null }
  ],
  playingAllMode: false
};

document.documentElement.style.setProperty('--pattern-count', TR.PATTERN_COUNT);
})(window.TR);
