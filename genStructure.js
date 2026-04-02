#!/usr/bin/env node
'use strict';

/**
 * generateStructure.js — Beat structure catalog generator
 *
 * Usage: node generateStructure.js
 * Output: structures.tsv (same directory)
 *
 * ═══════════════════════════════════════════════════════════════
 * Structure definition
 * ═══════════════════════════════════════════════════════════════
 *
 * A "beat structure" is a nested array representing a balanced-depth tree.
 * Constraints:
 *   - Each internal node has 2 or 3 children
 *   - Leaf values are 2 or 3
 *   - All leaves are at the same nesting depth
 *   - Total sum of leaf values (= number of steps) is 4–32
 *
 * Examples:
 *   [2,2]                         → 4 steps (depth 1)
 *   [[2,2],[2,2]]                 → 8 steps (depth 2)
 *   [[[2,2],[2,2]],[[2,2],[2,2]]] → 16 steps (depth 3)
 *   [3,3,2]                       → 8 steps (tresillo-type, depth 1)
 *
 * ═══════════════════════════════════════════════════════════════
 * Output columns
 * ═══════════════════════════════════════════════════════════════
 *
 * structure  — JSON representation of the tree
 * score      — 1 / (cellTypes × spanRatio). Higher = more regular.
 * cellTypes  — Number of distinct leaf-parent arrays in the tree.
 *              e.g. [[2,2],[3,3]] has 2 types: [2,2] and [3,3].
 *              Order matters: [2,3] and [3,2] are different types.
 * spanRatio  — For each internal node, max(childSums)/min(childSums).
 *              The maximum ratio across all nodes in the tree.
 *              1.0 means all sibling subtrees have equal step counts.
 * leaves     — Total steps (sum of all leaf values).
 * minCycle   — Minimum cycle duration in seconds.
 * maxCycle   — Maximum cycle duration in seconds.
 * beatLevel  — Metrical level threshold defining beat positions.
 *              #{positions with level >= beatLevel} = perceptual beat count.
 *
 * ═══════════════════════════════════════════════════════════════
 * Perceptual constraints
 * ═══════════════════════════════════════════════════════════════
 *
 * IOI (inter-onset interval) bounds:
 *   IOI_MIN = 0.1s   — fastest perceivable step
 *   IOI_MAX = 0.5s   — slowest comfortable step
 *
 * Cycle duration bounds:
 *   CYCLE_MIN = 1.0s  — shortest perceivable cycle
 *   CYCLE_MAX = 5.0s  — longest comfortable cycle
 *
 * Derived cycle range for a structure with L steps:
 *   minCycle = max(L × IOI_MIN, CYCLE_MIN)
 *   maxCycle = min(L × IOI_MAX, CYCLE_MAX)
 *
 * ═══════════════════════════════════════════════════════════════
 * beatLevel computation
 * ═══════════════════════════════════════════════════════════════
 *
 * beatLevel is the metrical level threshold that defines "beat positions".
 * A position with level >= beatLevel is a beat; below it is a subdivision.
 *
 * Beat duration bounds (comfortable pulse range):
 *   BEAT_DUR_MIN = 0.2s   — faster than this loses pulse feel
 *   BEAT_DUR_MAX = 1.5s   — slower than this loses pulse feel
 *
 * For a given structure:
 *   B_min = ceil(maxCycle / BEAT_DUR_MAX)
 *   B_max = floor(minCycle / BEAT_DUR_MIN)
 *
 * Algorithm:
 *   1. Compute beats count (same as before):
 *      a. Count leaf-parent nodes (nodes at depth maxDepth-1).
 *      b. If that count is within [B_min, B_max], use it as beats.
 *      c. Otherwise, fall back to leaf count (nodes at depth maxDepth).
 *   2. Compute metrical levels for all leaf positions using analyzeLevels().
 *   3. Sort levels descending.
 *   4. beatLevel = levels[beats - 1] (the beats-th largest level).
 *
 * Property: #{positions with level >= beatLevel} = beats.
 * This means beats can always be derived from beatLevel:
 *   beats = count of positions where level >= beatLevel
 *
 * beatLevel serves as the unified anchor for both rate and center
 * parameters in generateRhythm():
 *   - rate=1 → expected hits = #{level >= beatLevel} = beats
 *   - center=1 → target level = beatLevel
 *
 * Examples:
 *   [2,2]                                → beats=2, beatLevel=1
 *   [[2,2],[2,2]]                        → beats=4, beatLevel=1
 *   [[[2,2],[2,2]],[[2,2],[2,2]]]        → beats=4, beatLevel=2
 *   [[[[2,2],[2,2]],…],[…]]  (32 steps)  → beats=8, beatLevel=2
 *   [3,3,3]                              → beats=3, beatLevel=1
 *   [[3,3],[3,3]]                        → beats=4, beatLevel=1
 *   [[2,2,2],[2,2,2]]                    → beats=6, beatLevel=1
 *
 * ═══════════════════════════════════════════════════════════════
 * Sort order
 * ═══════════════════════════════════════════════════════════════
 *
 * Rows are sorted by: score descending, leaves ascending, structure ascending.
 */

