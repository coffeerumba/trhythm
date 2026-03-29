(function(TR) {
/* ─── Help popup toggle ─── */
TR.toggleHelp = function(btn) {
  var group = btn.closest('.param-group');
  if (group) {
    var popup = group.querySelector('.help-popup');
    if (popup) popup.classList.toggle('open');
  }
};

/* ─── UI Helpers ─── */
TR.getParam = function(inst, param) {
  var el = document.getElementById(inst + '-' + param);
  return parseFloat(el.value);
};

/* ─── Slider value display ─── */
TR.setupSlider = function(id) {
  var slider = document.getElementById(id);
  var display = document.getElementById(id + '-val');
  slider.addEventListener('input', function() {
    display.textContent = parseFloat(slider.value).toFixed(2);
  });
};

/* ─── Per-instrument structure helper ─── */
TR.getInstStructure = function(inst) {
  var key = document.getElementById(inst + '-struct').value;
  if (key === 'default') key = document.getElementById('default-struct').value;
  return TR.STRUCTURES[key];
};

/* ─── Update beats select for an instrument ─── */
TR.updateBeatsSelect = function(inst) {
  var def = TR.getInstStructure(inst);
  var naturalBeats = TR.computeBeats(def);
  var sel = document.getElementById(inst + '-beats');
  var defaultBeats = TR.computeBeats(TR.STRUCTURES[document.getElementById('default-struct').value]);

  if (naturalBeats === defaultBeats) {
    sel.innerHTML = '<option value="' + defaultBeats + '" selected>\u540c\u671f</option>';
    sel.disabled = true;
  } else {
    sel.innerHTML = '<option value="' + defaultBeats + '" selected>\u540c\u671f</option>' +
                    '<option value="' + naturalBeats + '">\u975e\u540c\u671f</option>';
    sel.disabled = false;
  }
};

TR.updateAllBeatsSelects = function() {
  TR.updateBeatsSelect('kick');
  TR.updateBeatsSelect('snare');
  TR.updateBeatsSelect('hihat');
};
})(window.TR);
