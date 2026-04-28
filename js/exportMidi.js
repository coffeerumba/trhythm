/* ═══════════════════════════════════════════════════════════════
   EXPORT MIDI — render the pattern bank as a Standard MIDI File
   (SMF Format 1, multi-track) and trigger a download.

   Track layout (channel 10 = GM drum kit):
     Track 0  Conductor   tempo + time signature
     Track 1  Kick        note 36 (Bass Drum 1)
     Track 2  Snare       note 38 (Acoustic Snare)
     Track 3  Hi-Hat      note 42 (Closed Hi-Hat)
     Track 4  Crash       note 49 (Crash Cymbal 1)

   Crash mirrors the audio: it fires at every pattern (slot) start
   while accent mode is 'on', stays silent when accent mode is 'off'.

   Time signature is auto-derived from the first pattern's default
   拍構造 (see computeTimeSig — explained at length in the design doc).

   Velocity is fixed at 100 for every note. PPQ is 480 (DAW standard);
   non-cleanly-divisible step counts pick up sub-millisecond rounding,
   well below perceptual threshold.

   No external libraries — SMF binary format is small and we encode
   it directly.
   ═══════════════════════════════════════════════════════════════ */
(function(TR) {

TR.exportMidiAvailable = function() { return true; };

/* ── GM drum mapping (channel 10) ──────────────────────────────── */
var KICK_NOTE  = 36;  // Bass Drum 1
var SNARE_NOTE = 38;  // Acoustic Snare
var HIHAT_NOTE = 42;  // Closed Hi-Hat
var CRASH_NOTE = 49;  // Crash Cymbal 1
var CHANNEL    = 9;   // 0-indexed; channel 10 in 1-indexed convention
var VELOCITY   = 100; // kick / snare / hi-hat (crash uses staged velocity)
var PPQ        = 480;

/* ── Cymbal staged velocity ─────────────────────────────────────
   Audio (TR.audio.playAccent) chooses one of 5 cymbal "stages" per
   pattern based on the 2-adic valuation of the bank index — strongest
   on patterns whose index has the most factors of 2 (so on a 16-bank,
   pattern 0 is strongest, pattern 8 next, etc). MIDI mirrors that as
   velocity, mapping linearly 40 → 100 across stages 0 → 4 (15-step)
   so the accent hierarchy carries over to a piano roll while staying
   audible at the weakest stage on most GM drum kits. ── */
var NUM_CY_STAGES = 5;
function cymbalStage(bankIdx) {
  var n = (bankIdx === 0) ? TR.PATTERN_COUNT : bankIdx;
  var v2 = 0;
  while (n > 0 && n % 2 === 0) { n /= 2; v2++; }
  return Math.min(v2, NUM_CY_STAGES - 1);
}
function cymbalVelocity(bankIdx) {
  // stage 0 → 40 (weakest, still audible), stage 4 → 100 (strongest).
  // 5 stages × 15-step → 40, 55, 70, 85, 100.
  return 40 + cymbalStage(bankIdx) * 15;
}

/* ── Binary helpers ────────────────────────────────────────────── */
// Variable-length quantity (used for delta times and meta lengths).
// 7 bits per byte, MSB set on continuation, cleared on the last byte.
function writeVLQ(value) {
  if (value < 0) value = 0;
  var bytes = [value & 0x7F];
  value = value >>> 7;
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80);
    value = value >>> 7;
  }
  return bytes;
}
function pushString(arr, str) {
  for (var i = 0; i < str.length; i++) arr.push(str.charCodeAt(i) & 0xFF);
}
function pushU32BE(arr, val) {
  arr.push((val >>> 24) & 0xFF);
  arr.push((val >>> 16) & 0xFF);
  arr.push((val >>> 8)  & 0xFF);
  arr.push( val         & 0xFF);
}
function pushU16BE(arr, val) {
  arr.push((val >>> 8) & 0xFF);
  arr.push( val        & 0xFF);
}

