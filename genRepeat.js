/**
 * genRepeat.js — Hierarchical repetition generator
 *
 * Generates an index mapping that determines which steps copy from earlier steps,
 * creating hierarchical repetition structure.
 *
 * @param {number} stepsSize - Total number of steps (e.g. 32)
 * @param {number} rhythmSize - Base rhythm unit size (e.g. 4)
 * @param {number} possibility - Probability offset (-1 to 1). Higher = more repetition.
 * @returns {{ indexes: number[], starts: number[] }}
 *   indexes: array where indexes[i] = source index for step i (i itself if not copied)
 *   starts: hierarchy level boundaries (rhythmSize, rhythmSize*2, ...)
 */
function genRepeat(stepsSize, rhythmSize, possibility) {
  possibility = possibility || 0;
  var indexes = Array(stepsSize).fill().map(function(v, i) { return i; });
  var starts = [rhythmSize];
  while (starts[starts.length - 1] * 2 < stepsSize) starts.push(starts[starts.length - 1] * 2);
  for (var i = 0; i < starts.length; i++) {
    var start = starts[i];
    var end = i + 1 < starts.length ? starts[i + 1] : stepsSize;
    for (var start2 = start; start2 < end; start2 += rhythmSize) {
      var prob = (-2 / stepsSize) * start2 + (start / stepsSize * 4) + possibility;
      if (Math.random() >= prob) continue;
      for (var pointer = start2; pointer < Math.min(start2 + rhythmSize, end); pointer++) {
        indexes[pointer] = indexes[pointer - start];
      }
    }
  }
  return { indexes: indexes, starts: starts };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = genRepeat;
}
