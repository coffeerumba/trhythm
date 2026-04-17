/**
 * genRepeat.js — Hierarchical repetition generator
 *
 * Generates an index mapping that determines which steps copy from earlier steps,
 * creating hierarchical repetition structure.
 *
 * @param {number} seqSize - Total number of steps (e.g. 32)
 * @param {number} chunkSize - Base chunk size in steps (1..seqSize). Clamped to [1, seqSize].
 * @param {number} bias - Probability offset (-1 to 1). Higher = more repetition.
 * @returns {{ indexes: number[], starts: number[] }}
 *   indexes: array where indexes[i] = source index for step i (i itself if not copied)
 *   starts: hierarchy level boundaries (chunkSize, chunkSize*2, ...)
 */
function genRepeat(seqSize, chunkSize, bias = 0) {
  let { probs, starts, chunkSize: cs } = genRepeatProbabilities(seqSize, chunkSize, bias);
  let indexes = Array(seqSize).fill().map((v, i) => i);
  for (let i = 0; i < starts.length; i++) {
    let start = starts[i];
    let end = i + 1 < starts.length ? starts[i + 1] : seqSize;
    for (let start2 = start; start2 < end; start2 += cs) {
      if (Math.random() >= probs[start2]) continue;
      for (let pointer = start2; pointer < Math.min(start2 + cs, end); pointer++) indexes[pointer] = indexes[pointer - start];
    }
  }
  return { indexes: indexes, starts: starts };
}

/**
 * genRepeatProbabilities — Deterministic per-slot copy probability
 *
 * Computes the probability that each slot is overwritten (copied from
 * an earlier slot) by genRepeat under the same parameters. Does not
 * sample — used for visualization.
 *
 * @param {number} seqSize
 * @param {number} chunkSize - Base chunk size in steps. Clamped to [1, seqSize].
 * @param {number} bias
 * @returns {{ probs: number[], starts: number[], chunkSize: number }}
 *   probs[i] = clamp(threshold, 0, 1) for the chunk containing slot i;
 *   slots before the first chunk (0..chunkSize-1) stay at 0.
 *   chunkSize: the clamped value actually used.
 */
function genRepeatProbabilities(seqSize, chunkSize, bias = 0) {
  chunkSize = Math.max(1, Math.min(seqSize, Math.round(chunkSize)));
  let probs = Array(seqSize).fill(0);
  let starts = [chunkSize];
  while (starts.at(-1) * 2 < seqSize) starts.push(starts.at(-1) * 2);
  for (let i = 0; i < starts.length; i++) {
    let start = starts[i];
    let end = i + 1 < starts.length ? starts[i + 1] : seqSize;
    for (let start2 = start; start2 < end; start2 += chunkSize) {
      let threshold = (-2 / seqSize) * start2 + (start / seqSize * 4) + bias;
      let p = Math.max(0, Math.min(1, threshold));
      for (let j = start2; j < Math.min(start2 + chunkSize, end); j++) probs[j] = p;
    }
  }
  return { probs: probs, starts: starts, chunkSize: chunkSize };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = genRepeat;
  module.exports.genRepeatProbabilities = genRepeatProbabilities;
}
