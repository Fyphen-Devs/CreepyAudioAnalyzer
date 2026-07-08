// WebGL Shader Configs
const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5; // (0,0) to (1,1)
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
    float dataVal = texture2D(u_dataTex, vec2(texX, 0.5)).a; 
    
    if (v_uv.y <= dataVal) {
        gl_FragColor = vec4(0.886, 0.910, 0.941, 1.0); // #e2e8f0
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

let webglStateSpec = null;
let currentU8DataSpec = null;
const webglStateSpecMap = new Map();
const currentU8DataSpecMap = new Map();

function setupWebGLSpec(gl) {
  const result = initWebGL(gl);
  if (!result) return false;

  const { program, positionBuffer } = result;

  const dataTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dataTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const stateObj = {
    gl,
    program,
    positionBuffer,
    dataTex,
    uploadedBufferLength: 0,
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
  };
  webglStateSpecMap.set(gl, stateObj);
  return true;
}

export function drawSpectrum({ state, dom, frame }, isAudioPlayer = false) {
  const gl = isAudioPlayer ? dom.ctxAudioSpectrum : dom.ctxSpectrum;
  const ctxOvl = isAudioPlayer
    ? dom.ctxAudioSpectrumOverlay
    : dom.ctxSpectrumOverlay;

  if (!gl || !ctxOvl) return;

  if (!webglStateSpecMap.has(gl)) {
    if (!setupWebGLSpec(gl)) return;
  }
  const ws = webglStateSpecMap.get(gl);

  if (!currentU8DataSpecMap.has(gl)) {
    currentU8DataSpecMap.set(gl, null);
  }

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
  } = isAudioPlayer ? frame.audioPlayerFrame : frame;

  if (wSpec === 0 || hSpec === 0) return;

  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);

  let currentU8Data = currentU8DataSpecMap.get(gl);
  if (ws.uploadedBufferLength !== bufferLength || !currentU8Data) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.ALPHA,
      bufferLength,
      1,
      0,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      null,
    );
    ws.uploadedBufferLength = bufferLength;
    currentU8Data = new Uint8Array(bufferLength);
    currentU8DataSpecMap.set(gl, currentU8Data);
  }

  const invDbRange = 1 / dbRange;
  let maxFreqVal = -Infinity;
  let maxFreqIndex = 0;

  for (let i = 0; i < bufferLength; i++) {
    const val = freqData[i];
    if (val > maxFreqVal) {
      maxFreqVal = val;
      maxFreqIndex = i;
    }
    let p = (val - minDb) * invDbRange;
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
    gl.ALPHA,
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

  // Clear transparent
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!state.spectrumView || state.spectrumView === "fft") {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // -- CPU Overlay Rendering --
  ctxOvl.save();
  ctxOvl.setTransform(1, 0, 0, 1, 0, 0);

  const targetCanvasOvl = isAudioPlayer
    ? dom.canvasAudioSpectrumOverlay
    : dom.canvasSpectrumOverlay;
  ctxOvl.clearRect(0, 0, targetCanvasOvl.width, targetCanvasOvl.height);
  const dpr = window.devicePixelRatio || 1;
  ctxOvl.scale(dpr, dpr);

  let peakHoldBufferName = isAudioPlayer
    ? "audioPlayerPeakHoldBuffer"
    : "peakHoldBuffer";
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
      state[peakHoldBufferName][i] -= 0.5; // decay
    }
  }

  // Draw Octave Bands if needed
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

      // avg energy for band
      let sumPower = 0;
      for (let i = binStart; i < binEnd; i++) {
        sumPower += Math.exp(freqData[i] * 0.2302585092994046);
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

  // Helper macro for drawing lines
  const drawLine = (dataArray, color, dash = []) => {
    ctxOvl.beginPath();
    ctxOvl.strokeStyle = color;
    ctxOvl.lineWidth = 1.5;
    ctxOvl.setLineDash(dash);

    const invHzPerBin = 1 / hzPerBin;
    const invWSpec = 1 / wSpec;
    let freqLog = Math.pow(10, logMinFreq);
    const freqLogMult = Math.pow(10, (2 / wSpec) * logMaxMinRatio);

    for (let x = 0; x < wSpec; x += 2) {
      let freqIndex;
      if (useLogScale) {
        freqIndex = freqLog * invHzPerBin;
        freqLog *= freqLogMult;
      } else {
        let pc = x * invWSpec;
        let freq = minFreqLog + pc * linearRange;
        freqIndex = freq * invHzPerBin;
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

  // Draw Peak Hold
  drawLine(state[peakHoldBufferName], "rgba(200, 200, 200, 0.5)");

  // Draw Snapshot
  if (state.snapshotBuffer && !isAudioPlayer) {
    drawLine(state.snapshotBuffer, "rgba(56, 189, 248, 0.9)", [5, 5]); // Cyan dashed
  }

  // Draw Noise Profile
  if (state.noiseProfile && !isAudioPlayer) {
    drawLine(state.noiseProfile, "rgba(239, 68, 68, 0.7)", [4, 4]); // Red dashed
  }

  // Draw Coherence (Dual FFT)
  if (isAudioPlayer && coherenceData) {
    ctxOvl.beginPath();
    ctxOvl.strokeStyle = "rgba(234, 179, 8, 0.9)"; // Yellow Coherence Line
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

        // Map 0 -> bottom, 1 -> top
        let y = hSpec - val * hSpec;

        if (x === 0) ctxOvl.moveTo(x, y);
        else ctxOvl.lineTo(x, y);
      }
    }
    ctxOvl.stroke();

    // label for coherence
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

  const howlingEnabled = dom.howlingWarning !== null;
  let peaks = [];
  let howlingDetected = false;
  const { peakCount } = state.config;

  let sumPower = 0;
  let sampleCount = 0;
  for (let i = 0; i < bufferLength; i += 4) {
    sumPower += Math.exp(freqData[i] * 0.2302585092994046);
    sampleCount++;
  }
  const avgDb = 10 * Math.log10(sumPower / sampleCount);
  const mOffset = Math.max(2, Math.round(150 / hzPerBin));

  if (howlingEnabled || peakCount > 0) {
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

        if (howlingEnabled) {
          const papr = val - avgDb;
          let pnpr = 0;
          if (i - mOffset >= 0 && i + mOffset < bufferLength) {
            pnpr = Math.min(
              val - freqData[i - mOffset],
              val - freqData[i + mOffset],
            );
          }
          let phpr = 0;
          const h2Index = i * 2;
          if (h2Index < bufferLength) phpr = val - freqData[h2Index];

          if (
            f > 200 &&
            val > -35 &&
            papr > 25 &&
            pnpr > 15 &&
            (phpr > 15 || h2Index >= bufferLength)
          ) {
            howlingDetected = true;

            const now = new Date();
            if (!state.lastHowlingTime || now - state.lastHowlingTime > 1000) {
              state.lastHowlingTime = now;
              const timeStr = now.toLocaleTimeString();
              const fStr =
                f > 1000 ? (f / 1000).toFixed(2) + "k" : Math.round(f);
              state.eventLogs.unshift(
                `[${timeStr}] Howling: ${fStr}Hz (${val.toFixed(1)}dB)`,
              );
              if (state.eventLogs.length > 50) state.eventLogs.pop();

              if (dom.clipLogContainer && !isAudioPlayer) {
                dom.clipLogContainer.innerHTML = state.eventLogs
                  .map((log) => {
                    const color = log.includes("Howling")
                      ? "#fbbf24"
                      : "#ef4444";
                    return `<div style="color: ${color}; border-bottom: 1px solid var(--border); padding: 2px 0;">${log}</div>`;
                  })
                  .join("");
              }
            }
          }
        }
      }
    }
  }

  if (dom.howlingWarning && !isAudioPlayer) {
    const disp = howlingDetected ? "inline-block" : "none";
    if (dom.howlingWarning.style.display !== disp) {
      dom.howlingWarning.style.display = disp;
    }
  }

  ctxOvl.fillStyle = "#fff";
  ctxOvl.font = "12px monospace";
  ctxOvl.textAlign = "center";

  peaks.sort((a, b) => b.val - a.val);
  const maxPeaksToShow = peakCount;
  const topPeaks = peaks.slice(0, maxPeaksToShow);

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
      ctxOvl.fillText(freqText, peakX, textY);
    }
  });

  if (
    state.isHovering &&
    state.hoveredIsAudio === isAudioPlayer &&
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

    const targetCanvasForHover = isAudioPlayer
      ? dom.canvasAudioSpectrum
      : dom.canvasSpectrum;
    if (dom.hoverTooltip && targetCanvasForHover) {
      const canvasRect = targetCanvasForHover.getBoundingClientRect();
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
  } else if (dom.hoverTooltip && state.hoveredIsAudio === isAudioPlayer) {
    if (dom.hoverTooltip.style.display !== "none") {
      dom.hoverTooltip.style.display = "none";
    }
  }

  // Ensure this updates the correct peak frequency span
  const peakFreqValEl = isAudioPlayer
    ? dom.canvasAudioSpectrum.parentElement.parentElement.querySelector(
        "#peak-freq",
      )
    : dom.peakFreqValue;
  if (peakFreqValEl) {
    const now = performance.now();
    const lastUpdate = isAudioPlayer
      ? state.lastAudioPeakFreqUpdate
      : state.lastPeakFreqUpdate;
    if (!lastUpdate || now - lastUpdate > 100) {
      if (state.audioCtx && maxFreqVal > minDb + 10) {
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
      if (isAudioPlayer) state.lastAudioPeakFreqUpdate = now;
      else state.lastPeakFreqUpdate = now;
    }
  }

  // Draw horizontal frequency axis
  ctxOvl.textAlign = "center";
  ctxOvl.textBaseline = "bottom";
  ctxOvl.fillStyle = "rgba(226, 232, 240, 0.4)";

  const labels = [minFreqLog];
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000];
  if (useLogScale) {
    for (let s of steps) {
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

  for (let f of labels) {
    let ratio = useLogScale
      ? (Math.log10(f) - logMinFreq) / logMaxMinRatio
      : (f - minFreqLog) / linearRange;

    const fStr = f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${f}`;
    ctxOvl.fillText(fStr, ratio * wSpec, hSpec - 2);

    // Draw subtle vertical grid line
    ctxOvl.beginPath();
    ctxOvl.moveTo(ratio * wSpec, 0);
    ctxOvl.lineTo(ratio * wSpec, hSpec - 15);
    ctxOvl.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctxOvl.stroke();
  }

  // Draw solo filter overlay (Bandpass)
  if (
    state.isDraggingFilter &&
    state.filterStartX !== null &&
    state.filterEndX !== null
  ) {
    const xMin = Math.min(state.filterStartX, state.filterEndX);
    const xMax = Math.max(state.filterStartX, state.filterEndX);

    ctxOvl.fillStyle = "rgba(59, 130, 246, 0.3)";
    ctxOvl.fillRect(xMin, 0, Math.max(1, xMax - xMin), hSpec);

    let fMin = 0,
      fMax = 0;
    if (useLogScale) {
      fMin = minFreqLog * Math.pow(maxFreqLog / minFreqLog, xMin / wSpec);
      fMax = minFreqLog * Math.pow(maxFreqLog / minFreqLog, xMax / wSpec);
    } else {
      fMin = minFreqLog + (maxFreqLog - minFreqLog) * (xMin / wSpec);
      fMax = minFreqLog + (maxFreqLog - minFreqLog) * (xMax / wSpec);
    }

    if (fMax < fMin + 1) fMax = fMin + 1;

    const centerFreq = Math.sqrt(fMin * fMax);
    const bandwidth = fMax - fMin;
    const qValue = centerFreq / bandwidth;

    if (state.bandpassFilter) {
      state.bandpassFilter.frequency.value = centerFreq;
      state.bandpassFilter.Q.value = Math.max(0.0001, qValue);
    }

    ctxOvl.fillStyle = "#fff";
    ctxOvl.textAlign = "center";
    ctxOvl.textBaseline = "top";
    const textStart =
      fMin >= 1000 ? (fMin / 1000).toFixed(1) + "k" : Math.round(fMin);
    const textEnd =
      fMax >= 1000 ? (fMax / 1000).toFixed(1) + "k" : Math.round(fMax);
    ctxOvl.fillText(
      `${textStart} - ${textEnd} Hz`,
      xMin + (xMax - xMin) / 2,
      10,
    );
  }
}
