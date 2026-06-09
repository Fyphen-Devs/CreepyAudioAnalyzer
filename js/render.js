import { drawSpectrum } from "./render/spectrum.js";
import { drawWaveformAndMeter } from "./render/waveformMeter.js";
import { drawSpectrogram } from "./render/spectrogram.js";
import { drawVectorscope } from "./render/vectorscope.js";
import { demodulateFrame } from "./modem.js";
import {
  ensureAudioPlayerBuffers,
  processAudioPlayerWasmFft,
  pullAudioPlayerAnalyserData,
  buildAudioPlayerFrame,
  drawAudioSpectrum,
} from "./render/audioSpectrum.js";

function buildFrameData({ state, dom }) {
  const {
    wSpec,
    hSpec,
    wWave,
    hWave,
    freqMinLog,
    freqMaxLog,
    useLogScale,
    updateRateFps,
    meteringStandard,
    specMode,
    specTheme,
    peakCount,
  } = state.config;

  const bufferLength = state.analyser.frequencyBinCount;
  if (!state.freqDataBuffer || state.freqDataBuffer.length !== bufferLength) {
    state.freqDataBuffer = new Float32Array(bufferLength);
  }
  const freqData = state.freqDataBuffer;

  if (
    !state.timeDataBuffer ||
    state.timeDataBuffer.length !== state.analyser.fftSize
  ) {
    state.timeDataBuffer = new Float32Array(state.analyser.fftSize);
  }
  const timeData = state.timeDataBuffer;

  // buffers for audio player
  ensureAudioPlayerBuffers(state, bufferLength);

  const audioPlayerFreqData = state.audioPlayerFreqDataBuffer;
  const audioPlayerTimeData = state.audioPlayerTimeDataBuffer;

  if (!state.isFrozen) {
    if (state.wasmFft) {
      // timeDataを取得してWASMのFFTにかける
      state.analyser.getFloatTimeDomainData(timeData);
      state.wasmFft.set_input(timeData);
      state.wasmFft.process();

      // WASMのメモリからマグニチュードとフェーズを取得
      const magnitudePtr = state.wasmFft.magnitude_ptr();
      const phasePtr = state.wasmFft.phase_ptr();

      // Check if WASM memory buffer has changed (reallocated)
      const wasmBuffer = state.wasmMemory.buffer;
      if (
        !state.wasmMagBuf ||
        state.wasmMagBuf.buffer !== wasmBuffer ||
        state.wasmMagBuf.length !== timeData.length
      ) {
        state.wasmMagBuf = new Float32Array(
          wasmBuffer,
          magnitudePtr,
          timeData.length,
        );
        state.wasmPhaseBuf = new Float32Array(
          wasmBuffer,
          phasePtr,
          timeData.length,
        );
      } else {
        // Re-create views with correct offsets if pointers changed
        state.wasmMagBuf = new Float32Array(
          wasmBuffer,
          magnitudePtr,
          timeData.length,
        );
        state.wasmPhaseBuf = new Float32Array(
          wasmBuffer,
          phasePtr,
          timeData.length,
        );
      }

      const wasmMagBuf = state.wasmMagBuf;
      const wasmPhaseBuf = state.wasmPhaseBuf;

      if (!state.micWasmMag || state.micWasmMag.length !== wasmMagBuf.length) {
        state.micWasmMag = new Float32Array(wasmMagBuf.length);
        state.micWasmPhase = new Float32Array(wasmPhaseBuf.length);
      }

      // copy mic data for coherence calculation later
      if (state.micWasmMag) {
        state.micWasmMag.set(wasmMagBuf);
        state.micWasmPhase.set(wasmPhaseBuf);
      }

      const alpha = state.analyser.smoothingTimeConstant;
      const N = timeData.length;

      for (let i = 0; i < freqData.length; i++) {
        // Nで割って正規化 (窓関数のゲイン補正も含むとベターだが、ここでは簡易的にNのみ)
        let mag = wasmMagBuf[i] / N;
        if (mag < 1e-10) mag = 1e-10;

        let db = 20 * Math.log10(mag);

        // スムージング処理 (前回の値とブレンド)
        if (freqData[i] === undefined || !isFinite(freqData[i])) {
          freqData[i] = db;
        } else {
          freqData[i] = alpha * freqData[i] + (1 - alpha) * db;
        }
      }

      processAudioPlayerWasmFft(state, { N, alpha });

      // ※位相同期などの高度な処理（Vectorscope等）は wasmPhaseBuf を利用
    } else {
      state.analyser.getFloatFrequencyData(freqData);
      state.analyser.getFloatTimeDomainData(timeData);
    }
    if (
      state.audioPlayerAnalyser &&
      audioPlayerFreqData &&
      audioPlayerTimeData
    ) {
      state.audioPlayerAnalyser.getFloatFrequencyData(audioPlayerFreqData);
      state.audioPlayerAnalyser.getFloatTimeDomainData(audioPlayerTimeData);
    }
  }

  const minDb = state.analyser.minDecibels;
  const maxDb = state.analyser.maxDecibels;
  const dbRange = maxDb - minDb;

  const hzPerBin = state.audioCtx
    ? state.audioCtx.sampleRate / 2 / bufferLength
    : 22050 / bufferLength;

  let maxAllowed = state.audioCtx ? state.audioCtx.sampleRate / 2 : 24000;
  let currentMaxFreqLog = freqMaxLog > maxAllowed ? maxAllowed : freqMaxLog;

  const logMaxMinRatio = Math.log10(currentMaxFreqLog / freqMinLog);
  const logMinFreq = Math.log10(freqMinLog);
  const linearRange = currentMaxFreqLog - freqMinLog;
  const hzPerBinClamped = Math.max(1, hzPerBin);

  let linearBarWidthActual = 1;

  if (wSpec > 0) {
    const linearBarWidth = wSpec / (linearRange / hzPerBin);
    linearBarWidthActual =
      linearBarWidth > 2 ? linearBarWidth - 1 : linearBarWidth;
  }

  let wAudioSpec = 0;
  let hAudioSpec = 0;
  if (dom.canvasAudioSpectrum) {
    const dpr = window.devicePixelRatio || 1;
    wAudioSpec = dom.canvasAudioSpectrum.width / dpr || 0;
    hAudioSpec = dom.canvasAudioSpectrum.height / dpr || 0;
  }

  return {
    wSpec,
    hSpec,
    wWave,
    hWave,
    bufferLength,
    freqData,
    timeData,
    minDb,
    maxDb,
    dbRange,
    useLogScale,
    hzPerBin,
    minFreqLog: freqMinLog,
    maxFreqLog: currentMaxFreqLog,
    logMaxMinRatio,
    logMinFreq,
    linearRange,
    hzPerBinClamped,
    linearBarWidthActual,
    audioPlayerFrame: {
      wSpec: wAudioSpec,
      hSpec: hAudioSpec,
      wWave,
      hWave,
      bufferLength,
      freqData: audioPlayerFreqData,
      timeData: audioPlayerTimeData,
      minDb,
      maxDb,
      dbRange,
      useLogScale,
      hzPerBin,
      minFreqLog: freqMinLog,
      maxFreqLog: currentMaxFreqLog,
      logMaxMinRatio,
      logMinFreq,
      linearRange,
      hzPerBinClamped,
      linearBarWidthActual,
      coherenceData: state.coherenceData,
    },
  };
}

