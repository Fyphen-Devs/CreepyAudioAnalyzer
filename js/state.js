export function createInitialState() {
  return {
    audioCtx: null,
    analyser: null,
    analyserL: null,
    analyserR: null,
    splitter: null,
    source: null,
    stream: null,
    wasmFft: null,
    wasmMemory: null,
    WasmFftClass: null,
    animationId: null,

    isRunning: false,
    isFrozen: false,
    isBenchmarking: false,
    renderTimes: [],
    mouseX: -1,
    mouseY: -1,
    isHovering: false,
    filterStartX: null,
    filterEndX: null,
    isDraggingFilter: false,

    // Tone Generator States
    toneEnabled: false,
    toneOsc: null,
    toneGain: null,
    tonePan: null,

    // Noise Calibration & Analysis
    noiseProfile: null,
    isCalibrating: false,
    calibrationFrames: 0,
    calibrationBuffer: null,
    noiseStats: {
      avgDb: -100,
      profileType: "None",
    },
    // Spectral Features
    snapshotBuffer: null,
    peakHoldBuffer: null,
    spectrumView: "fft", // fft | oct13 | oct16
    peakHoldInf: false,
    // FSK Modem
    modemActive: false,
    modemMode: "audible",
    modemRxBuffer: "",

    availableMics: [],
    availableOutputs: [],

    prevPeakValue: -Infinity,
    eventLogs: [],
    lastDrawTime: 0,
    fpsFrameCount: 0,
    lastFpsTime: 0,

    freqDataBuffer: null,
    timeDataBuffer: null,
    timeLBuffer: null,
    timeRBuffer: null,

    config: {
      freqMinLog: 20,
      freqMaxLog: 20000,
      useLogScale: true,
      peakCount: 0,
      meteringStandard: "peak",
      specMode: "standard",
      specTheme: "classic",
      updateRateFps: 60,
      wSpec: 0,
      hSpec: 0,
      wWave: 0,
      hWave: 0,
      wSpecg: 0,
      hSpecg: 0,
      wVec: 0,
      hVec: 0,
    },
  };
}
