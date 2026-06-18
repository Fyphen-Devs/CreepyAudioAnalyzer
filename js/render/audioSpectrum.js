const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FS_SOURCE = `
precision mediump float;
varying vec2 v_uv;

uniform sampler2D u_dataTex;
uniform int u_bufferLength;
uniform int u_useLogScale;
uniform float u_minFreqLog;
uniform float u_maxFreqLog;
uniform float u_logMinFreq;
uniform float u_logMaxMinRatio;
uniform float u_linearRange;
uniform float u_hzPerBin;

void main() {
    float freqIndex;
    if (u_useLogScale == 1) {
        float freq = pow(10.0, v_uv.x * u_logMaxMinRatio + u_logMinFreq);
        freqIndex = freq / u_hzPerBin;
    } else {
        float freq = u_minFreqLog + v_uv.x * u_linearRange;
        freqIndex = freq / u_hzPerBin;
    }

    if (freqIndex < 0.0 || freqIndex >= float(u_bufferLength)) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float texX = (freqIndex + 0.5) / float(u_bufferLength);
    float dataVal = texture2D(u_dataTex, vec2(texX, 0.5)).r;

    if (v_uv.y <= dataVal) {
        gl_FragColor = vec4(0.886, 0.910, 0.941, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader Err:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initWebGL(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program Err:", gl.getProgramInfoLog(program));
    return null;
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  return { program, positionBuffer };
}

const webglStateMap = new Map();
const currentU8DataMap = new Map();

function setupWebGL(gl) {
  const result = initWebGL(gl);
  if (!result) return false;

  const { program, positionBuffer } = result;

  const isWebGL2 = gl instanceof WebGL2RenderingContext;
  const internalFormat = isWebGL2 ? gl.R8 : gl.LUMINANCE;
  const format = isWebGL2 ? gl.RED : gl.LUMINANCE;

  const dataTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dataTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  webglStateMap.set(gl, {
    gl,
    program,
    positionBuffer,
    dataTex,
    uploadedBufferLength: 0,
    internalFormat,
    format,
    locs: {
      a_pos: gl.getAttribLocation(program, "a_position"),
      u_dataTex: gl.getUniformLocation(program, "u_dataTex"),
      u_bufferLength: gl.getUniformLocation(program, "u_bufferLength"),
      u_useLogScale: gl.getUniformLocation(program, "u_useLogScale"),
      u_minFreqLog: gl.getUniformLocation(program, "u_minFreqLog"),
      u_maxFreqLog: gl.getUniformLocation(program, "u_maxFreqLog"),
      u_logMinFreq: gl.getUniformLocation(program, "u_logMinFreq"),
      u_logMaxMinRatio: gl.getUniformLocation(program, "u_logMaxMinRatio"),
      u_linearRange: gl.getUniformLocation(program, "u_linearRange"),
      u_hzPerBin: gl.getUniformLocation(program, "u_hzPerBin"),
    },
  });
  return true;
}

// ===========================================================================
// 1) audioPlayer 用バッファ確保
// ===========================================================================
export function ensureAudioPlayerBuffers(state, bufferLength) {
  if (!state.audioPlayerAnalyser) return;

  if (state.analyser) {
    if (state.audioPlayerAnalyser.fftSize !== state.analyser.fftSize) {
      state.audioPlayerAnalyser.fftSize = state.analyser.fftSize;
    }
    if (
      state.audioPlayerAnalyser.smoothingTimeConstant !==
      state.analyser.smoothingTimeConstant
    ) {
      state.audioPlayerAnalyser.smoothingTimeConstant =
        state.analyser.smoothingTimeConstant;
    }
  }

  if (
    !state.audioPlayerFreqDataBuffer ||
    state.audioPlayerFreqDataBuffer.length !== bufferLength
  ) {
    state.audioPlayerFreqDataBuffer = new Float32Array(bufferLength);
  }
  if (
    !state.audioPlayerTimeDataBuffer ||
    state.audioPlayerTimeDataBuffer.length !== state.audioPlayerAnalyser.fftSize
  ) {
    state.audioPlayerTimeDataBuffer = new Float32Array(
      state.audioPlayerAnalyser.fftSize,
    );
  }
  // coherence 計算用
  if (!state.coherenceData || state.coherenceData.length !== bufferLength) {
    state.coherenceData = new Float32Array(bufferLength);
    state.delayData = new Float32Array(bufferLength);
    state.delay = 0;
  }
}

// ===========================================================================
// 2) WASM FFT 経路 — audioPlayer の magnitude を dB に変換しつつ
//    マイクとの coherence を求める
// ===========================================================================
export function processAudioPlayerWasmFft(state, mic) {
  if (
    !state.audioPlayerAnalyser ||
    !state.audioPlayerTimeDataBuffer ||
    !state.audioPlayerFreqDataBuffer ||
    !state.wasmFft
  ) {
    return;
  }

  const audioPlayerTimeData = state.audioPlayerTimeDataBuffer;
  const audioPlayerFreqData = state.audioPlayerFreqDataBuffer;

  state.audioPlayerAnalyser.getFloatTimeDomainData(audioPlayerTimeData);
  state.wasmFft.set_input(audioPlayerTimeData);
  state.wasmFft.process();

  const apMagPtr = state.wasmFft.magnitude_ptr();
  const apPhasePtr = state.wasmFft.phase_ptr();
  const apWasmMagBuf = new Float32Array(
    state.wasmMemory.buffer,
    apMagPtr,
    audioPlayerTimeData.length,
  );
  const apWasmPhaseBuf = new Float32Array(
    state.wasmMemory.buffer,
    apPhasePtr,
    audioPlayerTimeData.length,
  );
  const apAlpha = state.audioPlayerAnalyser.smoothingTimeConstant;
  const apN = audioPlayerTimeData.length;

  for (let i = 0; i < audioPlayerFreqData.length; i++) {
    let mag = apWasmMagBuf[i] / apN;
    if (mag < 1e-10) mag = 1e-10;
    let db = 20 * Math.log10(mag);

    if (
      audioPlayerFreqData[i] === undefined ||
      !isFinite(audioPlayerFreqData[i])
    ) {
      audioPlayerFreqData[i] = db;
    } else {
      audioPlayerFreqData[i] =
        apAlpha * audioPlayerFreqData[i] + (1 - apAlpha) * db;
    }
  }

  // ---- coherence & delay (WASM) ----
  state.wasmFft.calculate_coherence(
    state.micWasmMag,
    state.micWasmPhase,
    apMagPtr,
    apPhasePtr,
  );

  const cohPtr = state.wasmFft.coherence_ptr();
  const delayDataPtr = state.wasmFft.delay_data_ptr();
  const bufferLength = audioPlayerFreqData.length;
  state.coherenceData.set(
    new Float32Array(state.wasmMemory.buffer, cohPtr, bufferLength),
  );
  state.delayData.set(
    new Float32Array(state.wasmMemory.buffer, delayDataPtr, bufferLength),
  );

  if (state.audioCtx && state.audioPlayerAnalyser) {
    state.delay = state.wasmFft.calculate_delay(state.audioCtx.sampleRate);
  }
}

// ===========================================================================
// 3) AnalyserNode 直接読み (wasmFft 無し時 or 常時補完用)
// ===========================================================================
export function pullAudioPlayerAnalyserData(state) {
  if (
    !state.audioPlayerAnalyser ||
    !state.audioPlayerFreqDataBuffer ||
    !state.audioPlayerTimeDataBuffer
  ) {
    return;
  }
  state.audioPlayerAnalyser.getFloatFrequencyData(
    state.audioPlayerFreqDataBuffer,
  );
  state.audioPlayerAnalyser.getFloatTimeDomainData(
    state.audioPlayerTimeDataBuffer,
  );
}

// ===========================================================================
// 4) drawAudioSpectrum 用フレーム生成
//    baseFrame は render.js 側で計算した共通の周波数軸情報を含むオブジェクト。
// ===========================================================================
export function buildAudioPlayerFrame(state, dom, baseFrame) {
  let wAudioSpec = 0;
  let hAudioSpec = 0;
  if (dom.canvasAudioSpectrum) {
    wAudioSpec = dom.canvasAudioSpectrum.clientWidth || 0;
    hAudioSpec = dom.canvasAudioSpectrum.clientHeight || 0;
  }

  return {
    wSpec: wAudioSpec,
    hSpec: hAudioSpec,
    wWave: baseFrame.wWave,
    hWave: baseFrame.hWave,
    bufferLength: baseFrame.bufferLength,
    freqData: state.audioPlayerFreqDataBuffer,
    timeData: state.audioPlayerTimeDataBuffer,
    minDb: baseFrame.minDb,
    maxDb: baseFrame.maxDb,
    dbRange: baseFrame.dbRange,
    useLogScale: baseFrame.useLogScale,
    hzPerBin: baseFrame.hzPerBin,
    minFreqLog: baseFrame.minFreqLog,
    maxFreqLog: baseFrame.maxFreqLog,
    logMaxMinRatio: baseFrame.logMaxMinRatio,
    logMinFreq: baseFrame.logMinFreq,
    linearRange: baseFrame.linearRange,
    hzPerBinClamped: baseFrame.hzPerBinClamped,
    linearBarWidthActual: baseFrame.linearBarWidthActual,
    coherenceData: state.coherenceData,
  };
}

// ===========================================================================
// 5) 描画本体
// ===========================================================================
export function drawAudioSpectrum({ state, dom, frame }) {
  const gl = dom.ctxAudioSpectrum;
  const ctxOvl = dom.ctxAudioSpectrumOverlay;
  if (!gl || !ctxOvl) return;

  if (!webglStateMap.has(gl)) {
    if (!setupWebGL(gl)) return;
  }
  const ws = webglStateMap.get(gl);

  const dpr = window.devicePixelRatio || 1;
  if (
    gl.canvas.width !== gl.canvas.clientWidth * dpr ||
    gl.canvas.height !== gl.canvas.clientHeight * dpr
  ) {
    gl.canvas.width = gl.canvas.clientWidth * dpr;
    gl.canvas.height = gl.canvas.clientHeight * dpr;
  }
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  if (!currentU8DataMap.has(gl)) {
    currentU8DataMap.set(gl, null);
  }

  const apFrame = frame.audioPlayerFrame || frame;
  const {
    wSpec,
    hSpec,
    bufferLength,
    freqData,
    minDb,
    dbRange,
    useLogScale,
    hzPerBin,
    minFreqLog,
    maxFreqLog,
    logMaxMinRatio,
    logMinFreq,
    linearRange,
    coherenceData,
  } = apFrame;

  if (!freqData || wSpec === 0 || hSpec === 0) return;

  // ---- WebGL: スペクトルバーをテクスチャ経由で描画 ----
  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);

  let currentU8Data = currentU8DataMap.get(gl);
  if (ws.uploadedBufferLength !== bufferLength || !currentU8Data) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      ws.internalFormat,
      bufferLength,
      1,
      0,
      ws.format,
      gl.UNSIGNED_BYTE,
      null,
    );
    ws.uploadedBufferLength = bufferLength;
    currentU8Data = new Uint8Array(bufferLength);
    currentU8DataMap.set(gl, currentU8Data);
  }

  let maxFreqVal = -Infinity;
  let maxFreqIndex = 0;

  for (let i = 0; i < bufferLength; i++) {
    const val = freqData[i];
    if (val > maxFreqVal) {
      maxFreqVal = val;
      maxFreqIndex = i;
    }
    let p = (val - minDb) / dbRange;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    currentU8Data[i] = p * 255;
  }

  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    bufferLength,
    1,
    ws.format,
    gl.UNSIGNED_BYTE,
    currentU8Data,
  );

  gl.useProgram(ws.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);
  gl.uniform1i(ws.locs.u_dataTex, 0);

  gl.uniform1i(ws.locs.u_bufferLength, bufferLength);
  gl.uniform1i(ws.locs.u_useLogScale, useLogScale ? 1 : 0);
  gl.uniform1f(ws.locs.u_minFreqLog, minFreqLog);
  gl.uniform1f(ws.locs.u_maxFreqLog, maxFreqLog);
  gl.uniform1f(ws.locs.u_logMinFreq, logMinFreq);
  gl.uniform1f(ws.locs.u_logMaxMinRatio, logMaxMinRatio);
  gl.uniform1f(ws.locs.u_linearRange, linearRange);
  gl.uniform1f(ws.locs.u_hzPerBin, hzPerBin);

  gl.bindBuffer(gl.ARRAY_BUFFER, ws.positionBuffer);
  gl.enableVertexAttribArray(ws.locs.a_pos);
  gl.vertexAttribPointer(ws.locs.a_pos, 2, gl.FLOAT, false, 0, 0);

  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!state.spectrumView || state.spectrumView === "fft") {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- CPU Overlay ----
  ctxOvl.save();
  ctxOvl.setTransform(1, 0, 0, 1, 0, 0);

  const targetCanvasOvl = dom.canvasAudioSpectrumOverlay;
  // Sync internal resolution to CSS size * DPR to avoid scaling artifacts and coordinate mismatches
  if (
    targetCanvasOvl.width !== targetCanvasOvl.clientWidth * dpr ||
    targetCanvasOvl.height !== targetCanvasOvl.clientHeight * dpr
  ) {
    targetCanvasOvl.width = targetCanvasOvl.clientWidth * dpr;
    targetCanvasOvl.height = targetCanvasOvl.clientHeight * dpr;
  }

  ctxOvl.clearRect(0, 0, targetCanvasOvl.width, targetCanvasOvl.height);
  ctxOvl.scale(dpr, dpr);

  // Update Delay in DOM (roughly every 1 second to avoid flickering)
  const now = performance.now();
  if (
    state.delay !== undefined &&
    dom.audioDelayVal &&
    (!state.lastDelayUpdateTime || now - state.lastDelayUpdateTime > 1000)
  ) {
    dom.audioDelayVal.textContent = (Math.max(0, state.delay) * 1000).toFixed(
      2,
    );
    state.lastDelayUpdateTime = now;
  }

  const peakHoldBufferName = "audioPlayerPeakHoldBuffer";
  if (
    !state[peakHoldBufferName] ||
    state[peakHoldBufferName].length !== bufferLength
  ) {
    state[peakHoldBufferName] = new Float32Array(bufferLength).fill(-200);
  }

  for (let i = 0; i < bufferLength; i++) {
    if (freqData[i] > state[peakHoldBufferName][i]) {
      state[peakHoldBufferName][i] = freqData[i];
    } else if (!state.peakHoldInf) {
      state[peakHoldBufferName][i] -= 0.5;
    }
  }

  // Octave bands
  if (state.spectrumView === "oct13" || state.spectrumView === "oct16") {
    const fraction = state.spectrumView === "oct13" ? 3 : 6;
    const bandStep = Math.pow(2, 1 / fraction);

    let fStart = 20;
    while (fStart < maxFreqLog) {
      let fEnd = fStart * bandStep;
      if (fEnd > maxFreqLog) fEnd = maxFreqLog;

      let binStart = Math.floor(fStart / hzPerBin);
      let binEnd = Math.ceil(fEnd / hzPerBin);

      if (binStart >= bufferLength) break;
      if (binEnd > bufferLength) binEnd = bufferLength;
      if (binStart === binEnd) binEnd = binStart + 1;

      let sumPower = 0;
      for (let i = binStart; i < binEnd; i++) {
        sumPower += Math.pow(10, freqData[i] / 10);
      }
      let avgDb = 10 * Math.log10(sumPower / (binEnd - binStart));
      if (isNaN(avgDb)) avgDb = minDb;

      let _p = (avgDb - minDb) / dbRange;
      if (_p < 0) _p = 0;
      else if (_p > 1) _p = 1;
      let bandH = _p * hSpec;

      let xStart, xEnd;
      if (useLogScale) {
        xStart = (Math.log10(fStart / minFreqLog) / logMaxMinRatio) * wSpec;
        xEnd = (Math.log10(fEnd / minFreqLog) / logMaxMinRatio) * wSpec;
      } else {
        xStart = ((fStart - minFreqLog) / linearRange) * wSpec;
        xEnd = ((fEnd - minFreqLog) / linearRange) * wSpec;
      }

      ctxOvl.fillStyle = "rgba(120, 160, 255, 0.7)";
      ctxOvl.fillRect(
        xStart,
        hSpec - bandH,
        Math.max(1, xEnd - xStart - 1),
        bandH,
      );

      fStart = fEnd;
    }
  }

  // helper: dB 値の配列を曲線として描く
  const drawLine = (dataArray, color, dash = []) => {
    ctxOvl.beginPath();
    ctxOvl.strokeStyle = color;
    ctxOvl.lineWidth = 1.5;
    ctxOvl.setLineDash(dash);

    let freqLog = Math.pow(10, logMinFreq);
    const freqLogMult = Math.pow(10, (2 / wSpec) * logMaxMinRatio);

    for (let x = 0; x < wSpec; x += 2) {
      let freqIndex;
      if (useLogScale) {
        freqIndex = freqLog / hzPerBin;
        freqLog *= freqLogMult;
      } else {
        let pc = x / wSpec;
        let freq = minFreqLog + pc * linearRange;
        freqIndex = freq / hzPerBin;
      }

      if (freqIndex >= 0 && freqIndex < bufferLength) {
        let i0 = Math.floor(freqIndex);
        let val = dataArray[i0];
        let p = (val - minDb) / dbRange;
        if (p < 0) p = 0;
        else if (p > 1) p = 1;
        let y = hSpec - p * hSpec;

        if (x === 0) ctxOvl.moveTo(x, y);
        else ctxOvl.lineTo(x, y);
      }
    }
    ctxOvl.stroke();
    ctxOvl.setLineDash([]);
  };

  // Peak hold
  drawLine(state[peakHoldBufferName], "rgba(200, 200, 200, 0.5)");

  // Coherence (Mic vs AudioPlayer)
  if (coherenceData) {
    ctxOvl.beginPath();
    ctxOvl.strokeStyle = "rgba(234, 179, 8, 0.9)";
    ctxOvl.lineWidth = 2.0;

    let freqLog = Math.pow(10, logMinFreq);
    const freqLogMult = Math.pow(10, (2 / wSpec) * logMaxMinRatio);

    for (let x = 0; x < wSpec; x += 2) {
      let freqIndex;
      if (useLogScale) {
        freqIndex = freqLog / hzPerBin;
        freqLog *= freqLogMult;
      } else {
        let pc = x / wSpec;
        let freq = minFreqLog + pc * linearRange;
        freqIndex = freq / hzPerBin;
      }

      if (freqIndex >= 0 && freqIndex < bufferLength) {
        let i0 = Math.floor(freqIndex);
        let val = coherenceData[i0];
        if (isNaN(val)) val = 0;
        else if (val < 0) val = 0;
        else if (val > 1) val = 1;
        let y = hSpec - val * hSpec;

        if (x === 0) ctxOvl.moveTo(x, y);
        else ctxOvl.lineTo(x, y);
      }
    }
    ctxOvl.stroke();

    ctxOvl.fillStyle = "rgba(234, 179, 8, 0.8)";
    ctxOvl.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctxOvl.textAlign = "right";

    // Dynamic grid for coherence
    ctxOvl.textBaseline = "top";
    ctxOvl.fillText("1.0", wSpec - 5, 2);
    ctxOvl.textBaseline = "middle";
    ctxOvl.fillText("0.75", wSpec - 5, hSpec * 0.25);
    ctxOvl.fillText("0.5", wSpec - 5, hSpec * 0.5);
    ctxOvl.fillText("0.25", wSpec - 5, hSpec * 0.75);
    ctxOvl.textBaseline = "bottom";
    ctxOvl.fillText("0.0", wSpec - 5, hSpec - 2);

    ctxOvl.textBaseline = "top";
    ctxOvl.fillText("Coherency", wSpec - 5, 14);
  }

  ctxOvl.restore();

  // ---- Peak detection (audioPlayer は howling 警告は出さない) ----
  const { peakCount } = state.config;
  const peaks = [];

  let sumPower = 0;
  let sampleCount = 0;
  for (let i = 0; i < bufferLength; i += 4) {
    sumPower += Math.pow(10, freqData[i] / 10);
    sampleCount++;
  }
  const avgDb = 10 * Math.log10(sumPower / sampleCount);
  const mOffset = Math.max(2, Math.round(150 / hzPerBin));

  if (peakCount > 0) {
    for (let i = 2; i < bufferLength - 2; i++) {
      const val = freqData[i];
      if (val <= minDb + 5) continue;
      const f = i * hzPerBin;
      if (f < minFreqLog || f > maxFreqLog) continue;

      if (
        val > freqData[i - 1] &&
        val > freqData[i + 1] &&
        val > freqData[i - 2] &&
        val > freqData[i + 2]
      ) {
        peaks.push({ index: i, val, freq: f });
      }
    }
  }

  ctxOvl.fillStyle = "#fff";
  ctxOvl.font = "12px monospace";
  ctxOvl.textAlign = "center";

  peaks.sort((a, b) => b.val - a.val);
  const topPeaks = peaks.slice(0, peakCount);

  topPeaks.forEach((peak) => {
    let percent = (peak.val - minDb) / dbRange;
    percent = Math.max(0, Math.min(1, percent));
    const peakY = hSpec - hSpec * percent;

    let freq = peak.freq;
    let peakX;

    if (useLogScale) {
      if (freq < minFreqLog) freq = minFreqLog;
      peakX =
        (Math.log10(freq / minFreqLog) / Math.log10(maxFreqLog / minFreqLog)) *
        wSpec;
    } else {
      peakX = ((freq - minFreqLog) / (maxFreqLog - minFreqLog)) * wSpec;
    }

    if (peakX >= 0 && peakX <= wSpec) {
      ctxOvl.beginPath();
      ctxOvl.arc(peakX, peakY - 4, 3, 0, 2 * Math.PI);
      ctxOvl.fill();

      const freqText =
        freq >= 1000 ? (freq / 1000).toFixed(1) + "k" : Math.round(freq);
      const textY = peakY - 10;
      let align = "center";
      if (peakX < 40) align = "left";
      if (peakX > wSpec - 20) align = "right";

      ctxOvl.textAlign = align;
      ctxOvl.fillText(freqText, peakX, textY - 10);
    }
  });

  // ---- Hover tooltip (audioPlayer canvas のみ) ----
  if (
    state.isHovering &&
    state.hoveredIsAudio === true &&
    state.mouseX >= 0 &&
    state.mouseY >= 0 &&
    minDb < 0
  ) {
    let hoverFreq = 0;
    if (useLogScale) {
      hoverFreq =
        minFreqLog * Math.pow(maxFreqLog / minFreqLog, state.mouseX / wSpec);
    } else {
      hoverFreq =
        minFreqLog + (maxFreqLog - minFreqLog) * (state.mouseX / wSpec);
    }

    let hoverFreqText =
      hoverFreq >= 1000
        ? (hoverFreq / 1000).toFixed(1) + "k"
        : Math.round(hoverFreq);
    hoverFreqText += " Hz";

    const binIndex = Math.max(
      0,
      Math.min(bufferLength - 1, Math.round(hoverFreq / hzPerBin)),
    );
    const val = freqData[binIndex];
    const papr = val - avgDb;
    let pnpr = 0;
    if (binIndex - mOffset >= 0 && binIndex + mOffset < bufferLength) {
      pnpr = Math.min(
        val - freqData[binIndex - mOffset],
        val - freqData[binIndex + mOffset],
      );
    }
    let phpr = 0;
    const h2Index = binIndex * 2;
    if (h2Index < bufferLength) phpr = val - freqData[h2Index];

    const statsHtml = `
      <div>${hoverFreqText}</div>
      <div style="color:#aaa; font-size:0.7rem; margin-top:2px;">
        PAPR: ${papr.toFixed(1)}dB<br/>
        PNPR: ${pnpr.toFixed(1)}dB<br/>
        PHPR: ${phpr.toFixed(1)}dB
      </div>
    `;

    if (dom.hoverTooltip && dom.canvasAudioSpectrum) {
      const canvasRect = dom.canvasAudioSpectrum.getBoundingClientRect();
      const tooltipX = canvasRect.left + state.mouseX;
      const tooltipY = canvasRect.top + state.mouseY;

      if (dom.hoverTooltip.style.display !== "block") {
        dom.hoverTooltip.style.display = "block";
      }
      dom.hoverTooltip.style.left = tooltipX + "px";
      dom.hoverTooltip.style.top = tooltipY + "px";
      if (dom.hoverTooltip.innerHTML !== statsHtml) {
        dom.hoverTooltip.innerHTML = statsHtml;
      }
    }
  } else if (dom.hoverTooltip && state.hoveredIsAudio === true) {
    if (dom.hoverTooltip.style.display !== "none") {
      dom.hoverTooltip.style.display = "none";
    }
  }

  // ---- Peak frequency indicator (#peak-freq inside audio card) ----
  const peakFreqValEl =
    dom.canvasAudioSpectrum.parentElement.parentElement.querySelector(
      "#peak-freq",
    );
  if (peakFreqValEl) {
    if (topPeaks.length > 0) {
      const topPeak = topPeaks[0];
      const text = topPeak.freq.toFixed(0);
      if (peakFreqValEl.textContent !== text) {
        peakFreqValEl.textContent = text;
      }
    } else if (state.audioCtx && maxFreqVal > minDb + 10) {
      const dominantFreq = maxFreqIndex * hzPerBin;
      const text = dominantFreq.toFixed(0);
      if (peakFreqValEl.textContent !== text) {
        peakFreqValEl.textContent = text;
      }
    } else {
      if (peakFreqValEl.textContent !== "--") {
        peakFreqValEl.textContent = "--";
      }
    }
  }

  // ---- Frequency axis labels & grid ----
  ctxOvl.textAlign = "center";
  ctxOvl.textBaseline = "bottom";
  ctxOvl.fillStyle = "rgba(226, 232, 240, 0.4)";

  const labels = [minFreqLog];
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000];
  if (useLogScale) {
    for (const s of steps) {
      if (s > minFreqLog && s < maxFreqLog) labels.push(s);
    }
  } else {
    const step =
      Math.pow(10, Math.max(1, Math.floor(Math.log10(linearRange)) - 1)) * 5;
    for (
      let f = Math.ceil(minFreqLog / step) * step;
      f < maxFreqLog;
      f += step
    ) {
      labels.push(f);
    }
  }
  labels.push(maxFreqLog);

  for (const f of labels) {
    const ratio = useLogScale
      ? (Math.log10(f) - logMinFreq) / logMaxMinRatio
      : (f - minFreqLog) / linearRange;

    const fStr = f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${f}`;
    ctxOvl.fillText(fStr, ratio * wSpec, hSpec - 2);

    ctxOvl.beginPath();
    ctxOvl.moveTo(ratio * wSpec, 0);
    ctxOvl.lineTo(ratio * wSpec, hSpec - 15);
    ctxOvl.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctxOvl.stroke();
  }
}
