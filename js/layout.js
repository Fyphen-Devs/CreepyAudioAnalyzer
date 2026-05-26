export function resizeCanvases(dom) {
  const dpr = window.devicePixelRatio || 1;

  if (dom.canvasSpectrum && dom.ctxSpectrum) {
    const specRect = dom.canvasSpectrum.parentElement.getBoundingClientRect();
    dom.canvasSpectrum.width = specRect.width * dpr;
    dom.canvasSpectrum.height = specRect.height * dpr;

    // WebGL viewport
    dom.ctxSpectrum.viewport(
      0,
      0,
      dom.canvasSpectrum.width,
      dom.canvasSpectrum.height,
    );

    if (dom.canvasSpectrumOverlay && dom.ctxSpectrumOverlay) {
      dom.canvasSpectrumOverlay.width = specRect.width * dpr;
      dom.canvasSpectrumOverlay.height = specRect.height * dpr;
      dom.ctxSpectrumOverlay.setTransform(1, 0, 0, 1, 0, 0);
      dom.ctxSpectrumOverlay.scale(dpr, dpr);
    }
  }

  if (dom.canvasWaveform && dom.ctxWaveform) {
    const waveRect = dom.canvasWaveform.parentElement.getBoundingClientRect();
    dom.canvasWaveform.width = waveRect.width * dpr;
    dom.canvasWaveform.height = waveRect.height * dpr;

    if (dom.ctxWaveform.viewport) {
      dom.ctxWaveform.viewport(
        0,
        0,
        dom.canvasWaveform.width,
        dom.canvasWaveform.height,
      );
    } else if (dom.ctxWaveform.setTransform) {
      dom.ctxWaveform.setTransform(1, 0, 0, 1, 0, 0);
      dom.ctxWaveform.scale(dpr, dpr);
    }

    dom.canvasWaveform.style.width = waveRect.width + "px";
    dom.canvasWaveform.style.height = waveRect.height + "px";
  }

  if (dom.canvasSpectrogram && dom.ctxSpectrogram) {
    const specGramRect =
      dom.canvasSpectrogram.parentElement.getBoundingClientRect();
    dom.canvasSpectrogram.width = specGramRect.width * dpr;
    dom.canvasSpectrogram.height = specGramRect.height * dpr;

    // dom.ctxSpectrogram is WebGL now
    dom.ctxSpectrogram.viewport(
      0,
      0,
      dom.canvasSpectrogram.width,
      dom.canvasSpectrogram.height,
    );

    if (dom.canvasSpectrogramOverlay && dom.ctxSpectrogramOverlay) {
      dom.canvasSpectrogramOverlay.width = specGramRect.width * dpr;
      dom.canvasSpectrogramOverlay.height = specGramRect.height * dpr;
      dom.ctxSpectrogramOverlay.setTransform(1, 0, 0, 1, 0, 0);
      dom.ctxSpectrogramOverlay.scale(dpr, dpr);
    }
  }

  if (dom.canvasVectorscope && dom.ctxVectorscope) {
    const vectorscopeRect =
      dom.canvasVectorscope.parentElement.getBoundingClientRect();
    dom.canvasVectorscope.width = vectorscopeRect.width * dpr;
    dom.canvasVectorscope.height = vectorscopeRect.height * dpr;

    if (dom.ctxVectorscope.viewport) {
      dom.ctxVectorscope.viewport(
        0,
        0,
        dom.canvasVectorscope.width,
        dom.canvasVectorscope.height,
      );
    } else if (dom.ctxVectorscope.setTransform) {
      dom.ctxVectorscope.setTransform(1, 0, 0, 1, 0, 0);
      dom.ctxVectorscope.scale(dpr, dpr);
    }

    dom.canvasVectorscope.style.width = vectorscopeRect.width + "px";
    dom.canvasVectorscope.style.height = vectorscopeRect.height + "px";
  }

  if (dom.canvasAudioSpectrum && dom.ctxAudioSpectrum) {
    const specRect =
      dom.canvasAudioSpectrum.parentElement.getBoundingClientRect();
    dom.canvasAudioSpectrum.width = specRect.width * dpr;
    dom.canvasAudioSpectrum.height = specRect.height * dpr;

    // WebGL viewport
    dom.ctxAudioSpectrum.viewport(
      0,
      0,
      dom.canvasAudioSpectrum.width,
      dom.canvasAudioSpectrum.height,
    );

    if (dom.canvasAudioSpectrumOverlay && dom.ctxAudioSpectrumOverlay) {
      dom.canvasAudioSpectrumOverlay.width = specRect.width * dpr;
      dom.canvasAudioSpectrumOverlay.height = specRect.height * dpr;
      dom.ctxAudioSpectrumOverlay.setTransform(1, 0, 0, 1, 0, 0);
      dom.ctxAudioSpectrumOverlay.scale(dpr, dpr);
    }
  }
}
