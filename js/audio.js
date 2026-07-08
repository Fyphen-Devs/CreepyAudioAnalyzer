export function createAudioController({ state, dom, resizeCanvases, draw }) {
  async function refreshMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.availableMics = devices.filter((d) => d.kind === "audioinput");
      state.availableOutputs = devices.filter((d) => d.kind === "audiooutput");

      const currentVal = dom.micSelect ? dom.micSelect.value : "default";

      if (dom.micSelect) {
        dom.micSelect.innerHTML = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "default";
        defaultOpt.textContent = "Default Device";
        dom.micSelect.appendChild(defaultOpt);

        state.availableMics.forEach((mic, idx) => {
          if (mic.deviceId === "default" || mic.deviceId === "") return;
          const opt = document.createElement("option");
          opt.value = mic.deviceId;
          opt.textContent = mic.label || `Microphone ${idx + 1}`;
          dom.micSelect.appendChild(opt);
        });

        if (
          Array.from(dom.micSelect.options).some((o) => o.value === currentVal)
        ) {
          dom.micSelect.value = currentVal;
        }
      }

      if (dom.outSelect) {
        const currentOutVal = dom.outSelect.value || "default";
        dom.outSelect.innerHTML = "";
        const defaultOutOpt = document.createElement("option");
        defaultOutOpt.value = "default";
        defaultOutOpt.textContent = "Default Device";
        dom.outSelect.appendChild(defaultOutOpt);

        state.availableOutputs.forEach((out, idx) => {
          if (out.deviceId === "default" || out.deviceId === "") return;
          const opt = document.createElement("option");
          opt.value = out.deviceId;
          opt.textContent = out.label || `Speaker ${idx + 1}`;
          dom.outSelect.appendChild(opt);
        });

        if (
          Array.from(dom.outSelect.options).some(
            (o) => o.value === currentOutVal,
          )
        ) {
          dom.outSelect.value = currentOutVal;
        }
      }
    } catch (e) {
      console.log("Could not enumerate devices", e);
    }
  }

  async function startAudio() {
    try {
      const constraints = {
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      };

      if (dom.micSelect && dom.micSelect.value !== "default") {
        constraints.audio.deviceId = dom.micSelect.value;
      }

      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      await refreshMicrophones();

      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Set output sink if supported and selected
      if (
        dom.outSelect &&
        dom.outSelect.value !== "default" &&
        typeof state.audioCtx.setSinkId === "function"
      ) {
        try {
          await state.audioCtx.setSinkId(dom.outSelect.value);
        } catch (e) {
          console.error("Could not set audio output device", e);
        }
      }

      state.analyser = state.audioCtx.createAnalyser();

      state.splitter = state.audioCtx.createChannelSplitter(2);
      state.analyserL = state.audioCtx.createAnalyser();
      state.analyserR = state.audioCtx.createAnalyser();

      state.analyser.fftSize = parseInt(dom.fftSizeSelect.value, 10);
      state.analyserL.fftSize = state.analyser.fftSize;
      state.analyserR.fftSize = state.analyser.fftSize;

      if (state.wasmFft) state.wasmFft.free();
      if (state.WasmFftClass)
        state.wasmFft = new state.WasmFftClass(state.analyser.fftSize);

      state.analyser.smoothingTimeConstant = parseFloat(
        dom.smoothingInput.value,
      );
      state.analyser.minDecibels = parseFloat(dom.minDbInput.value);
      state.analyser.maxDecibels = parseFloat(dom.maxDbInput.value);

      // Create a separate analyser for the audio player
      state.audioPlayerAnalyser = state.audioCtx.createAnalyser();
      state.audioPlayerAnalyser.fftSize = state.analyser.fftSize;
      state.audioPlayerAnalyser.smoothingTimeConstant =
        state.analyser.smoothingTimeConstant;
      state.audioPlayerAnalyser.minDecibels = state.analyser.minDecibels;
      state.audioPlayerAnalyser.maxDecibels = state.analyser.maxDecibels;

      // Equalizer Setup
      const eqBands = [
        { freq: 60, type: "lowshelf" },
        { freq: 170, type: "peaking" },
        { freq: 310, type: "peaking" },
        { freq: 600, type: "peaking" },
        { freq: 1000, type: "peaking" },
        { freq: 3000, type: "peaking" },
        { freq: 6000, type: "peaking" },
        { freq: 12000, type: "highshelf" },
      ];

      state.eqFilters = eqBands.map((band) => {
        const filter = state.audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.gain.value = 0;
        return filter;
      });

      // Connect EQ filters in series
      for (let i = 0; i < state.eqFilters.length - 1; i++) {
        state.eqFilters[i].connect(state.eqFilters[i + 1]);
      }

      // Connect audioPlayer (bmp-audio) to audioPlayerAnalyser
      if (!state.audioPlayerSource && dom.bmpAudio) {
        state.audioPlayerSource = state.audioCtx.createMediaElementSource(
          dom.bmpAudio,
        );
      }
      if (state.audioPlayerSource) {
        state.audioPlayerSource.disconnect();
        // Source -> EQ[0] -> ... -> EQ[n] -> Analyser -> Destination
        state.audioPlayerSource.connect(state.eqFilters[0]);
        state.eqFilters[state.eqFilters.length - 1].connect(
          state.audioPlayerAnalyser,
        );
        state.audioPlayerAnalyser.connect(state.audioCtx.destination);
      }

      // Dedicated FSK Modem analyzer (fast and low res avoids smoothing issues)
      state.modemAnalyser = state.audioCtx.createAnalyser();
      state.modemAnalyser.fftSize = 2048; // Increased from 1024 for narrower frequency bins (better SNR for high pitches)
      state.modemAnalyser.smoothingTimeConstant = 0.0; // Essential for fast FSK!
      state.modemAnalyser.minDecibels = -120; // Lower noise floor visibility
      state.modemAnalyser.maxDecibels = 0;

      state.source = state.audioCtx.createMediaStreamSource(state.stream);

      state.micGainNode = state.audioCtx.createGain();
      const initialDb = dom.micGain ? parseFloat(dom.micGain.value) : 0;
      state.micGainNode.gain.value = Math.pow(10, initialDb / 20);

      state.source.connect(state.micGainNode);

      // Solo (Bandpass Filter) Setup
      state.bandpassFilter = state.audioCtx.createBiquadFilter();
      state.bandpassFilter.type = "bandpass";
      state.bandpassFilter.Q.value = 1;

      state.soloGain = state.audioCtx.createGain();
      state.soloGain.gain.value = 0; // Muted by default

      state.micGainNode.connect(state.bandpassFilter);
      state.bandpassFilter.connect(state.soloGain);
      state.soloGain.connect(state.audioCtx.destination);

      state.micGainNode.connect(state.analyser);
      state.micGainNode.connect(state.modemAnalyser);
      state.micGainNode.connect(state.splitter);
      state.splitter.connect(state.analyserL, 0);

      let channelCount = 1;
      if (state.stream && state.stream.getAudioTracks().length > 0) {
        const settings = state.stream.getAudioTracks()[0].getSettings();
        channelCount = settings.channelCount || 1;
      }

      if (channelCount > 1) {
        state.splitter.connect(state.analyserR, 1);
      } else {
        state.splitter.connect(state.analyserR, 0);
      }

      state.isRunning = true;
      dom.btnMic.textContent = "Stop Microphone";
      dom.btnMic.classList.add("active");
      dom.statusText.textContent = "Online";

      if (state.stream && state.stream.getAudioTracks().length > 0) {
        const track = state.stream.getAudioTracks()[0];
        const settings = track.getSettings();
        dom.channelsText.textContent = settings.channelCount || "--";
        dom.deviceNameText.textContent = track.label || "Default Device";
      }

      dom.statusText.className = "status-online";
      dom.sampleRateText.textContent = state.audioCtx.sampleRate;

      if (state.updateToneGenerator) state.updateToneGenerator(state, dom);

      // Expose EQ control globally for bottomPlayer.js
      window.audioController = {
        updateEqGain: (index, gainDb) => {
          if (state.eqFilters && state.eqFilters[index]) {
            state.eqFilters[index].gain.setTargetAtTime(
              gainDb,
              state.audioCtx.currentTime,
              0.01,
            );
          }
        },
        autoOptimizeEq: async () => {
          if (!state.audioPlayerAnalyser || !state.eqFilters) return null;

          const fftSize = state.audioPlayerAnalyser.fftSize;
          const sampleRate = state.audioCtx.sampleRate;
          const dataArray = new Float32Array(fftSize / 2);
          const bandFreqs = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
          const samples = [];
          const sampleCount = 10;

          // Collect samples over a short period
          for (let i = 0; i < sampleCount; i++) {
            state.audioPlayerAnalyser.getFloatFrequencyData(dataArray);
            samples.push(new Float32Array(dataArray));
            await new Promise((r) => setTimeout(r, 50));
          }

          // Calculate average energy per band
          const bandAverages = bandFreqs.map((freq) => {
            const bin = Math.round((freq * fftSize) / sampleRate);
            const binIdx = Math.max(0, Math.min(bin, dataArray.length - 1));
            let sum = 0;
            samples.forEach((s) => (sum += s[binIdx]));
            return sum / sampleCount;
          });

          const overallAvg =
            bandAverages.reduce((a, b) => a + b, 0) / bandAverages.length;

          // Calculate required gain to flatten the spectrum (roughly)
          // Target: bandAvg + gain = overallAvg => gain = overallAvg - bandAvg
          const suggestedGains = bandAverages.map((avg) => {
            const gain = overallAvg - avg;
            return Math.max(-12, Math.min(12, gain));
          });

          return suggestedGains;
        },
      };

      resizeCanvases();
      draw();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert(
        "Could not access microphone automatically. Please check your browser permissions.",
      );
    }
  }

  async function startAudioFromFile(file) {
    try {
      if (state.isRunning) {
        await stopAudio();
      }

      // Revoke previous file URL if exists
      if (state.audioFileUrl) {
        URL.revokeObjectURL(state.audioFileUrl);
      }

      const fileUrl = URL.createObjectURL(file);
      state.audioFileUrl = fileUrl;
      let audioPlayer = document.getElementById("audio-player");
      if (audioPlayer) {
        // Recreate the audio element to bypass 'already connected' error on subsequent files
        const newPlayer = document.createElement("audio");
        newPlayer.id = "audio-player";
        newPlayer.controls = true;
        newPlayer.style = audioPlayer.getAttribute("style");
        audioPlayer.parentNode.replaceChild(newPlayer, audioPlayer);
        audioPlayer = newPlayer;

        audioPlayer.src = fileUrl;
        audioPlayer.style.display = "block";
        audioPlayer.onplay = () => {
          if (state.audioCtx && state.audioCtx.state === "suspended") {
            state.audioCtx.resume();
          }
        };
      }

      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      if (
        dom.outSelect &&
        dom.outSelect.value !== "default" &&
        typeof state.audioCtx.setSinkId === "function"
      ) {
        try {
          await state.audioCtx.setSinkId(dom.outSelect.value);
        } catch (e) {
          console.error("Could not set audio output device", e);
        }
      }

      state.analyser = state.audioCtx.createAnalyser();
      state.splitter = state.audioCtx.createChannelSplitter(2);
      state.analyserL = state.audioCtx.createAnalyser();
      state.analyserR = state.audioCtx.createAnalyser();

      state.analyser.fftSize = parseInt(dom.fftSizeSelect.value, 10);
      state.analyserL.fftSize = state.analyser.fftSize;
      state.analyserR.fftSize = state.analyser.fftSize;

      state.analyser.smoothingTimeConstant = parseFloat(
        dom.smoothingInput.value,
      );
      state.analyser.minDecibels = parseFloat(dom.minDbInput.value);
      state.analyser.maxDecibels = parseFloat(dom.maxDbInput.value);

      // Dedicated FSK Modem analyzer
      state.modemAnalyser = state.audioCtx.createAnalyser();
      state.modemAnalyser.fftSize = 1024;
      state.modemAnalyser.smoothingTimeConstant = 0.0;
      state.modemAnalyser.minDecibels = -100;
      state.modemAnalyser.maxDecibels = 0;

      state.source = state.audioCtx.createMediaElementSource(audioPlayer);

      state.micGainNode = state.audioCtx.createGain();
      const initialDb = dom.micGain ? parseFloat(dom.micGain.value) : 0;
      state.micGainNode.gain.value = Math.pow(10, initialDb / 20);

      state.source.connect(state.micGainNode);

      state.bandpassFilter = state.audioCtx.createBiquadFilter();
      state.bandpassFilter.type = "bandpass";
      state.bandpassFilter.Q.value = 1;

      state.soloGain = state.audioCtx.createGain();
      state.soloGain.gain.value = 0;

      state.micGainNode.connect(state.bandpassFilter);
      state.bandpassFilter.connect(state.soloGain);
      state.soloGain.connect(state.audioCtx.destination);

      state.micGainNode.connect(state.analyser);
      state.micGainNode.connect(state.modemAnalyser);
      state.micGainNode.connect(state.splitter);
      state.splitter.connect(state.analyserL, 0);
      state.splitter.connect(state.analyserR, 1);

      // Playback source directly connected to destination
      state.micGainNode.connect(state.audioCtx.destination);

      state.isRunning = true;
      dom.btnMic.textContent = "Stop Microphone (File Playing)";
      dom.btnMic.classList.add("active");
      dom.statusText.textContent = "Online - File: " + file.name;
      dom.statusText.className = "status-online";
      dom.sampleRateText.textContent = state.audioCtx.sampleRate;
      dom.channelsText.textContent = "2 (File)";
      dom.deviceNameText.textContent = "File: " + file.name;

      if (state.updateToneGenerator) state.updateToneGenerator(state, dom);

      resizeCanvases();
      draw();
      audioPlayer.play();
    } catch (err) {
      console.error("Error playing audio file:", err);
      alert("Could not play the dropped audio file.");
    }
  }

  async function stopAudio() {
    const audioPlayer = document.getElementById("audio-player");
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = "";
      audioPlayer.style.display = "none";
    }

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }

    if (state.audioCtx) {
      if (state.toneOsc) {
        try {
          state.toneOsc.stop();
        } catch (e) {}
        state.toneOsc.disconnect();
        state.toneOsc = null;
      }
      await state.audioCtx.close();
      state.audioCtx = null;
    }

    dom.channelsText.textContent = "--";
    dom.deviceNameText.textContent = "--";
    state.isRunning = false;

    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }

    dom.btnMic.textContent = "Start Microphone";
    dom.btnMic.classList.remove("active");
    dom.statusText.textContent = "Offline";
    dom.statusText.className = "status-offline";
    dom.sampleRateText.textContent = "--";

    const wSpec = dom.canvasSpectrum.width / (window.devicePixelRatio || 1);
    const hSpec = dom.canvasSpectrum.height / (window.devicePixelRatio || 1);

    // Clear WebGL
    const gl = dom.ctxSpectrum;
    if (gl) {
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    // Clear Overlay
    if (dom.ctxSpectrumOverlay) {
      dom.ctxSpectrumOverlay.clearRect(0, 0, wSpec, hSpec);
    }

    const wWave = dom.canvasWaveform.width / (window.devicePixelRatio || 1);
    const hWave = dom.canvasWaveform.height / (window.devicePixelRatio || 1);
    if (dom.ctxWaveform.clearColor) {
      dom.ctxWaveform.clearColor(0.0, 0.0, 0.0, 0.0);
      dom.ctxWaveform.clear(dom.ctxWaveform.COLOR_BUFFER_BIT);
    } else if (dom.ctxWaveform.clearRect) {
      dom.ctxWaveform.clearRect(0, 0, wWave, hWave);
    }

    if (dom.ctxVectorscope) {
      if (dom.ctxVectorscope.clearColor) {
        dom.ctxVectorscope.clearColor(10 / 255, 15 / 255, 20 / 255, 0.2);
        dom.ctxVectorscope.clear(dom.ctxVectorscope.COLOR_BUFFER_BIT);
      } else if (dom.ctxVectorscope.clearRect) {
        const wVec =
          dom.canvasVectorscope.width / (window.devicePixelRatio || 1);
        const hVec =
          dom.canvasVectorscope.height / (window.devicePixelRatio || 1);
        dom.ctxVectorscope.clearRect(0, 0, wVec, hVec);
      }
    }

    dom.peakFill.style.width = "0%";
    dom.peakValue.textContent = "-\u221E dB";
    dom.peakValue.style.color = "var(--text-muted)";
  }

  state.updateToneGenerator = (s, d) => {
    if (!s.audioCtx) return;

    if (s.toneEnabled) {
      // Need to re-create if switching between noise (BufferSource) and oscillator
      let type = d.toneType.value || "sine";
      let isNoise = type === "white" || type === "pink";
      let currentIsNoise = s.toneOsc && !s.toneOsc.frequency;

      if (s.toneOsc && isNoise !== currentIsNoise) {
        try {
          s.toneOsc.stop();
        } catch (e) {}
        s.toneOsc.disconnect();
        s.toneOsc = null;
      }

      if (!s.toneOsc) {
        s.toneGain = s.audioCtx.createGain();
        s.tonePan = s.audioCtx.createStereoPanner();
        s.tonePan.connect(s.toneGain);
        s.toneGain.connect(s.audioCtx.destination);

        if (isNoise) {
          const bufferSize = 2 * s.audioCtx.sampleRate; // 2 seconds
          const noiseBuffer = s.audioCtx.createBuffer(
            1,
            bufferSize,
            s.audioCtx.sampleRate,
          );
          const output = noiseBuffer.getChannelData(0);

          if (type === "white") {
            for (let i = 0; i < bufferSize; i++) {
              output[i] = Math.random() * 2 - 1;
            }
          } else {
            // Simplified Pink Noise
            let b0 = 0,
              b1 = 0,
              b2 = 0,
              b3 = 0,
              b4 = 0,
              b5 = 0,
              b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
              let white = Math.random() * 2 - 1;
              b0 = 0.99886 * b0 + white * 0.0555179;
              b1 = 0.99332 * b1 + white * 0.0750759;
              b2 = 0.969 * b2 + white * 0.153852;
              b3 = 0.8665 * b3 + white * 0.3104856;
              b4 = 0.55 * b4 + white * 0.5329522;
              b5 = -0.7616 * b5 - white * 0.016898;
              output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
              output[i] *= 0.11; // gain compensation
              b6 = white * 0.115926;
            }
          }

          s.toneOsc = s.audioCtx.createBufferSource();
          s.toneOsc.buffer = noiseBuffer;
          s.toneOsc.loop = true;
          s.toneOsc.connect(s.tonePan);
          s.toneOsc.start();
        } else {
          s.toneOsc = s.audioCtx.createOscillator();
          s.toneOsc.connect(s.tonePan);
          s.toneOsc.frequency.value = parseFloat(d.toneFreq.value);
          s.toneOsc.start();
        }
      }

      if (s.toneOsc.frequency) {
        if (type === "sweep") {
          s.toneOsc.type = "sine";
          // Start 3-second sweep
          const now = s.audioCtx.currentTime;
          s.toneOsc.frequency.cancelScheduledValues(now);
          s.toneOsc.frequency.setValueAtTime(20, now);
          s.toneOsc.frequency.exponentialRampToValueAtTime(20000, now + 3);

          if (!s.sweepInterval) {
            s.sweepInterval = setInterval(() => {
              const t = s.audioCtx.currentTime;
              if (!s.toneOsc || !s.toneOsc.frequency) return;
              s.toneOsc.frequency.cancelScheduledValues(t);
              s.toneOsc.frequency.setValueAtTime(20, t);
              s.toneOsc.frequency.exponentialRampToValueAtTime(20000, t + 3);
            }, 3500);
          }
        } else {
          s.toneOsc.type = type;
          if (s.sweepInterval) {
            clearInterval(s.sweepInterval);
            s.sweepInterval = null;
          }
          s.toneOsc.frequency.cancelScheduledValues(s.audioCtx.currentTime);
          s.toneOsc.frequency.setTargetAtTime(
            parseFloat(d.toneFreq.value),
            s.audioCtx.currentTime,
            0.05,
          );
        }
      }

      let panVal = parseFloat(d.tonePan.value);
      s.tonePan.pan.setTargetAtTime(panVal, s.audioCtx.currentTime, 0.05);

      let db = parseFloat(d.toneVol.value);
      let linearGain = Math.pow(10, db / 20);
      s.toneGain.gain.setTargetAtTime(linearGain, s.audioCtx.currentTime, 0.05);
    } else {
      if (s.toneOsc) {
        if (s.sweepInterval) {
          clearInterval(s.sweepInterval);
          s.sweepInterval = null;
        }
        try {
          s.toneOsc.stop();
        } catch (e) {}
        s.toneOsc.disconnect();
        if (s.toneGain) s.toneGain.disconnect();
        if (s.tonePan) s.tonePan.disconnect();
        s.toneOsc = null;
        s.toneGain = null;
        s.tonePan = null;
      }
    }
  };

  return {
    refreshMicrophones,
    startAudio,
    startAudioFromFile,
    stopAudio,
  };
}
