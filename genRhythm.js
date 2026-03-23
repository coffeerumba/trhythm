/**
 * generateRhythm.js — Gumbel-max rhythm generation module
 *
 * Generates rhythm patterns by probabilistic sampling based on metrical hierarchy.
 * Each beat position is scored by its metrical level (importance in the tree structure),
 * with Gumbel noise for controlled randomness. Top-d positions become onsets.
 *
 * @param {Array} structure - Nested array defining beat structure. Leaf groups are numbers.
 *   e.g. [[[2,2],[2,2]],[[2,2],[2,2]]] for 16-step (2 = group of 2 leaves)
 * @param {number} beatLevel - Metrical level threshold defining beat positions.
 *   #{positions with level >= beatLevel} = perceptual beat count.
 *   Serves as the anchor for both rate and center normalization.
 * @param {number} rate - Hit rate 0-1 (default 0.5).
 *   0=silent, 0.5=expected hits equals beat count, 1=all positions hit.
 *   Uses beatLevel to determine beat count: #{positions with level >= beatLevel}.
 * @param {number} center - Level center of gravity 0-1 (default 0).
 *   0=shallowest level weighted (downbeats), 0.5=beat level, 1=deepest level (offbeats).
 *   Interpolation:
 *     center <= 0.5: target = maxLevel - center*2 * (maxLevel - beatLevel)
 *     center >  0.5: target = beatLevel * (1 - center)*2
 * @param {number} fidelity - Structure fidelity 0-1. 1=deterministic (weight order), 0=random.
 * @returns {Array} Same tree structure as input, with leaf groups expanded to 0/1 arrays.
 */
function generateRhythm(structure, beatLevel, rate, center, fidelity) {
  if (beatLevel === undefined) beatLevel = 1;
  if (rate === undefined) rate = 0.5;
  if (center === undefined) center = 0;

  // Step 1: Analyze tree — compute leaf count and levels
  var levels = [];
  function analyzeLevels(node) {
    if (!Array.isArray(node)) {
      // Leaf group: node is a number representing leaf count
      var firstIdx = levels.length;
      for (var j = 0; j < node; j++) levels.push(0);
      if (node > 1) levels[firstIdx] += 1;
      return;
    }
    for (var i = 0; i < node.length; i++) {
      var firstIdx = levels.length;
      analyzeLevels(node[i]);
      if (i === 0) {
        // First child: increment its first leaf's level
        levels[firstIdx] += 1;
      }
    }
  }
  analyzeLevels(structure);
  var N = levels.length;

  // Step 2: Compute maxLevel and beatsCount from beatLevel
  var maxLevel = 0;
  var beatsCount = 0;
  for (var i = 0; i < N; i++) {
    if (levels[i] > maxLevel) maxLevel = levels[i];
    if (levels[i] >= beatLevel) beatsCount++;
  }

  // Step 3: Apply center of gravity — transform levels to weights
  // center=0 → target=maxLevel (downbeats), center=0.5 → target=beatLevel, center=1 → target=0
  var target;
  if (center <= 0.5) {
    target = maxLevel - center * 2 * (maxLevel - beatLevel);
  } else {
    target = beatLevel * (1 - center) * 2;
  }
  var weights = new Array(N);
  for (var i = 0; i < N; i++) {
    weights[i] = maxLevel - Math.abs(levels[i] - target);
  }

  // Step 4: Determine hit count (binomial sampling with rate-derived probability)
  // rate=0 → p=0, rate=0.5 → p=beatsCount/N, rate=1 → p=1
  var p;
  if (rate <= 0.5) {
    p = rate * 2 * beatsCount / N;
  } else {
    var base = beatsCount / N;
    p = base + (rate - 0.5) * 2 * (1 - base);
  }
  var d = 0;
  for (var i = 0; i < N; i++) {
    if (Math.random() < p) d++;
  }

  // Step 5: Gumbel-max scoring
  var tau = (fidelity >= 1) ? 1e-9 : (fidelity <= 0) ? 1e9 : (1 - fidelity) / fidelity;
  var scores = new Array(N);
  for (var i = 0; i < N; i++) {
    var noise = -Math.log(-Math.log(Math.random()));
    scores[i] = weights[i] / tau + noise;
  }

  // Step 6: Select top-d positions
  var indices = new Array(N);
  for (var i = 0; i < N; i++) indices[i] = i;
  indices.sort(function(a, b) { return scores[b] - scores[a]; });

  var selected = {};
  for (var i = 0; i < d; i++) {
    selected[indices[i]] = true;
  }

  // Step 7: Reconstruct tree with 0/1
  var leafIdx = 0;
  function reconstruct(node) {
    if (!Array.isArray(node)) {
      // Leaf group: expand number to array of 0/1
      var arr = new Array(node);
      for (var j = 0; j < node; j++) {
        arr[j] = selected[leafIdx++] ? 1 : 0;
      }
      return arr;
    }
    var result = new Array(node.length);
    for (var i = 0; i < node.length; i++) {
      result[i] = reconstruct(node[i]);
    }
    return result;
  }

  return reconstruct(structure);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = generateRhythm;
}
