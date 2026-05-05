import { getDomRefs } from "./dom.js";
import { createInitialState } from "./state.js";
import { resizeCanvases } from "./layout.js";
import { createAudioController } from "./audio.js";
import { bindSettings } from "./settings.js";
import { createRenderer } from "./render.js";
import { startTransmission } from "./modem.js";
import { drawTextToAudioBuffer } from "./spectrogramDraw.js";

export function initApp() {
  const dom = getDomRefs();
  const state = createInitialState();

  function syncConfig() {
    if (!state.config) return;
    let minF = parseInt(dom.freqMinInput?.value, 10) || 20;
    let maxF = parseInt(dom.freqMaxInput?.value, 10) || 20000;
    if (minF < 1) minF = 1;
    if (maxF <= minF) maxF = minF + 100;
    state.config.freqMinLog = minF;
    state.config.freqMaxLog = maxF;
    state.config.useLogScale = dom.freqScaleSelect?.value === "logarithmic";
    let pc = parseInt(dom.peakCountInput?.value, 10);
    state.config.peakCount = isNaN(pc) ? 10 : pc;
    state.config.meteringStandard = dom.meteringStandard?.value || "peak";
    state.config.specMode = dom.specModeSelect?.value || "standard";
    state.config.specTheme = dom.specThemeSelect?.value || "classic";
    state.config.updateRateFps =
      parseInt(dom.updateRateSelect?.value, 10) || 60;

    if (dom.spectrumView) state.spectrumView = dom.spectrumView.value;
    if (dom.peakHoldInf) state.peakHoldInf = dom.peakHoldInf.checked;

    console.log(
      "syncConfig",
      state.config.freqMinLog,
      state.config.freqMaxLog,
      state.config.useLogScale,
    );
  }

  [
    dom.freqMinInput,
    dom.freqMaxInput,
    dom.freqScaleSelect,
    dom.peakCountInput,
    dom.meteringStandard,
    dom.specModeSelect,
    dom.specThemeSelect,
    dom.updateRateSelect,
    dom.spectrumView,
    dom.peakHoldInf,
  ].forEach((el) => {
    if (el) {
      el.addEventListener("input", syncConfig);
      el.addEventListener("change", syncConfig);
    }
  });

  syncConfig(); // Initialize config from DOM right away

  const handleResize = () => {
    resizeCanvases(dom);
    const dpr = window.devicePixelRatio || 1;
    if (state && state.config) {
      if (dom.canvasSpectrum) {
        state.config.wSpec = dom.canvasSpectrum.width / dpr || 0;
        state.config.hSpec = dom.canvasSpectrum.height / dpr || 0;
      }
      if (dom.canvasWaveform) {
        state.config.wWave = dom.canvasWaveform.width / dpr || 0;
        state.config.hWave = dom.canvasWaveform.height / dpr || 0;
      }
      if (dom.canvasSpectrogram) {
        state.config.wSpecg = dom.canvasSpectrogram.width / dpr || 0;
        state.config.hSpecg = dom.canvasSpectrogram.height / dpr || 0;
      }
      if (dom.canvasVectorscope) {
        state.config.wVec = dom.canvasVectorscope.width / dpr || 0;
        state.config.hVec = dom.canvasVectorscope.height / dpr || 0;
      }
    }
  };

  if (dom.canvasSpectrum) {
    const el = dom.canvasSpectrum;
    el.addEventListener("mousemove", (e) => {
      state.mouseX = e.offsetX;
      state.mouseY = e.offsetY;
      if (state.isDraggingFilter) {
        state.filterEndX = e.offsetX;
      }
    });

    el.addEventListener("mouseenter", () => {
      state.isHovering = true;
    });

    el.addEventListener("mouseleave", () => {
      state.isHovering = false;
      state.isDraggingFilter = false;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          0,
          state.audioCtx.currentTime,
          0.05,
        );
      }
      if (dom.hoverTooltip) {
        dom.hoverTooltip.style.display = "none";
      }
    });

    el.addEventListener("mousedown", (e) => {
      // Only trigger if it's the primary (left) mouse button
      if (e.button !== 0) return;
      state.isDraggingFilter = true;
      state.filterStartX = e.offsetX;
      state.filterEndX = e.offsetX;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          1,
          state.audioCtx.currentTime,
          0.05,
        );
      }
    });

    el.addEventListener("mouseup", () => {
      state.isDraggingFilter = false;
      if (state.soloGain && state.audioCtx) {
        state.soloGain.gain.cancelScheduledValues(state.audioCtx.currentTime);
        state.soloGain.gain.setTargetAtTime(
          0,
          state.audioCtx.currentTime,
          0.05,
        );
      }
    });
  }

  if (dom.btnFreeze) {
    dom.btnFreeze.addEventListener("click", () => {
      state.isFrozen = !state.isFrozen;
      dom.btnFreeze.textContent = state.isFrozen ? "Unfreeze" : "Freeze";
      if (state.isFrozen) {
        dom.btnFreeze.style.background = "#3b82f6";
        dom.btnFreeze.style.color = "white";
      } else {
        dom.btnFreeze.style.background = "";
        dom.btnFreeze.style.color = "";
      }
    });
  }

  if (dom.btnCalibrate) {
    dom.btnCalibrate.addEventListener("click", () => {
      if (!state.analyser) {
        alert("Please start the microphone first to calibrate.");
        return;
      }
      state.isCalibrating = true;
      state.calibrationFrames = 0;
      state.calibrationBuffer = new Float32Array(
        state.analyser.frequencyBinCount,
      );
      dom.btnCalibrate.textContent = "Calibrating...";
      dom.btnCalibrate.disabled = true;
    });
  }

  if (dom.btnClearCalibrate) {
    dom.btnClearCalibrate.addEventListener("click", () => {
      state.noiseProfile = null;
      state.noiseStats = { avgDb: -100, profileType: "None" };
      if (dom.noiseStats) {
        dom.noiseStats.innerHTML = `Profile: None<br/>Avg Noise Level: -- dB<br/>Type: --`;
      }
    });
  }

  if (dom.btnSnapshot) {
    dom.btnSnapshot.addEventListener("click", () => {
      if (!state.freqDataBuffer) return;
      state.snapshotBuffer = new Float32Array(state.freqDataBuffer);
    });
  }

  if (dom.btnClearSnapshot) {
    dom.btnClearSnapshot.addEventListener("click", () => {
      state.snapshotBuffer = null;
    });
  }

  const renderer = createRenderer({ state, dom });

  const audio = createAudioController({
    state,
    dom,
    resizeCanvases: handleResize,
    draw: renderer.draw,
  });

  bindSettings({
    state,
    dom,
    resizeCanvases: handleResize,
    startAudio: audio.startAudio,
    stopAudio: audio.stopAudio,
  });

  // FSK Modem Handlers
  if (dom.btnModemTx) {
    dom.btnModemTx.addEventListener("click", () => {
      if (!state.audioCtx || state.audioCtx.state === "suspended") {
        alert("Please start the microphone or audio first.");
        return;
      }
      const text = dom.modemTxText.value;
      if (!text) return;

      const mode = dom.modemMode.value;
      const speed = dom.modemSpeed ? parseInt(dom.modemSpeed.value, 10) : 20;
      const volDb = dom.modemVol ? parseFloat(dom.modemVol.value) : -12;
      const duration = startTransmission(state, text, mode, volDb, speed);

      dom.btnModemTx.disabled = true;
      dom.btnModemTx.textContent = "Sending...";
      setTimeout(() => {
        dom.btnModemTx.disabled = false;
        dom.btnModemTx.textContent = "Send";
      }, duration * 1000);
    });
  }

  if (dom.btnModemRx) {
    dom.btnModemRx.addEventListener("click", () => {
      state.modemActive = !state.modemActive;
      if (state.modemActive) {
        dom.btnModemRx.textContent = "Stop Rx";
        dom.btnModemRx.classList.add("active");
        dom.modemStatus.style.display = "block";
        state.modemMode = dom.modemMode.value;
        state.modemBaudRate = dom.modemSpeed
          ? parseInt(dom.modemSpeed.value, 10)
          : 20;
      } else {
        dom.btnModemRx.textContent = "Start Rx";
        dom.btnModemRx.classList.remove("active");
        dom.modemStatus.style.display = "none";
      }
    });

    // Check FFT size changes
    dom.fftSizeSelect?.addEventListener("change", () => {
      if (state.modemActive) {
        // Warning no longer needed since we use dedicated modemAnalyser
      }
    });
  }

  if (dom.btnModemClear) {
    dom.btnModemClear.addEventListener("click", () => {
      state.modemRxBuffer = "";
      dom.modemRxLog.value = "";
    });
  }

  if (dom.modemVol) {
    dom.modemVol.addEventListener("input", () => {
      if (dom.modemVolVal) {
        dom.modemVolVal.textContent = dom.modemVol.value;
      }
    });
  }

  if (dom.btnSpecDraw) {
    dom.btnSpecDraw.addEventListener("click", async () => {
      if (!state.audioCtx) {
        alert("Please start the microphone or audio first.");
        return;
      }

      // Ensure context is not blocked (ChromeOS/mobile tight audio policy)
      if (state.audioCtx.state === "suspended") {
        await state.audioCtx.resume();
      }

      const text = dom.specDrawText?.value;
      if (!text) return;

      dom.btnSpecDraw.disabled = true;
      dom.btnSpecDraw.textContent = "Generating...";

      // Yield briefly to let the browser actually render the button update
      await new Promise((r) => setTimeout(r, 10));

      try {
        const colDuration = dom.specDrawSpeed
          ? parseFloat(dom.specDrawSpeed.value)
          : 0.05;
        const { buffer, duration } = await drawTextToAudioBuffer(
          state.audioCtx,
          text,
          colDuration,
        );

        const source = state.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioCtx.destination);
        source.start();

        dom.btnSpecDraw.textContent = "Playing...";
        setTimeout(() => {
          dom.btnSpecDraw.disabled = false;
          dom.btnSpecDraw.textContent = "Play";
        }, duration * 1000);
      } catch (err) {
        console.error(err);
        dom.btnSpecDraw.disabled = false;
        dom.btnSpecDraw.textContent = "Play";
        alert("Failed to generate audio.");
      }
    });
  }

  if (dom.btnBenchmark) {
    dom.btnBenchmark.addEventListener("click", () => {
      state.isBenchmarking = true;
      dom.btnBenchmark.textContent = "Running...";
      dom.btnBenchmark.disabled = true;

      setTimeout(() => {
        let maxFrames = 1000;
        let t0 = performance.now();
        for (let i = 0; i < maxFrames; i++) {
          renderer.draw(performance.now(), true); // Force bypass rate limit
        }
        let t1 = performance.now();

        state.isBenchmarking = false;
        dom.btnBenchmark.textContent = "Benchmark";
        dom.btnBenchmark.disabled = false;

        let avg = (t1 - t0) / maxFrames;
        let estimatedFps = Math.floor(1000 / avg);

        let interpretation = "";
        if (avg < 4) {
          interpretation =
            "Status: Excellent.\nThis device is very powerful and can run the application flawlessly at high refresh rates without any lag.";
        } else if (avg < 8) {
          interpretation =
            "Status: Great.\nThis device can easily maintain a smooth 60 FPS experience.";
        } else if (avg < 15) {
          interpretation =
            "Status: Good.\nThis device can manage 60 FPS, but might occasionally drop frames under heavy continuous load.";
        } else {
          interpretation =
            "Status: Suboptimal.\nThis device may struggle to maintain a smooth framerate. Consider reducing the visualizer complexity if you experience lag.";
        }

        alert(
          `Benchmark completed:\nRendered ${maxFrames} frames synchronously.\nAverage execution time: ${avg.toFixed(3)} ms per frame.\nEstimated Max FPS: ${estimatedFps}\n\n${interpretation}`,
        );
      }, 100); // give UI time to update button text
    });
  }

  dom.btnMic.addEventListener("click", async () => {
    if (state.isRunning) {
      audio.stopAudio();
    } else {
      await audio.startAudio();
    }
  });

  window.addEventListener("resize", handleResize);

  const dropZone = document.getElementById("drop-zone");
  const dragBody = document.body;
  dragBody.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (dropZone) dropZone.style.display = "flex";
  });

  dragBody.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (e.relatedTarget === null) {
      if (dropZone) dropZone.style.display = "none";
    }
  });

  const bodyEl = document.body;
  bodyEl.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dropZone) dropZone.style.display = "none";
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const validExtensions = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"];
      const extension = file.name
        .substring(file.name.lastIndexOf("."))
        .toLowerCase();

      if (
        file.type.startsWith("audio/") ||
        file.type.startsWith("video/") ||
        validExtensions.includes(extension)
      ) {
        audio.startAudioFromFile(file);
      } else {
        alert(
          "Please drop a valid audio file (e.g. .wav or .mp3, .flac, .m4a)",
        );
      }
    }
  });

  // Setup Fullscreen Buttons
  const fsBtns = document.querySelectorAll(".btn-fullscreen");
  console.log("Found fullscreen buttons:", fsBtns.length);

  fsBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = btn.closest(".viz-card");
      if (card) {
        const isFullscreen = card.classList.toggle("fullscreen-card");
        btn.innerHTML = isFullscreen ? "&#x2715;" : "&#x26F6;";

        // Ensure zIndex is applied directly to bypass any css specificity issues
        if (isFullscreen) {
          card.style.position = "fixed";
          card.style.top = "0";
          card.style.left = "0";
          card.style.width = "100vw";
          card.style.height = "100vh";
          card.style.zIndex = "9999";
          card.style.background = "var(--bg-panel)";
          card.style.margin = "0";
          card.style.borderRadius = "0";
          card.style.padding = "1rem";
        } else {
          card.style.position = "";
          card.style.top = "";
          card.style.left = "";
          card.style.width = "";
          card.style.height = "";
          card.style.zIndex = "";
          card.style.background = "";
          card.style.margin = "";
          card.style.borderRadius = "";
          card.style.padding = "";
        }

        setTimeout(handleResize, 50);
      }
    });
  });

  audio.refreshMicrophones();
  handleResize();
}