function processCalibration(state, dom, freqData) {
  if (!state.isCalibrating) return;

  const framesToCalibrate = 60; // 1 second roughly at 60fps
  const bufferLength = state.analyser.frequencyBinCount;

  // Accumulate
  for (let i = 0; i < bufferLength; i++) {
    // Math.pow(10, db/10) to average in linear power scale might be better,
    // but averaging Db directly is often used for a visual noise floor.
    state.calibrationBuffer[i] += freqData[i];
  }

  state.calibrationFrames++;

  if (state.calibrationFrames >= framesToCalibrate) {
    state.isCalibrating = false;
    state.noiseProfile = new Float32Array(bufferLength);
    let totalDb = 0;

    for (let i = 0; i < bufferLength; i++) {
      state.noiseProfile[i] = state.calibrationBuffer[i] / framesToCalibrate;
      totalDb += state.noiseProfile[i];
    }

    state.noiseStats.avgDb = totalDb / bufferLength;

    // Simple profile analysis
    let type = "Unknown";
    // Calculate slopes
    let lowEnergy = 0,
      midEnergy = 0,
      highEnergy = 0;
    const third = Math.floor(bufferLength / 3);
    for (let i = 0; i < third; i++) lowEnergy += state.noiseProfile[i];
    for (let i = third; i < third * 2; i++) midEnergy += state.noiseProfile[i];
    for (let i = third * 2; i < bufferLength; i++)
      highEnergy += state.noiseProfile[i];

    lowEnergy /= third;
    midEnergy /= third;
    highEnergy /= bufferLength - 2 * third;

    if (lowEnergy > midEnergy + 5 && midEnergy > highEnergy + 5) {
      type = "Pink / Brown or Mech. Hum";
    } else if (
      Math.abs(lowEnergy - midEnergy) < 5 &&
      Math.abs(midEnergy - highEnergy) < 5
    ) {
      type = "White / Flat";
    } else if (lowEnergy > midEnergy + 10) {
      type = "Low Frequency / Mains Hum";
    } else {
      type = "Complex Environmental";
    }

    state.noiseStats.profileType = type;

    if (dom.btnCalibrate) {
      dom.btnCalibrate.textContent = "Calibrate Noise";
      dom.btnCalibrate.disabled = false;
    }
    if (dom.noiseStats) {
      dom.noiseStats.innerHTML = `Profile: Setup<br/>Avg Noise Level: ${state.noiseStats.avgDb.toFixed(1)} dB<br/>Type: ${type}`;
    }
  }
}

