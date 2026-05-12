export function bindSettings({
  state,
  dom,
  resizeCanvases,
  startAudio,
  stopAudio,
}) {
  const toggleFsa = document.getElementById("toggle-fsa");
  const toggleSpectrogram = document.getElementById("toggle-spectrogram");
  const toggleOscilloscope = document.getElementById("toggle-oscilloscope");
  const toggleVectorscope = document.getElementById("toggle-vectorscope");

  const cardFsa = document.getElementById("card-fsa");
  const cardSpectrogram = document.getElementById("card-spectrogram");
  const cardOscilloscope = document.getElementById("card-oscilloscope");
  const cardVectorscope = document.getElementById("card-vectorscope");

  function updateCardVisibility() {
    if (toggleFsa && cardFsa)
      cardFsa.style.display = toggleFsa.checked ? "" : "none";
    if (toggleSpectrogram && cardSpectrogram) {
      cardSpectrogram.style.display = toggleSpectrogram.checked ? "" : "none";
    }
    if (toggleOscilloscope && cardOscilloscope) {
      cardOscilloscope.style.display = toggleOscilloscope.checked ? "" : "none";
    }
    if (toggleVectorscope && cardVectorscope) {
      cardVectorscope.style.display = toggleVectorscope.checked ? "" : "none";
    }

    requestAnimationFrame(() => {
      resizeCanvases();
    });
  }

  if (toggleFsa) toggleFsa.addEventListener("change", updateCardVisibility);
  if (toggleSpectrogram) {
    toggleSpectrogram.addEventListener("change", updateCardVisibility);
  }
  if (toggleOscilloscope) {
    toggleOscilloscope.addEventListener("change", updateCardVisibility);
  }
  if (toggleVectorscope) {
    toggleVectorscope.addEventListener("change", updateCardVisibility);
  }

  if (dom.micSelect) {
    dom.micSelect.addEventListener("change", async () => {
      if (state.isRunning) {
        stopAudio();
        await startAudio();
      }
    });
  }

  function updateXLabels() {
    const xLabels = document.querySelector(".x-labels");
    if (!xLabels) return;

    let minF = parseInt(dom.freqMinInput.value, 10) || 20;
    let maxF = parseInt(dom.freqMaxInput.value, 10) || 20000;
    if (minF < 1) minF = 1;
    if (maxF <= minF) {
      maxF = minF + 100;
      dom.freqMaxInput.value = maxF; // Push back to UI
    }

    const labels = [];
    if (dom.freqScaleSelect.value === "linear") {
      for (let i = 0; i < 5; i++) {
        const f = minF + (maxF - minF) * (i / 4);
        labels.push(f >= 1000 ? (f / 1000).toFixed(1) + "k" : Math.round(f));
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const f = minF * Math.pow(maxF / minF, i / 4);
        labels.push(f >= 1000 ? (f / 1000).toFixed(1) + "k" : Math.round(f));
      }
    }

    xLabels.innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
  }

  dom.freqScaleSelect.addEventListener("change", updateXLabels);
  dom.freqMinInput.addEventListener("input", updateXLabels);
  dom.freqMaxInput.addEventListener("input", updateXLabels);

  dom.peakCountInput.addEventListener("input", () => {
    dom.peakCountVal.textContent = dom.peakCountInput.value;
  });

  dom.fftSizeSelect.addEventListener("change", () => {
    const size = parseInt(dom.fftSizeSelect.value, 10);
    if (state.analyser) {
      state.analyser.fftSize = size;
      state.analyserL.fftSize = size;
      state.analyserR.fftSize = size;
    }
    if (state.WasmFftClass) {
      if (state.wasmFft) state.wasmFft.free();
      state.wasmFft = new state.WasmFftClass(size);
    }
  });

  dom.smoothingInput.addEventListener("input", () => {
    dom.smoothingVal.textContent = dom.smoothingInput.value;
    if (state.analyser) {
      state.analyser.smoothingTimeConstant = parseFloat(
        dom.smoothingInput.value,
      );
    }
  });

  dom.minDbInput.addEventListener("input", () => {
    dom.minDbVal.textContent = dom.minDbInput.value;
    if (state.analyser)
      state.analyser.minDecibels = parseFloat(dom.minDbInput.value);
  });

  dom.maxDbInput.addEventListener("input", () => {
    dom.maxDbVal.textContent = dom.maxDbInput.value;
    if (state.analyser)
      state.analyser.maxDecibels = parseFloat(dom.maxDbInput.value);
  });

  if (dom.micGain) {
    dom.micGain.addEventListener("input", () => {
      dom.micGainVal.textContent = dom.micGain.value;
      if (state.micGainNode) {
        const db = parseFloat(dom.micGain.value);
        const linear = Math.pow(10, db / 20);
        state.micGainNode.gain.setTargetAtTime(
          linear,
          state.audioCtx.currentTime,
          0.05,
        );
      }
    });
  }

  if (dom.btnTone) {
    dom.btnTone.addEventListener("click", () => {
      state.toneEnabled = !state.toneEnabled;
      dom.btnTone.textContent = state.toneEnabled
        ? "Disable Tone"
        : "Enable Tone";
      dom.btnTone.style.background = state.toneEnabled ? "#eab308" : "";
      dom.btnTone.style.color = state.toneEnabled ? "#1e293b" : "";
      if (dom.toneStatus)
        dom.toneStatus.style.display = state.toneEnabled ? "block" : "none";

      if (!state.audioCtx && state.toneEnabled) {
        startAudio(); // Force start if not running
      } else if (state.audioCtx) {
        state.updateToneGenerator(state, dom);
      }
    });

    [dom.toneType, dom.toneFreq, dom.toneVol, dom.tonePan].forEach((el) => {
      if (el) {
        el.addEventListener("input", () => {
          if (dom.toneVolVal) dom.toneVolVal.textContent = dom.toneVol.value;
          let p = parseFloat(dom.tonePan.value);
          if (dom.tonePanVal)
            dom.tonePanVal.textContent =
              p === 0
                ? "Center"
                : p < 0
                  ? `L ${(-p).toFixed(2)}`
                  : `R ${p.toFixed(2)}`;
          if (state.updateToneGenerator) state.updateToneGenerator(state, dom);
        });
      }
    });
  }

  if (dom.btnClearClips) {
    dom.btnClearClips.addEventListener("click", () => {
      state.eventLogs = [];
      if (dom.clipLogContainer) {
        dom.clipLogContainer.innerHTML =
          '<div style="color: var(--text-muted); text-align: center; padding: 1rem 0;" id="clip-log-empty">No events recorded</div>';
        dom.clipLogEmpty = document.getElementById("clip-log-empty");
      }
    });
  }

  if (dom.outSelect) {
    dom.outSelect.addEventListener("change", async () => {
      if (state.audioCtx && typeof state.audioCtx.setSinkId === "function") {
        try {
          await state.audioCtx.setSinkId(dom.outSelect.value);
        } catch (e) {
          console.error("Could not set audio output device", e);
        }
      }
    });
  }

  updateXLabels();
  updateCardVisibility();
}