/* ── MIDI message builders ─────────────────────────────────────── */
function metaEvent(typeByte, dataBytes) {
  var msg = [0xFF, typeByte];
  var lenVlq = writeVLQ(dataBytes.length);
  for (var i = 0; i < lenVlq.length; i++) msg.push(lenVlq[i]);
  for (var j = 0; j < dataBytes.length; j++) msg.push(dataBytes[j]);
  return msg;
}
function trackNameMeta(name) {
  var bytes = [];
  for (var i = 0; i < name.length; i++) bytes.push(name.charCodeAt(i) & 0xFF);
  return metaEvent(0x03, bytes);
}
function tempoMeta(usPerQuarter) {
  return metaEvent(0x51, [
    (usPerQuarter >>> 16) & 0xFF,
    (usPerQuarter >>> 8)  & 0xFF,
     usPerQuarter         & 0xFF
  ]);
}
function timeSigMeta(num, denom) {
  // SMF stores denominator as log2 (4 → 2, 8 → 3, 16 → 4).
  var denomLog = Math.round(Math.log2(denom));
  // 24 = MIDI clocks per metronome click; 8 = 32nd notes per quarter.
  // These are the ubiquitous defaults; any DAW knows what to do with them.
  return metaEvent(0x58, [num & 0xFF, denomLog & 0xFF, 24, 8]);
}
function noteOn(ch, note, vel)  { return [0x90 | (ch & 0x0F), note & 0x7F, vel & 0x7F]; }
function noteOff(ch, note, vel) { return [0x80 | (ch & 0x0F), note & 0x7F, vel & 0x7F]; }

/* ── Time signature auto-detect ─────────────────────────────────
   Rule (also in the design doc):
     subdiv = steps / beats
     if steps % beats == 0  AND  subdiv % 3 == 0  AND  subdiv % 2 != 0
       → compound:  numerator = beats × 3, denominator = 8   (e.g. 6/8, 9/8, 12/8)
     else
       → simple:    numerator = beats,     denominator = 4   (e.g. 4/4, 3/4, 7/4)
   Non-uniform structures (Tresillo etc) fall through to simple — the
   8 evenly-spaced steps end up syncopated against the 3/4 grid, which
   matches how those rhythms are conventionally notated. ── */
function computeTimeSig(beats, steps) {
  if (beats <= 0) return [4, 4];
  if (steps > 0 && steps % beats === 0) {
    var subdiv = steps / beats;
    if (subdiv % 3 === 0 && subdiv % 2 !== 0) {
      return [Math.min(255, beats * 3), 8];
    }
  }
  return [Math.min(255, beats), 4];
}

/* ── Per-track hit emitter ───────────────────────────────────────
   For one track of one pattern slot, append note-on / note-off pairs
   for each set step in `hits`. Note duration = 50% of one step (long
   enough to read clearly in a piano roll, short enough not to bleed
   into the next step on dense patterns).
── */
function addHitEvents(events, hits, beats, leaves, baseTick, note) {
  if (!hits || !leaves) return;
  var ticksPerStep = beats * PPQ / leaves;
  var dur = Math.max(1, Math.round(ticksPerStep * 0.5));
  for (var s = 0; s < hits.length; s++) {
    if (!hits[s]) continue;
    var tickOn = baseTick + Math.round(s * ticksPerStep);
    events.push({ tick: tickOn,       msg: noteOn(CHANNEL,  note, VELOCITY) });
    events.push({ tick: tickOn + dur, msg: noteOff(CHANNEL, note, 0) });
  }
}

/* ── SMF chunk assembler ───────────────────────────────────────── */
function buildSmf(opts) {
  var bytes = [];

  // Header chunk
  pushString(bytes, 'MThd');
  pushU32BE(bytes, 6);
  pushU16BE(bytes, 1);                    // format 1 (multi-track)
  pushU16BE(bytes, opts.tracks.length);
  pushU16BE(bytes, opts.ppq);

  // Track chunks
  for (var t = 0; t < opts.tracks.length; t++) {
    var tr = opts.tracks[t];
    // Stable sort: events at the same tick keep their insertion order
    // (matters for note-name meta first, then notes; or simultaneous
    // note-off before note-on if they happen to land on the same tick).
    tr.events.sort(function(a, b) { return a.tick - b.tick; });

    var tb = [];
    var lastTick = 0;
    for (var e = 0; e < tr.events.length; e++) {
      var ev = tr.events[e];
      var delta = Math.max(0, ev.tick - lastTick);
      var vlq = writeVLQ(delta);
      for (var v = 0; v < vlq.length; v++) tb.push(vlq[v]);
      for (var b = 0; b < ev.msg.length; b++) tb.push(ev.msg[b]);
      lastTick = ev.tick;
    }
    // End-of-track meta (delta 0, FF 2F 00) — required by spec
    tb.push(0x00, 0xFF, 0x2F, 0x00);

    pushString(bytes, 'MTrk');
    pushU32BE(bytes, tb.length);
    for (var i = 0; i < tb.length; i++) bytes.push(tb[i]);
  }

  return new Uint8Array(bytes);
}

