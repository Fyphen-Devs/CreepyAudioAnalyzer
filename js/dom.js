export function getDomRefs() {
  const canvasSpectrum = document.getElementById("canvas-spectrum");
  const canvasSpectrumOverlay = document.getElementById(
    "canvas-spectrum-overlay",
  );
  const canvasWaveform = document.getElementById("canvas-waveform");
  const canvasSpectrogram = document.getElementById("canvas-spectrogram");
  const canvasSpectrogramOverlay = document.getElementById(
    "canvas-spectrogram-overlay",
  );
  const canvasVectorscope = document.getElementById("canvas-vectorscope");

  return {
    btnMic: document.getElementById("btn-mic"),
    btnFreeze: document.getElementById("btn-freeze"),
    statusText: document.getElementById("audio-status"),
    sampleRateText: document.getElementById("sample-rate"),
    channelsText: document.getElementById("audio-channels"),
    deviceNameText: document.getElementById("audio-device-name"),

    // Noise
    btnCalibrate: document.getElementById("btn-calibrate"),
    btnClearCalibrate: document.getElementById("btn-clear-calibrate"),
    noiseStats: document.getElementById("noise-stats"),

    btnSnapshot: document.getElementById("btn-snapshot"),
    btnClearSnapshot: document.getElementById("btn-clear-snapshot"),
    spectrumView: document.getElementById("spectrum-view"),
    peakHoldInf: document.getElementById("peak-hold-inf"),

    fftSizeSelect: document.getElementById("fft-size"),
    specThemeSelect: document.getElementById("spec-theme"),
    specModeSelect: document.getElementById("spec-mode"),
    smoothingInput: document.getElementById("smoothing"),
    smoothingVal: document.getElementById("smoothing-val"),
    minDbInput: document.getElementById("min-db"),
    minDbVal: document.getElementById("min-db-val"),
    maxDbInput: document.getElementById("max-db"),
    maxDbVal: document.getElementById("max-db-val"),
    micSelect: document.getElementById("mic-select"),
    micGain: document.getElementById("mic-gain"),
    micGainVal: document.getElementById("mic-gain-val"),
    outSelect: document.getElementById("out-select"),
    btnTone: document.getElementById("btn-tone"),
    toneType: document.getElementById("tone-type"),
    toneFreq: document.getElementById("tone-freq"),
    toneVol: document.getElementById("tone-vol"),
    toneVolVal: document.getElementById("tone-vol-val"),
    tonePan: document.getElementById("tone-pan"),
    tonePanVal: document.getElementById("tone-pan-val"),
    toneStatus: document.getElementById("tone-status"),

    // FSK Modem
    btnModemRx: document.getElementById("btn-modem-rx"),
    btnModemTx: document.getElementById("btn-modem-tx"),
    btnModemClear: document.getElementById("btn-modem-clear"),
    modemMode: document.getElementById("modem-mode"),

    modemTxText: document.getElementById("modem-tx-text"),
    modemRxLog: document.getElementById("modem-rx-log"),
    modemStatus: document.getElementById("modem-status"),
    modemVol: document.getElementById("modem-vol"),
    modemVolVal: document.getElementById("modem-vol-val"),

    // Spectrogram Drawer
    specDrawText: document.getElementById("spec-draw-text"),
    specDrawSpeed: document.getElementById("spec-draw-speed"),
    btnSpecDraw: document.getElementById("btn-spec-draw"),

    btnBenchmark: document.getElementById("btn-benchmark"),
    renderTimeDisplay: document.getElementById("render-time-display"),
    updateRateSelect: document.getElementById("update-rate"),
    freqScaleSelect: document.getElementById("freq-scale"),
    freqMinInput: document.getElementById("freq-min"),
    freqMaxInput: document.getElementById("freq-max"),
    peakCountInput: document.getElementById("peak-count"),
    peakCountVal: document.getElementById("peak-count-val"),
    howlingWarning: document.getElementById("howling-warning"),
    meteringStandard: document.getElementById("metering-standard"),

    peakFill: document.getElementById("peak-fill"),
    peakValue: document.getElementById("peak-value"),
    clipLogContainer: document.getElementById("clip-log-container"),
    clipLogEmpty: document.getElementById("clip-log-empty"),
    btnClearClips: document.getElementById("btn-clear-clips"),
    peakFreqValue: document.getElementById("peak-freq"),
    audioDelayVal: document.getElementById("audio-delay-val"),
    correlationValue: document.getElementById("correlation-value"),
    correlationFill: document.getElementById("correlation-fill"),

    canvasSpectrum,
    ctxSpectrum: canvasSpectrum
      ? canvasSpectrum.getContext("webgl2", { preserveDrawingBuffer: false }) ||
        canvasSpectrum.getContext("webgl", { preserveDrawingBuffer: false })
      : null,
    canvasSpectrumOverlay,
    ctxSpectrumOverlay: canvasSpectrumOverlay
      ? canvasSpectrumOverlay.getContext("2d")
      : null,
    canvasWaveform,
    ctxWaveform: canvasWaveform
      ? canvasWaveform.getContext("webgl2", { preserveDrawingBuffer: false }) ||
        canvasWaveform.getContext("webgl", { preserveDrawingBuffer: false })
      : null,
    canvasSpectrogram,
    ctxSpectrogram: canvasSpectrogram
      ? canvasSpectrogram.getContext("webgl2", {
          preserveDrawingBuffer: true,
        }) ||
        canvasSpectrogram.getContext("webgl", { preserveDrawingBuffer: true })
      : null,
    canvasSpectrogramOverlay,
    ctxSpectrogramOverlay: canvasSpectrogramOverlay
      ? canvasSpectrogramOverlay.getContext("2d")
      : null,
    canvasVectorscope,
    ctxVectorscope: canvasVectorscope
      ? canvasVectorscope.getContext("webgl2", {
          preserveDrawingBuffer: false,
        }) ||
        canvasVectorscope.getContext("webgl", { preserveDrawingBuffer: false })
      : null,
    canvasVectorscopeOverlay: null, // If needed in future
    ctxVectorscopeOverlay: null,

    canvasAudioSpectrum: document.getElementById("canvas-audio-spectrum"),
    ctxAudioSpectrum: document.getElementById("canvas-audio-spectrum")
      ? document
          .getElementById("canvas-audio-spectrum")
          .getContext("webgl2", { preserveDrawingBuffer: false }) ||
        document
          .getElementById("canvas-audio-spectrum")
          .getContext("webgl", { preserveDrawingBuffer: false })
      : null,
    canvasAudioSpectrumOverlay: document.getElementById(
      "canvas-audio-spectrum-overlay",
    ),
    ctxAudioSpectrumOverlay: document.getElementById(
      "canvas-audio-spectrum-overlay",
    )
      ? document
          .getElementById("canvas-audio-spectrum-overlay")
          .getContext("2d")
      : null,

    bmpAudio: document.getElementById("bmp-audio"),

    hoverTooltip: document.getElementById("hover-tooltip"),
    fpsDisplay: document.getElementById("fps-display"),
  };
}
