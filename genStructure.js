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
 *   - Total sum of leaf values (= number of steps) is 4–20
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
 * div        — Binary-ternary divisibility of total step count n.
 *              (v₂ + v₃/log₂3) / log₂(n). Range [0, 1].
 *              1.0 = n is a power of 2.
 * simpson    — Weighted-average Simpson index across unique internal nodes.
 *              At each node: h = fraction of same-signature child pairs.
 *              Root weight = 1, child weight = parent / siblings.
 *              simpson = Σ(weight × h) / Σ(weight). Range [0, 1].
 *              1.0 = all nodes have identical children.
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
 * Subdivision constraint:
 *   MAX_STEPS_PER_BEAT = 6 — more than this loses subdivision feel
 *
 * Algorithm:
 *   1. Compute metrical levels for all leaf positions using analyzeLevels().
 *   2. From highest level (fewest beats) to lowest, find the first where:
 *      a. beats count (#{level >= lvl}) is within [B_min, B_max]
 *      b. steps per beat (totalSteps / beats) <= MAX_STEPS_PER_BEAT
 *   3. That level is beatLevel.
 *   4. Fallback: level 1.
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
 *   [3,3,3]                              → beats=3, beatLevel=1
 *   [[3,3],[3,3]]                        → beats=4, beatLevel=1
 *   [[2,2,2],[2,2,2]]                    → beats=6, beatLevel=1
 *
 * ═══════════════════════════════════════════════════════════════
 * Sort order
 * ═══════════════════════════════════════════════════════════════
 *
 * Rows are sorted by: div descending, simpson descending, leaves ascending,
 * structure ascending.
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
 * div: binary-ternary divisibility of a single number.
 * (v₂ + v₃ / log₂(3)) / log₂(n).
 * 1/log₂(3) ≈ 0.631 = "binary equivalent" of one ternary split.
 */
var LOG2_3 = Math.log(3) / Math.log(2); // ≈ 1.585
var INV_LOG2_3 = 1 / LOG2_3;            // ≈ 0.631

function div(n) {
  if (n <= 1) return 0;
  var v2 = 0, v3 = 0;
  var tmp = n;
  while (tmp % 2 === 0) { v2++; tmp /= 2; }
  while (tmp % 3 === 0) { v3++; tmp /= 3; }
  return (v2 + v3 * INV_LOG2_3) / (Math.log(n) / Math.log(2));
}

/**
 * computeDiv: binary-ternary divisibility of total step count.
 */
function computeDiv(tree) {
  return div(leafSum(tree));
}

/**
 * computeSimpson: weighted-average Simpson index across unique internal nodes.
 *
 * At each unique node (deduped by canonical key):
 *   h = fraction of child-pairs with the same canonical signature.
 * Weight: root = 1, each child = parent_weight / number_of_siblings.
 * Simpson = Σ(weight × h) / Σ(weight).
 */
function canonicalKey(node) {
  if (typeof node === 'number') return String(node);
  var childKeys = [];
  for (var i = 0; i < node.length; i++) {
    childKeys.push(canonicalKey(node[i]));
  }
  childKeys.sort();
  return '[' + childKeys.join(',') + ']';
}

function computeSimpson(tree) {
  var seen = {};
  var totalWeight = 0;
  var totalWeightedH = 0;

  function walk(node, weight) {
    if (typeof node === 'number') return;
    var key = canonicalKey(node);
    if (seen[key]) {
      for (var i = 0; i < node.length; i++) walk(node[i], weight / node.length);
      return;
    }
    seen[key] = true;

    // Pairwise Simpson index
    var sigs = [];
    for (var i = 0; i < node.length; i++) sigs.push(canonicalKey(node[i]));
    var pairs = 0, same = 0;
    for (var i = 0; i < sigs.length; i++) {
      for (var j = i + 1; j < sigs.length; j++) {
        pairs++;
        if (sigs[i] === sigs[j]) same++;
      }
    }
    var h = pairs > 0 ? same / pairs : 1;

    totalWeight += weight;
    totalWeightedH += weight * h;

    for (var i = 0; i < node.length; i++) walk(node[i], weight / node.length);
  }

  walk(tree, 1.0);
  return totalWeight > 0 ? totalWeightedH / totalWeight : 1;
}

function computeCycleRange(leaves) {
  var minCycle = Math.max(leaves * IOI_MIN, CYCLE_MIN);
  var maxCycle = Math.min(leaves * IOI_MAX, CYCLE_MAX);
  return { minCycle: minCycle, maxCycle: maxCycle };
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
var MAX_STEPS_PER_BEAT = 6;

function computeBeatLevel(tree, minCycle, maxCycle) {
  var bMin = Math.ceil(maxCycle / BEAT_DUR_MAX);
  var bMax = Math.floor(minCycle / BEAT_DUR_MIN);

  // Compute metrical levels
  var levels = analyzeLevels(tree);
  var L = levels.length;
  var maxLvl = 0;
  for (var i = 0; i < L; i++) if (levels[i] > maxLvl) maxLvl = levels[i];

  // Find highest level (fewest beats) where:
  //   - beats count is in [bMin, bMax]
  //   - steps per beat <= MAX_STEPS_PER_BEAT
  for (var lvl = maxLvl; lvl >= 1; lvl--) {
    var beats = 0;
    for (var i = 0; i < L; i++) if (levels[i] >= lvl) beats++;
    if (beats < bMin || beats > bMax) continue;
    if (L / beats > MAX_STEPS_PER_BEAT) continue;
    return lvl;
  }

  // Fallback: use level 1
  return 1;
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

    var beatLevel = computeBeatLevel(tree, range.minCycle, range.maxCycle);
    var d = computeDiv(tree);
    var s = computeSimpson(tree);

    rows.push({
      structure: JSON.stringify(tree),
      div: d,
      simpson: s,
      leaves: leaves,
      minCycle: range.minCycle,
      maxCycle: range.maxCycle,
      beatLevel: beatLevel
    });
  }

  console.error('Valid rows (cycle range OK): ' + rows.length);

  // Sort by div desc, then simpson desc, then leaves asc, then structure asc
  rows.sort(function(a, b) {
    if (b.div !== a.div) return b.div - a.div;
    if (b.simpson !== a.simpson) return b.simpson - a.simpson;
    if (a.leaves !== b.leaves) return a.leaves - b.leaves;
    return a.structure < b.structure ? -1 : a.structure > b.structure ? 1 : 0;
  });

  // Output TSV
  var header = 'structure\tdiv\tsimpson\tleaves\tminCycle\tmaxCycle\tbeatLevel';
  var lines = [header];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    lines.push([
      r.structure,
      r.div.toFixed(6),
      r.simpson.toFixed(6),
      r.leaves,
      r.minCycle.toFixed(4),
      r.maxCycle.toFixed(4),
      r.beatLevel
    ].join('\t'));
  }

  var outPath = path.join(__dirname, 'structures.tsv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.error('Wrote ' + rows.length + ' rows to ' + outPath);

  // Output chart data as JS (avoids CORS issues with file:// protocol)
  var chartData = rows.map(function(r) {
    return [r.structure, +r.div.toFixed(6), +r.simpson.toFixed(6)];
  });
  var jsPath = path.join(__dirname, 'js', 'structureData.js');
  fs.writeFileSync(jsPath, 'window.STRUCTURE_DATA=' + JSON.stringify(chartData) + ';\n', 'utf8');
  console.error('Wrote ' + chartData.length + ' entries to ' + jsPath);
}

main();
