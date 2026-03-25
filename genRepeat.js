/**
 * genRepeat.js — Hierarchical repetition generator
 *
 * Generates an index mapping that determines which steps copy from earlier steps,
 * creating hierarchical repetition structure.
 *
 * @param {number} seqSize - Total number of steps (e.g. 32)
 * @param {number} chunkSize - Base rhythm unit size (e.g. 4)
 * @param {number} bias - Probability offset (-1 to 1). Higher = more repetition.
 * @returns {{ indexes: number[], starts: number[] }}
 *   indexes: array where indexes[i] = source index for step i (i itself if not copied)
 *   starts: hierarchy level boundaries (chunkSize, chunkSize*2, ...)
 */
function genRepeat(seqSize, chunkSize, bias = 0) {
  let indexes = Array(seqSize).fill().map((v, i) => i);
  let starts = [chunkSize];
  while (starts.at(-1) * 2 < seqSize) starts.push(starts.at(-1) * 2);
  for (let i = 0; i < starts.length; i++) {
    let start = starts[i];
    let end = i + 1 < starts.length ? starts[i + 1] : seqSize; //Math.floor(seqSize / chunkSize) * chunkSize
    for (let start2 = start; start2 < end; start2 += chunkSize) {
      if (Math.random() >= (-2 / seqSize) * start2 + (start / seqSize * 4) + bias) continue;
      for (let pointer = start2; pointer < Math.min(start2 + chunkSize, end); pointer++) indexes[pointer] = indexes[pointer - start];
    }
  }
  return { indexes: indexes, starts: starts };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = genRepeat;
}
