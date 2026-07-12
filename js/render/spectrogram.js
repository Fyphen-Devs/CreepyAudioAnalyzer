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
uniform sampler2D u_paletteTex;

uniform int u_headIndex;
uniform int u_historySize;
uniform int u_bufferLength;

uniform int u_useLogScale;
uniform float u_minFreqLog;
uniform float u_maxFreqLog;
uniform float u_logMinFreq;
uniform float u_logMaxMinRatio;
uniform float u_linearRange;
uniform float u_hzPerBin;

uniform int u_specMode;

void main() {
    float timeVal;
    float freqVal;
    
    // Waterfall (time flows down): newest row at top -> v_uv.y = 1.0
    // Standard (time flows left): newest row at right ->  v_uv.x = 1.0
    if (u_specMode == 1) { 
        freqVal = v_uv.x;
        timeVal = 1.0 - v_uv.y; 
    } else { 
        freqVal = v_uv.y;
        timeVal = 1.0 - v_uv.x; 
    }

    float freqIndex;
    if (u_useLogScale == 1) {
        float freq = pow(10.0, freqVal * u_logMaxMinRatio + u_logMinFreq);
        freqIndex = freq / u_hzPerBin;
    } else {
        float freq = u_minFreqLog + freqVal * u_linearRange;
        freqIndex = freq / u_hzPerBin;
    }

    if (freqIndex < 0.0 || freqIndex >= float(u_bufferLength)) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Determine normalized texture coordinates
    float texX = (freqIndex + 0.5) / float(u_bufferLength);
    
    // Calculate ring buffer Y position
    float shift = timeVal * float(u_historySize);
    float rowIndex = float(u_headIndex) - shift;
    if (rowIndex < 0.0) {
        rowIndex += float(u_historySize);
    }
    float texY = (floor(rowIndex) + 0.5) / float(u_historySize);

    // Get normalized spectrum magnitude
    float magnitude = texture2D(u_dataTex, vec2(texX, texY)).a; 
    
    // Map to palette
    vec4 color = texture2D(u_paletteTex, vec2(magnitude, 0.5));
    gl_FragColor = vec4(color.rgb, 1.0);
}
`;

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

  // Full screen quad (-1 to 1)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  return { program, positionBuffer };
}

function createPalettes() {
  const palettes = {};
  const themes = ["fire", "ocean", "matrix", "grayscale", "classic"];

  for (const t of themes) {
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const p = i / 255;
      let r = 0,
        g = 0,
        b = 0;

      if (t === "fire") {
        r = Math.min(255, p * 2 * 255);
        g = Math.min(255, Math.max(0, (p - 0.3) * 2 * 255));
        b = Math.min(255, Math.max(0, (p - 0.7) * 4 * 255));
      } else if (t === "ocean") {
        r = Math.max(0, p - 0.5) * 2 * 255;
        g = p * 180;
        b = p * 255;
      } else if (t === "matrix") {
        g = p * 255;
      } else if (t === "grayscale") {
        r = g = b = p * 255;
      } else if (t === "classic") {
        const hue = (1 - p) * 240;
        const rgb = hslToRgb(hue / 360, 1.0, 0.5);
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      }

      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    palettes[t] = data;
  }
  return palettes;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const PALETTES = createPalettes();
let webglState = null;

const HISTORY_SIZE = 1024;
let headIndex = 0;
let currentU8Data = null;

function setupWebGL(gl) {
  const result = initWebGL(gl);
  if (!result) return false;

  const { program, positionBuffer } = result;

  const dataTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dataTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const paletteTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, paletteTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  webglState = {
    gl,
    program,
    positionBuffer,
    dataTex,
    paletteTex,
    uploadedBufferLength: 0,
    currentTheme: "",
    locs: {
      a_pos: gl.getAttribLocation(program, "a_position"),
      u_dataTex: gl.getUniformLocation(program, "u_dataTex"),
      u_paletteTex: gl.getUniformLocation(program, "u_paletteTex"),
      u_headIndex: gl.getUniformLocation(program, "u_headIndex"),
      u_historySize: gl.getUniformLocation(program, "u_historySize"),
      u_bufferLength: gl.getUniformLocation(program, "u_bufferLength"),
      u_useLogScale: gl.getUniformLocation(program, "u_useLogScale"),
      u_minFreqLog: gl.getUniformLocation(program, "u_minFreqLog"),
      u_maxFreqLog: gl.getUniformLocation(program, "u_maxFreqLog"),
      u_logMinFreq: gl.getUniformLocation(program, "u_logMinFreq"),
      u_logMaxMinRatio: gl.getUniformLocation(program, "u_logMaxMinRatio"),
      u_linearRange: gl.getUniformLocation(program, "u_linearRange"),
      u_hzPerBin: gl.getUniformLocation(program, "u_hzPerBin"),
      u_specMode: gl.getUniformLocation(program, "u_specMode"),
    },
  };
  return true;
}

export function drawSpectrogram({ dom, frame, state }) {
  if (!dom.ctxSpectrogram) return;
  const gl = dom.ctxSpectrogram;

  if (!webglState) {
    if (!setupWebGL(gl)) return;
  }
  const ws = webglState;

  const {
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
  } = frame;

  const { wSpecg, hSpecg, specMode, specTheme, updateRateFps } = state.config;

  if (wSpecg === 0 || hSpecg === 0) return;

  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);

  if (ws.uploadedBufferLength !== bufferLength) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.ALPHA,
      bufferLength,
      HISTORY_SIZE,
      0,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(bufferLength * HISTORY_SIZE),
    );
    ws.uploadedBufferLength = bufferLength;
    currentU8Data = new Uint8Array(bufferLength);
  }

  if (!state.isFrozen) {
    for (let i = 0; i < bufferLength; i++) {
      let p = (freqData[i] - minDb) / dbRange;
      p = Math.max(0, Math.min(1, p));
      currentU8Data[i] = Math.floor(p * 255);
    }

    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      headIndex,
      bufferLength,
      1,
      gl.ALPHA,
      gl.UNSIGNED_BYTE,
      currentU8Data,
    );

    headIndex = (headIndex + 1) % HISTORY_SIZE;
  }

  const tId = specTheme || "classic";
  if (ws.currentTheme !== tId) {
    gl.bindTexture(gl.TEXTURE_2D, ws.paletteTex);
    const pData = PALETTES[tId] || PALETTES["classic"];
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pData,
    );
    ws.currentTheme = tId;
  }

  gl.useProgram(ws.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ws.dataTex);
  gl.uniform1i(ws.locs.u_dataTex, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, ws.paletteTex);
  gl.uniform1i(ws.locs.u_paletteTex, 1);

  gl.uniform1i(ws.locs.u_headIndex, headIndex);
  gl.uniform1i(ws.locs.u_historySize, HISTORY_SIZE);
  gl.uniform1i(ws.locs.u_bufferLength, bufferLength);
  gl.uniform1i(ws.locs.u_useLogScale, useLogScale ? 1 : 0);
  gl.uniform1f(ws.locs.u_minFreqLog, minFreqLog);
  gl.uniform1f(ws.locs.u_maxFreqLog, maxFreqLog);
  gl.uniform1f(ws.locs.u_logMinFreq, logMinFreq);
  gl.uniform1f(ws.locs.u_logMaxMinRatio, logMaxMinRatio);
  gl.uniform1f(ws.locs.u_linearRange, linearRange);
  gl.uniform1f(ws.locs.u_hzPerBin, hzPerBin);
  gl.uniform1i(ws.locs.u_specMode, specMode === "waterfall" ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ws.positionBuffer);
  gl.enableVertexAttribArray(ws.locs.a_pos);
  gl.vertexAttribPointer(ws.locs.a_pos, 2, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const ctxOvl = dom.ctxSpectrogramOverlay;
  if (ctxOvl && dom.canvasSpectrogramOverlay && state.overlayDirty) {
    const W = wSpecg;
    const H = hSpecg;

    ctxOvl.clearRect(0, 0, W, H);
    ctxOvl.font = "10px monospace";

    const fps = updateRateFps || 60;
    const dpr = window.devicePixelRatio || 1;
    const stepCSS = 1 / dpr;
    const cxPerSec = fps * stepCSS;

    if (specMode === "waterfall") {
      ctxOvl.textAlign = "left";
      ctxOvl.textBaseline = "middle";
      ctxOvl.fillStyle = "rgb(10, 15, 20)";
      ctxOvl.fillRect(0, 0, 35, H);
      ctxOvl.fillStyle = "rgba(226, 232, 240, 0.8)";
      for (let s = 1; s * cxPerSec < H; s++) {
        ctxOvl.fillText(`-${s}s`, 5, s * cxPerSec);
      }

      // Frequency (Horizontal X)
      ctxOvl.textAlign = "center";
      ctxOvl.textBaseline = "middle";
      ctxOvl.fillStyle = "rgb(10, 15, 20)";
      ctxOvl.fillRect(0, 0, W, 20);
      ctxOvl.fillStyle = "rgba(226, 232, 240, 0.8)";
      drawFreqLabels(W, true);
    } else {
      ctxOvl.textAlign = "center";
      ctxOvl.textBaseline = "bottom";
      ctxOvl.fillStyle = "rgb(10, 15, 20)";
      ctxOvl.fillRect(0, H - 15, W, 15);
      ctxOvl.fillStyle = "rgba(226, 232, 240, 0.8)";
      for (let s = 1; s * cxPerSec < W; s++) {
        ctxOvl.fillText(`-${s}s`, W - s * cxPerSec, H - 2);
      }

      // Frequency (Vertical Y)
      ctxOvl.textAlign = "left";
      ctxOvl.textBaseline = "middle";
      ctxOvl.fillStyle = "rgb(10, 15, 20)";
      ctxOvl.fillRect(0, 0, 45, H);
      ctxOvl.fillStyle = "rgba(226, 232, 240, 0.8)";
      drawFreqLabels(H, false);
    }

    function drawFreqLabels(size, isHorizontal) {
      const labels = [minFreqLog];
      const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000];
      if (useLogScale) {
        for (let s of steps) {
          if (s > minFreqLog && s < maxFreqLog) labels.push(s);
        }
      } else {
        const step =
          Math.pow(10, Math.max(1, Math.floor(Math.log10(linearRange)) - 1)) *
          5;
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

        const fStr = f >= 1000 ? `${(f / 1000).toFixed(0)}k` : `${f}`;
        if (isHorizontal) {
          ctxOvl.fillText(fStr, ratio * size, 10);
        } else {
          ctxOvl.fillText(fStr, 2, H - ratio * size);
        }
      }
    }
    state.overlayDirty = false;
  }
}
