(function(TR) {
/* ─── Offline Render & WAV Download ─── */
TR.encodeWAV = function(audioBuffer) {
  var numChannels = audioBuffer.numberOfChannels;
  var sampleRate = audioBuffer.sampleRate;
  var numSamples = audioBuffer.length;
  var bytesPerSample = 2;
  var dataSize = numSamples * numChannels * bytesPerSample;
  var buffer = new ArrayBuffer(44 + dataSize);
  var view = new DataView(buffer);

  function writeStr(offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);

  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  var channels = [];
  for (var ch = 0; ch < numChannels; ch++) channels.push(audioBuffer.getChannelData(ch));

  var offset = 44;
  for (var i = 0; i < numSamples; i++) {
    for (var ch = 0; ch < numChannels; ch++) {
      var sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return buffer;
};

TR.collectPatternsForRender = function() {
  if (TR.state.allMode) {
    if (TR.state.repeatFilterEnabled) {
      var kickIndexes = TR.getRepeatFilterIndexes('kick');
      var snareIndexes = TR.getRepeatFilterIndexes('snare');
      var hihatIndexes = TR.getRepeatFilterIndexes('hihat');
      var list = [];
      for (var i = 0; i < TR.PATTERN_COUNT; i++) {
        var basePat = TR.state.patterns[i];
        if (!basePat) continue;
        var kPat = TR.state.patterns[kickIndexes[i]];
        var sPat = TR.state.patterns[snareIndexes[i]];
        var hPat = TR.state.patterns[hihatIndexes[i]];
        list.push({
          kick: kPat ? kPat.kick : basePat.kick,
          snare: sPat ? sPat.snare : basePat.snare,
          hihat: hPat ? hPat.hihat : basePat.hihat,
          kickDef: basePat.kickDef, snareDef: basePat.snareDef, hihatDef: basePat.hihatDef
        });
      }
      return list;
    } else {
      var list = [];
      for (var i = 0; i < TR.PATTERN_COUNT; i++) {
        if (TR.state.patterns[i]) list.push(TR.state.patterns[i]);
      }
      return list;
    }
  } else {
    if (!TR.state.kickFlat) return [];
    var pat = TR.state.patterns[TR.state.currentPattern];
    if (!pat) return [];
    return [pat];
  }
};

TR.renderOffline = async function() {
  var pats = TR.collectPatternsForRender();
  if (pats.length === 0) return;

  var bpm = parseInt(document.getElementById('bpm').value);
  var sampleRate = 44100;
  var startOffset = 0.01;
  var tail = 0.5;

  var totalDuration = startOffset;
  var patTimings = [];
  for (var p = 0; p < pats.length; p++) {
    var pat = pats[p];
    var kickDef = pat.kickDef;
    var snareDef = pat.snareDef;
    var hihatDef = pat.hihatDef;

    var kickLeaves = TR.computeLevels(kickDef.tree).length;
    var snareLeaves = TR.computeLevels(snareDef.tree).length;
    var hihatLeaves = TR.computeLevels(hihatDef.tree).length;

    var kickBeats = pat.kickBeats || TR.computeBeats(kickDef);
    var snareBeats = pat.snareBeats || TR.computeBeats(snareDef);
    var hihatBeats = pat.hihatBeats || TR.computeBeats(hihatDef);

    var kickSecPerStep = 60.0 * kickBeats / bpm / kickLeaves;
    var snareSecPerStep = 60.0 * snareBeats / bpm / snareLeaves;
    var hihatSecPerStep = 60.0 * hihatBeats / bpm / hihatLeaves;

    var cycleDuration = Math.max(
      kickSecPerStep * kickLeaves,
      snareSecPerStep * snareLeaves,
      hihatSecPerStep * hihatLeaves
    );

    patTimings.push({
      pat: pat, offset: totalDuration,
      kickDef: kickDef, snareDef: snareDef, hihatDef: hihatDef,
      kickSecPerStep: kickSecPerStep, snareSecPerStep: snareSecPerStep, hihatSecPerStep: hihatSecPerStep
    });
    totalDuration += cycleDuration;
  }

  totalDuration += tail;

  var offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  var offMaster = offCtx.createGain();
  offMaster.gain.value = 6.0;
  var offLimiter = offCtx.createDynamicsCompressor();
  offLimiter.threshold.value = -1;
  offLimiter.knee.value = 0;
  offLimiter.ratio.value = 20;
  offLimiter.attack.value = 0.001;
  offLimiter.release.value = 0.02;
  offMaster.connect(offLimiter);
  offLimiter.connect(offCtx.destination);

  var sr = offCtx.sampleRate;
  var nLen = sr * 2;
  var offNoise = offCtx.createBuffer(1, nLen, sr);
  var nData = offNoise.getChannelData(0);
  for (var i = 0; i < nLen; i++) nData[i] = Math.random() * 2 - 1;

  for (var p = 0; p < patTimings.length; p++) {
    var pt = patTimings[p];
    var pat = pt.pat;

    for (var s = 0; s < pat.kick.length; s++) {
      if (pat.kick[s]) TR.audio.playKick(pt.offset + s * pt.kickSecPerStep, offCtx, offMaster);
    }
    for (var s = 0; s < pat.snare.length; s++) {
      if (pat.snare[s]) TR.audio.playSnare(pt.offset + s * pt.snareSecPerStep, offCtx, offMaster, offNoise);
    }
    for (var s = 0; s < pat.hihat.length; s++) {
      if (pat.hihat[s]) TR.audio.playHihat(pt.offset + s * pt.hihatSecPerStep, offCtx, offMaster, offNoise);
    }
    TR.audio.playOpenHihat(pt.offset, offCtx, offMaster, offNoise);
  }

  var rendered = await offCtx.startRendering();
  var wavData = TR.encodeWAV(rendered);
  var blob = new Blob([wavData], { type: 'audio/wav' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var now = new Date();
  var ts = now.getFullYear()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '_' + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');
  a.download = ts + '_trhythm.wav';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

document.getElementById('btn-download').addEventListener('click', async function() {
  try {
    await TR.renderOffline();
  } catch(e) {
    console.error('Download failed:', e);
    alert('\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + e.message);
  }
});
})(window.TR);