var fs = require('fs');
var path = require('path');

/* ─── Constants ─── */
var LEAF_VALUES = [2, 3];
var CHILD_COUNTS = [2, 3];
var SUM_MIN = 4;
var SUM_MAX = 20;
var IOI_MIN = 0.1;
var IOI_MAX = 0.5;
var CYCLE_MIN = 1.0;
var CYCLE_MAX = 5.0;
var BEAT_DUR_MIN = 0.2;
var BEAT_DUR_MAX = 1.5;

/* ─── Tree generation ─── */

/**
 * Generate all leaf-level arrays (arrays containing only leaf values).
 * Returns items like { tree: [2,2], sum: 4 }.
 */
function generateLeafArrays() {
  var results = [];
  for (var ci = 0; ci < CHILD_COUNTS.length; ci++) {
    var cc = CHILD_COUNTS[ci];
    addLeafCombos(LEAF_VALUES, cc, [], 0, results);
  }
  return results;
}

function addLeafCombos(values, remaining, current, currentSum, results) {
  if (remaining === 0) {
    if (currentSum >= SUM_MIN && currentSum <= SUM_MAX) {
      results.push({ tree: current.slice(), sum: currentSum });
    }
    return;
  }
  for (var i = 0; i < values.length; i++) {
    current.push(values[i]);
    addLeafCombos(values, remaining - 1, current, currentSum + values[i], results);
    current.pop();
  }
}

/**
 * Build all structures bottom-up, depth by depth.
 * At each depth, combine subtrees from the previous depth
 * into groups of 2 or 3, with sum constraint pruning.
 */
function generateAllStructures() {
  var depth1 = generateLeafArrays();
  console.error('Depth 1: ' + depth1.length + ' subtrees');

  var allTrees = depth1.map(function(x) { return x.tree; });
  var currentLevel = depth1;

  var depth = 1;
  while (currentLevel.length > 0) {
    depth++;
    // Sort by sum for pruning (break early when sum exceeds limit)
    currentLevel.sort(function(a, b) { return a.sum - b.sum; });
    var minChildSum = currentLevel[0].sum;

    var nextMap = {}; // JSON key -> { tree, sum }

    for (var ci = 0; ci < CHILD_COUNTS.length; ci++) {
      var cc = CHILD_COUNTS[ci];
      if (cc * minChildSum > SUM_MAX) continue;
      buildTuples(currentLevel, cc, cc, [], 0, minChildSum, nextMap);
    }

    var nextLevel = [];
    var keys = Object.keys(nextMap);
    for (var i = 0; i < keys.length; i++) {
      nextLevel.push(nextMap[keys[i]]);
    }

    console.error('Depth ' + depth + ': ' + nextLevel.length + ' subtrees');

    for (var i = 0; i < nextLevel.length; i++) {
      allTrees.push(nextLevel[i].tree);
    }
    currentLevel = nextLevel;
  }

  return allTrees;
}

