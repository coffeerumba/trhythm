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
function genRepeat(stepsSize, rhythmSize, possibility = 0) {
  let indexes = Array(stepsSize).fill().map((v, i) => i);
  let starts = [rhythmSize];
  while (starts.at(-1) * 2 < stepsSize) starts.push(starts.at(-1) * 2);
  for (let i = 0; i < starts.length; i++) {
    let start = starts[i];
    let end = i + 1 < starts.length ? starts[i + 1] : stepsSize; //Math.floor(stepsSize / rhythmSize) * rhythmSize
    for (let start2 = start; start2 < end; start2 += rhythmSize) {
      if (Math.random() >= (-2 / stepsSize) * start2 + (start / stepsSize * 4) + possibility) continue;
      for (let pointer = start2; pointer < Math.min(start2 + rhythmSize, end); pointer++) indexes[pointer] = indexes[pointer - start];
    }
  }
  return { indexes: indexes, starts: starts };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = genRepeat;
}