export function createRenderer({ state, dom }) {
  function draw(timestamp = 0, force = false) {
    if (!force && !state.isRunning) return;
    if (!force) {
      state.animationId = requestAnimationFrame(() =>
        draw(performance.now(), false),
      );
    }

    if (!force) {
      state.fpsFrameCount++;
      if (timestamp - state.lastFpsTime >= 1000) {
        if (dom.fpsDisplay) {
          dom.fpsDisplay.textContent = `${state.fpsFrameCount} FPS`;
        }
        state.fpsFrameCount = 0;
        state.lastFpsTime = timestamp;
      }

      const fpsThreshold = 1000 / (state.config.updateRateFps || 60);
      if (timestamp - state.lastDrawTime < fpsThreshold) return;
      state.lastDrawTime = timestamp;
    }

    if (!state.analyser || !dom.ctxSpectrum || !dom.ctxWaveform) return;

    let t0 = performance.now();

    const frame = buildFrameData({ state, dom });

    if (!state.isFrozen && state.isCalibrating) {
      processCalibration(state, dom, frame.freqData);
    }

    const fsaChecked = document.getElementById("toggle-fsa")?.checked;
    const audioFsaChecked =
      document.getElementById("toggle-audio-fsa")?.checked;
    const spectrogramChecked =
      document.getElementById("toggle-spectrogram")?.checked;
    const oscilloscopeChecked = document.getElementById(
      "toggle-oscilloscope",
    )?.checked;
    const vectorscopeChecked =
      document.getElementById("toggle-vectorscope")?.checked;

    if (fsaChecked) {
      document.getElementById("card-fsa").style.display = "flex";
      drawSpectrum({ state, dom, frame });
    } else {
      document.getElementById("card-fsa").style.display = "none";
    }

    if (audioFsaChecked) {
      document.getElementById("card-audio-fsa").style.display = "flex";
      if (state.audioPlayerAnalyser) {
        drawSpectrum({ state, dom, frame }, true);
      }
    } else {
      document.getElementById("card-audio-fsa").style.display = "none";
    }

    if (spectrogramChecked) {
      document.getElementById("card-spectrogram").style.display = "flex";
      drawSpectrogram({ dom, frame, state });
    } else {
      document.getElementById("card-spectrogram").style.display = "none";
    }

    if (oscilloscopeChecked) {
      document.getElementById("card-oscilloscope").style.display = "flex";
      drawWaveformAndMeter({ state, dom, frame });
    } else {
      document.getElementById("card-oscilloscope").style.display = "none";
    }

    if (vectorscopeChecked) {
      document.getElementById("card-vectorscope").style.display = "flex";
      drawVectorscope({ state, dom });
    } else {
      document.getElementById("card-vectorscope").style.display = "none";
    }

    if (state.modemActive && state.modemAnalyser) {
      demodulateFrame(state, dom, timestamp);
    }

    let t1 = performance.now();
    let ms = t1 - t0;

    // Average rendering time
    if (!force && dom.renderTimeDisplay) {
      state.renderTimes.push(ms);
      if (state.renderTimes.length > 60) state.renderTimes.shift();
      if (state.fpsFrameCount % 10 === 0) {
        // update display every 10 frames
        let avg =
          state.renderTimes.reduce((a, b) => a + b, 0) /
          state.renderTimes.length;
        dom.renderTimeDisplay.textContent = `Render: ${avg.toFixed(2)} ms`;
        if (avg < 8) dom.renderTimeDisplay.style.color = "#4ade80";
        else if (avg < 16) dom.renderTimeDisplay.style.color = "#facc15";
        else dom.renderTimeDisplay.style.color = "#f87171";
      }
    }
  }

  return { draw };
}