/**
 * Recursively build ordered tuples of `remaining` children from `pool`,
 * pruning branches where the partial sum cannot stay within [SUM_MIN, SUM_MAX].
 */
function buildTuples(pool, total, remaining, parts, partialSum, minChildSum, resultMap) {
  if (remaining === 0) {
    if (partialSum >= SUM_MIN && partialSum <= SUM_MAX) {
      var tree = [];
      for (var i = 0; i < parts.length; i++) {
        tree.push(parts[i].tree);
      }
      var key = JSON.stringify(tree);
      if (!resultMap[key]) {
        resultMap[key] = { tree: tree, sum: partialSum };
      }
    }
    return;
  }

  // Maximum sum this child can have: total budget minus partial, minus
  // minimum contribution from remaining-1 future children.
  var maxAllowed = SUM_MAX - partialSum - (remaining - 1) * minChildSum;

  for (var i = 0; i < pool.length; i++) {
    if (pool[i].sum > maxAllowed) break; // pool sorted by sum
    parts.push(pool[i]);
    buildTuples(pool, total, remaining - 1, parts, partialSum + pool[i].sum, minChildSum, resultMap);
    parts.pop();
  }
}

/* ─── Metrics ─── */

function leafSum(tree) {
  if (typeof tree === 'number') return tree;
  var s = 0;
  for (var i = 0; i < tree.length; i++) {
    s += leafSum(tree[i]);
  }
  return s;
}

/**
 * cellTypes: number of distinct leaf-parent array signatures.
 */
function computeCellTypes(tree) {
  var types = {};
  collectLeafParents(tree, types);
  return Object.keys(types).length;
}

function collectLeafParents(node, types) {
  if (typeof node === 'number') return;
  var allLeaves = true;
  for (var i = 0; i < node.length; i++) {
    if (typeof node[i] !== 'number') { allLeaves = false; break; }
  }
  if (allLeaves) {
    types[JSON.stringify(node)] = true;
  } else {
    for (var i = 0; i < node.length; i++) {
      collectLeafParents(node[i], types);
    }
  }
}

/**
 * spanRatio: max(childSums) / min(childSums) across all internal nodes.
 */
function computeSpanRatio(tree) {
  if (typeof tree === 'number') return 1.0;
  var maxRatio = 1.0;
  var childSums = [];
  for (var i = 0; i < tree.length; i++) {
    childSums.push(leafSum(tree[i]));
  }
  var minS = childSums[0], maxS = childSums[0];
  for (var i = 1; i < childSums.length; i++) {
    if (childSums[i] < minS) minS = childSums[i];
    if (childSums[i] > maxS) maxS = childSums[i];
  }
  if (minS > 0) {
    var ratio = maxS / minS;
    if (ratio > maxRatio) maxRatio = ratio;
  }
  for (var i = 0; i < tree.length; i++) {
    var childRatio = computeSpanRatio(tree[i]);
    if (childRatio > maxRatio) maxRatio = childRatio;
  }
  return maxRatio;
}

function computeCycleRange(leaves) {
  var minCycle = Math.max(leaves * IOI_MIN, CYCLE_MIN);
  var maxCycle = Math.min(leaves * IOI_MAX, CYCLE_MAX);
  return { minCycle: minCycle, maxCycle: maxCycle };
}

/**
 * Count nodes at a given depth from root.
 */
function countNodesAtDepth(node, depth) {
  if (depth === 0 || typeof node === 'number') return 1;
  var count = 0;
  for (var i = 0; i < node.length; i++) {
    count += countNodesAtDepth(node[i], depth - 1);
  }
  return count;
}

