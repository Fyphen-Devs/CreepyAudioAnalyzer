let gl = null;
let program = null;
let positionBuffer = null;
let valueBuffer = null;
let aPositionLoc = -1;
let aValueLoc = -1;
let uColorLoc = -1;
let lastFftSize = 0;

const VS_SOURCE = `
attribute float a_position;
attribute float a_value;
void main() {
    gl_Position = vec4(a_position, a_value, 0.0, 1.0);
}`;

const FS_SOURCE = `
precision mediump float;
uniform vec4 u_color;
void main() {
    gl_FragColor = u_color;
}`;

function initWebGL(context) {
  if (gl === context) return;
  gl = context;
  if (!gl) return;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VS_SOURCE);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, FS_SOURCE);
  gl.compileShader(fs);

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  aPositionLoc = gl.getAttribLocation(program, "a_position");
  aValueLoc = gl.getAttribLocation(program, "a_value");
  uColorLoc = gl.getUniformLocation(program, "u_color");

  positionBuffer = gl.createBuffer();
  valueBuffer = gl.createBuffer();
}

export function drawWaveformAndMeter({ state, dom, frame }) {
  const { wWave, hWave, timeData } = frame;
  const fftSize = state.analyser.fftSize;

  let maxAbs = 0;
  let sumSquares = 0;
  for (let i = 0; i < fftSize; i++) {
    const v = timeData[i];
    const absV = Math.abs(v);
    if (absV > maxAbs) maxAbs = absV;
    sumSquares += v * v;
  }

  if (dom.ctxWaveform) {
    initWebGL(dom.ctxWaveform);

    if (lastFftSize !== fftSize) {
      lastFftSize = fftSize;
      const xPositions = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        xPositions[i] = (i / (fftSize - 1)) * 2.0 - 1.0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, xPositions, gl.STATIC_DRAW);
    }

    gl.viewport(0, 0, wWave, hWave);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, valueBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, timeData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aValueLoc);
    gl.vertexAttribPointer(aValueLoc, 1, gl.FLOAT, false, 0, 0);

    // Color: #e2e8f0 => rgb(226, 232, 240)
    gl.uniform4f(uColorLoc, 226 / 255, 232 / 255, 240 / 255, 1.0);

    // Draw thick line if possible (WebGL line width is flaky, but we set it)
    gl.lineWidth(2.0);
    gl.drawArrays(gl.LINE_STRIP, 0, fftSize);

    gl.disableVertexAttribArray(aPositionLoc);
    gl.disableVertexAttribArray(aValueLoc);
  }

  let currentPeakDb = -Infinity;
  const standard = state.config.meteringStandard || "peak";

  if (maxAbs > 0) {
    if (standard === "rms") {
      const rms = Math.sqrt(sumSquares / state.analyser.fftSize);
      currentPeakDb = 20 * Math.log10(rms);
    } else if (standard === "lufs") {
      const rms = Math.sqrt(sumSquares / state.analyser.fftSize);
      currentPeakDb = 20 * Math.log10(rms) + 3;
    } else {
      currentPeakDb = 20 * Math.log10(maxAbs);
    }
  }

  let truePeakDb = -Infinity;
  if (maxAbs > 0) {
    truePeakDb = 20 * Math.log10(maxAbs);
  }

  if (currentPeakDb > state.prevPeakValue) {
    state.prevPeakValue = currentPeakDb;
  } else {
    state.prevPeakValue -= standard === "lufs" ? 0.2 : 0.5;
  }

  if (truePeakDb >= 0.0) {
    const now = new Date();
    if (!state.lastClipTime || now - state.lastClipTime > 500) {
      state.lastClipTime = now;
      const timeStr = now.toLocaleTimeString();
      state.clipLogs.unshift(`[${timeStr}] Clip: +${truePeakDb.toFixed(2)} dB`);
      if (state.clipLogs.length > 50) state.clipLogs.pop();

      if (dom.clipLogContainer) {
        dom.clipLogContainer.innerHTML = state.clipLogs
          .map(
            (log) =>
              `<div style="color: #ef4444; border-bottom: 1px solid var(--border); padding: 2px 0;">${log}</div>`,
          )
          .join("");
      }
    }
  }

  let meterOffset = 0;
  if (standard === "k-12") {
    meterOffset = -12;
  } else if (standard === "k-14") {
    meterOffset = -14;
  } else if (standard === "k-20") {
    meterOffset = -20;
  }

  let displayDb = state.prevPeakValue - meterOffset;
  if (displayDb < -60) displayDb = -60;

  const meterPercent = Math.max(0, (displayDb + 60) / 60) * 100;
  const widthStr = Math.min(100, meterPercent) + "%";
  if (dom.peakFill.style.width !== widthStr)
    dom.peakFill.style.width = widthStr;

  let textContent = "-\u221E dB";
  if (state.prevPeakValue > -100) {
    textContent =
      state.prevPeakValue.toFixed(1) +
      " dB" +
      (meterOffset ? ` (${standard})` : "");
  }

  if (dom.peakValue.textContent !== textContent)
    dom.peakValue.textContent = textContent;
  if (dom.peakFill.style.backgroundColor !== "#e2e8f0")
    dom.peakFill.style.backgroundColor = "#e2e8f0";
  if (dom.peakValue.style.color !== "#e2e8f0")
    dom.peakValue.style.color = "#e2e8f0";
}
