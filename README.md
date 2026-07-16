# AeroSpec

Literally an audio analyzer with professional requirements met, running entirely in your browser.

## 📌 Overview

AeroSpec is a web-based, real-time, high-precision audio analysis tool that requires no dedicated hardware or heavy DAW plugins. Whether you are analyzing microphone inputs, playing back local audio files, or generating precise test tones, AeroSpec provides everything you need to visualize and diagnose audio.

## ✨ Key Features

### 📊 4 Powerful Visualizers

- **Frequency Spectrum (FSA)**: Real-time frequency amplitude visualization with automatic peak Hz detection.
- **Spectrogram**: A detailed map visualizing frequency and volume changes over time.
- **Oscilloscope**: Real-time continuous waveform drawing.
- **Vectorscope**: Monitor stereo width, panning, and phase correlation.
  _(Note: Click the ⛶ button on any panel for instant fullscreen analysis)_

### 🎤 Flexible Audio Routing

- **Microphone Input**: Dynamically switch between available audio input devices.
- **Drag & Drop Audio Files**: Simply drop a `.wav` or `.mp3` file into the app to instantly play and analyze it.
- **Output Routing**: Select your preferred output device (speakers/headphones) to prevent feedback or monitor specific chains.

### 🎛️ Diagnostic Tools

- **Test Tone Generator**: Generate Sine, Square, Sawtooth, Triangle, noise ambiences, sweep, and a psychoacoustic creepy mode with low-frequency rumble. Real-time control of frequency, panning, and gain.
- **Level Meter**: Independent Left/Right peak level monitoring.
- **Performance Benchmark**: Measure your device's rendering performance (FPS and average processing time in ms) to ensure real-time accuracy.

### ⚙️ Advanced Settings

- Adjustable FFT Sizes (from 512 up to 32768 for extreme engine resolution).
- Smoothing Time Constant controls.
- Custom min/max Decibel (dB) limits.
- Linear and Logarithmic scale toggles.
- Instant Freeze mode for capturing specific transients.

## 🚀 How to Use

1. Clone this repository or download the files.
2. Serve the directory using a local web server (e.g., Live Server in VS Code).
   _(Note: Modern browsers require `http://localhost` or `https://` to access microphone and audio APIs)._
3. Click **"Start Microphone"** to analyze live audio, or **Drag & Drop** an audio file anywhere on the screen to begin.

or

Just open up [here](https://fyphen1223.github.io/AudioAnalyzer/)

## 🛠️ Technology Stack

- HTML5 / CSS3 / Vanilla JavaScript (No external frameworks)
- Web Audio API (AnalyserNode, OscillatorNode, StereoPannerNode, etc.)
- Canvas API (Highly optimized rendering loops)