function getMaxDepth(node) {
  if (typeof node === 'number') return 0;
  var maxD = 0;
  for (var i = 0; i < node.length; i++) {
    var d = getMaxDepth(node[i]);
    if (d > maxD) maxD = d;
  }
  return 1 + maxD;
}

/**
 * Compute metrical levels for each leaf position in the tree.
 * Level = number of "first child" markers accumulated along the path.
 * Same algorithm as generateRhythm.js analyzeLevels.
 */
function analyzeLevels(tree) {
  var levels = [];
  function walk(node) {
    if (!Array.isArray(node)) {
      var firstIdx = levels.length;
      for (var j = 0; j < node; j++) levels.push(0);
      if (node > 1) levels[firstIdx] += 1;
      return;
    }
    for (var i = 0; i < node.length; i++) {
      var firstIdx = levels.length;
      walk(node[i]);
      if (i === 0) {
        levels[firstIdx] += 1;
      }
    }
  }
  walk(tree);
  return levels;
}

/**
 * Compute beatLevel — the metrical level threshold defining beat positions.
 *
 * 1. Determine beats count (leaf-parent count, fallback to leaf count).
 * 2. Compute metrical levels for all positions.
 * 3. beatLevel = the beats-th largest level value.
 */
function computeBeatLevel(tree, minCycle, maxCycle) {
  var bMin = Math.ceil(maxCycle / BEAT_DUR_MAX);
  var bMax = Math.floor(minCycle / BEAT_DUR_MIN);
  var maxDepth = getMaxDepth(tree);

  // Step 1: Determine beats count
  var beats;
  var leafParentCount = countNodesAtDepth(tree, maxDepth - 1);
  if (leafParentCount >= bMin && leafParentCount <= bMax) {
    beats = leafParentCount;
  } else {
    beats = countNodesAtDepth(tree, maxDepth);
  }

  // Step 2: Compute metrical levels
  var levels = analyzeLevels(tree);

  // Step 3: Sort descending, take beats-th value
  var sorted = levels.slice().sort(function(a, b) { return b - a; });
  return sorted[beats - 1];
}

/* ─── Main ─── */

function main() {
  console.error('Generating structures...');
  var trees = generateAllStructures();
  console.error('Total structures: ' + trees.length);

  // Compute metrics, filter by valid cycle range
  var rows = [];
  for (var i = 0; i < trees.length; i++) {
    var tree = trees[i];
    var leaves = leafSum(tree);
    var range = computeCycleRange(leaves);
    if (range.minCycle > range.maxCycle) continue;

    var cellTypes = computeCellTypes(tree);
    var spanRatio = computeSpanRatio(tree);
    var score = 1.0 / (cellTypes * spanRatio);
    var beatLevel = computeBeatLevel(tree, range.minCycle, range.maxCycle);

    rows.push({
      structure: JSON.stringify(tree),
      score: score,
      cellTypes: cellTypes,
      spanRatio: spanRatio,
      leaves: leaves,
      minCycle: range.minCycle,
      maxCycle: range.maxCycle,
      beatLevel: beatLevel
    });
  }

  console.error('Valid rows (cycle range OK): ' + rows.length);

  // Sort by score desc, then leaves asc, then structure asc
  rows.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (a.leaves !== b.leaves) return a.leaves - b.leaves;
    return a.structure < b.structure ? -1 : a.structure > b.structure ? 1 : 0;
  });

  // Output TSV
  var header = 'structure\tscore\tcellTypes\tspanRatio\tleaves\tminCycle\tmaxCycle\tbeatLevel';
  var lines = [header];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    lines.push([
      r.structure,
      r.score.toFixed(6),
      r.cellTypes,
      r.spanRatio.toFixed(4),
      r.leaves,
      r.minCycle.toFixed(4),
      r.maxCycle.toFixed(4),
      r.beatLevel
    ].join('\t'));
  }

  var outPath = path.join(__dirname, 'structures.tsv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.error('Wrote ' + rows.length + ' rows to ' + outPath);
}

main();