/* ── Download helpers ──────────────────────────────────────────── */
function downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function timestamp() {
  var now = new Date();
  function pad(n) { return ('0' + n).slice(-2); }
  return now.getFullYear()
    + pad(now.getMonth() + 1) + pad(now.getDate())
    + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}

/* ── Public API ───────────────────────────────────────────────── */
TR.exportMidi = function() {
  var pats = TR.collectPatternsForRender();
  if (!pats.length) throw new Error('No patterns to render');

  var bpm = parseInt(document.getElementById('bpm').value);
  var accentMode = TR.getAccentMode();

  // Time signature derived once, from the first pattern's default 拍構造.
  // Mid-file time-sig changes are technically possible in SMF but DAWs
  // handle them inconsistently; a single sig is far less surprising.
  var firstDef = pats[0].pat.defaultDef;
  var firstSteps = firstDef ? TR.computeLevels(firstDef.tree).length : 4;
  var firstBeats = firstDef ? TR.computeBeats(firstDef) : 4;
  var ts = computeTimeSig(firstBeats, firstSteps);

  var conductor = { events: [
    { tick: 0, msg: trackNameMeta('Conductor') },
    { tick: 0, msg: tempoMeta(Math.round(60000000 / bpm)) },
    { tick: 0, msg: timeSigMeta(ts[0], ts[1]) }
  ]};
  var kick   = { events: [{ tick: 0, msg: trackNameMeta('Kick')   }] };
  var snare  = { events: [{ tick: 0, msg: trackNameMeta('Snare')  }] };
  var hihat  = { events: [{ tick: 0, msg: trackNameMeta('Hi-Hat') }] };
  var crash  = { events: [{ tick: 0, msg: trackNameMeta('Crash')  }] };

  // Concatenate patterns just like the audio export does. Each slot is
  // as long as the longest of its tracks (max of beats × PPQ); shorter
  // tracks simply have silence at the slot's tail. Polymeter-friendly.
  var globalTick = 0;
  for (var p = 0; p < pats.length; p++) {
    var pat = pats[p].pat;
    var bankIdx = pats[p].bankIdx;

    var kickLeaves  = TR.computeLevels(pat.kickDef.tree).length;
    var snareLeaves = TR.computeLevels(pat.snareDef.tree).length;
    var hihatLeaves = TR.computeLevels(pat.hihatDef.tree).length;
    var kickBeats   = pat.kickBeats  || TR.computeBeats(pat.kickDef);
    var snareBeats  = pat.snareBeats || TR.computeBeats(pat.snareDef);
    var hihatBeats  = pat.hihatBeats || TR.computeBeats(pat.hihatDef);

    var slotTicks = Math.max(kickBeats, snareBeats, hihatBeats) * PPQ;

    addHitEvents(kick.events,  pat.kick,  kickBeats,  kickLeaves,  globalTick, KICK_NOTE);
    addHitEvents(snare.events, pat.snare, snareBeats, snareLeaves, globalTick, SNARE_NOTE);
    addHitEvents(hihat.events, pat.hihat, hihatBeats, hihatLeaves, globalTick, HIHAT_NOTE);

    // Crash on slot start when accent mode is 'on'. Velocity reflects
    // the audio's 5-stage cymbal hierarchy keyed off the bank index;
    // strongest accents land on the patterns with the most factors of 2
    // (typically pattern 0, then 8, then 4/12, etc). When accent mode
    // is 'off', no crash events at all.
    if (accentMode === 'on') {
      var dur = Math.max(1, Math.round(PPQ * 0.5));
      var crashVel = cymbalVelocity(bankIdx);
      crash.events.push({ tick: globalTick,        msg: noteOn(CHANNEL,  CRASH_NOTE, crashVel) });
      crash.events.push({ tick: globalTick + dur,  msg: noteOff(CHANNEL, CRASH_NOTE, 0) });
    }

    globalTick += slotTicks;
  }

  var smf = buildSmf({
    ppq: PPQ,
    tracks: [conductor, kick, snare, hihat, crash]
  });
  var blob = new Blob([smf], { type: 'audio/midi' });
  downloadBlob(blob, timestamp() + '_trhythm.mid');
};

})(window.TR);
