export function initBottomPlayer() {
  const container = document.getElementById("bottom-music-player");
  const header = document.getElementById("bmp-header");
  const uploadInput = document.getElementById("bmp-upload");
  const audio = document.getElementById("bmp-audio");

  const btnPrev = document.getElementById("bmp-prev");
  const btnPlay = document.getElementById("bmp-play");
  const btnNext = document.getElementById("bmp-next");

  const trackName = document.getElementById("bmp-track-name");
  const timeCurrent = document.getElementById("bmp-time-current");
  const timeTotal = document.getElementById("bmp-time-total");
  const progress = document.getElementById("bmp-progress");
  const volumeSlider = document.getElementById("bmp-volume");
  const playlistEl = document.getElementById("bmp-playlist");
  const eqControls = document.getElementById("bmp-eq-controls");

  let playlist = [];
  let currentIndex = -1;
  let currentTrackUrl = null; // Track current URL for cleanup

  // Toggle Collapse
  header.addEventListener("click", () => {
    container.classList.toggle("collapsed");
  });

  // Prevent drag-and-drop events from bubbling up to app.js when interacting with bottom player
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Load Music
  uploadInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const wasEmpty = playlist.length === 0;
    playlist = playlist.concat(files);

    updatePlayerControls();
    renderPlaylist();

    if (wasEmpty) {
      currentIndex = 0;
      loadTrack(currentIndex);
    }

    if (container.classList.contains("collapsed")) {
      container.classList.remove("collapsed");
    }

    // allow selecting the same file(s) again
    e.target.value = "";
  });

  setupEqualizer();

  function updatePlayerControls() {
    const hasTracks = playlist.length > 0;
    btnPrev.disabled = playlist.length <= 1;
    btnNext.disabled = playlist.length <= 1;
    btnPlay.disabled = !hasTracks;
    progress.disabled = !hasTracks;
  }

  function renderPlaylist() {
    playlistEl.innerHTML = "";
    if (playlist.length === 0) {
      playlistEl.innerHTML =
        '<li style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 12px;">Queue is empty</li>';
      return;
    }

    playlist.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "bmp-playlist-item";
      li.draggable = true;
      if (index === currentIndex) {
        li.classList.add("active");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "bmp-playlist-item-name";
      nameSpan.textContent = file.name;
      nameSpan.title = file.name;
      nameSpan.addEventListener("click", () => {
        currentIndex = index;
        loadTrack(currentIndex);
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "bmp-btn-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation(); // prevent li click
        removeTrack(index);
      });

      // Drag and Drop Reordering
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", index);
        e.dataTransfer.effectAllowed = "move";
        li.classList.add("dragging");
      });

      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
      });

      li.addEventListener("dragover", (e) => {
        e.preventDefault(); // Necessary to allow drop
        e.dataTransfer.dropEffect = "move";
        li.classList.add("drag-over");
      });

      li.addEventListener("dragleave", () => {
        li.classList.remove("drag-over");
      });

      li.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent app.js body drop handler from triggering
        li.classList.remove("drag-over");

        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIndex = index;

        if (fromIndex === toIndex) return;

        // Reorder playlist
        const item = playlist.splice(fromIndex, 1)[0];
        playlist.splice(toIndex, 0, item);

        // Adjust currentIndex
        if (currentIndex === fromIndex) {
          currentIndex = toIndex;
        } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
          currentIndex--;
        } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
          currentIndex++;
        }

        renderPlaylist();
      });

      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      playlistEl.appendChild(li);
    });
  }

  function removeTrack(index) {
    // Revoke URL if removing currently playing track
    if (index === currentIndex && currentTrackUrl) {
      URL.revokeObjectURL(currentTrackUrl);
      currentTrackUrl = null;
    } else if (index < currentIndex) {
      // Adjust index if removed track was before current
      currentIndex--;
    }

    playlist.splice(index, 1);
    updatePlayerControls();

    if (playlist.length === 0) {
      audio.pause();
      audio.src = "";
      currentIndex = -1;
      trackName.textContent = "No track loaded";
      timeCurrent.textContent = "0:00";
      timeTotal.textContent = "0:00";
      progress.value = 0;
      updatePlayButton();
    } else {
      if (index === currentIndex) {
        currentIndex = index >= playlist.length ? 0 : index;
        loadTrack(currentIndex);
      }
      // currentIndex already adjusted above for index < currentIndex
    }
    renderPlaylist();
  }

  function setupEqualizer() {
    if (!eqControls) return;

    const bands = [
      { label: "60", freq: 60 },
      { label: "170", freq: 170 },
      { label: "310", freq: 310 },
      { label: "600", freq: 600 },
      { label: "1k", freq: 1000 },
      { label: "3k", freq: 3000 },
      { label: "6k", freq: 6000 },
      { label: "12k", freq: 12000 },
    ];

    eqControls.innerHTML = "";
    bands.forEach((band, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "bmp-eq-slider-wrapper";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "bmp-eq-slider";
      slider.min = "-12";
      slider.max = "12";
      slider.step = "1";
      slider.value = "0";

      slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (window.audioController && window.audioController.updateEqGain) {
          window.audioController.updateEqGain(index, val);
        }
      });

      const label = document.createElement("span");
      label.className = "bmp-eq-label";
      label.textContent = band.label;

      wrapper.appendChild(slider);
      wrapper.appendChild(label);
      eqControls.appendChild(wrapper);
    });

    // Reset functionality
    const resetBtn = document.getElementById("bmp-eq-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const presetSelect = document.getElementById("bmp-eq-preset");
        if (presetSelect) presetSelect.value = "flat";

        const sliders = eqControls.querySelectorAll(".bmp-eq-slider");
        sliders.forEach((slider, index) => {
          slider.value = "0";
          if (window.audioController && window.audioController.updateEqGain) {
            window.audioController.updateEqGain(index, 0);
          }
        });
      });
    }

    // Auto EQ functionality
    const autoBtn = document.getElementById("bmp-eq-auto");
    if (autoBtn) {
      autoBtn.addEventListener("click", async () => {
        // Reset preset selector to "flat" if it was set to something else
        const presetSelect = document.getElementById("bmp-eq-preset");
        if (presetSelect) presetSelect.value = "flat";

        autoBtn.textContent = "Analyzing...";
        autoBtn.disabled = true;

        const suggestedGains = await window.audioController.autoOptimizeEq();

        if (suggestedGains) {
          const sliders = eqControls.querySelectorAll(".bmp-eq-slider");
          suggestedGains.forEach((gain, index) => {
            if (sliders[index]) {
              sliders[index].value = gain;
              window.audioController.updateEqGain(index, gain);
            }
          });
        }

        autoBtn.textContent = "Auto EQ";
        autoBtn.disabled = false;
      });
    }

    // Preset functionality
    const presetSelect = document.getElementById("bmp-eq-preset");
    if (presetSelect) {
      const presets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0],
        bass: [6, 4, 2, 0, 0, 0, 0, 0],
        treble: [0, 0, 0, 0, 0, 2, 4, 6],
        vocal: [0, 0, 0, 3, 6, 3, 0, 0],
        pop: [3, 2, 0, -1, -1, 0, 2, 3],
        rock: [5, 3, -1, -2, -1, 3, 5, 4],
        jazz: [4, 2, 1, 0, 0, 1, 2, 4],
        classical: [2, 1, 0, 0, 0, 0, 1, 2],
      };

      presetSelect.addEventListener("change", () => {
        const envPresetSelect = document.getElementById("bmp-eq-env-preset");
        if (envPresetSelect) envPresetSelect.value = "flat";

        const gains = presets[presetSelect.value];
        if (gains) {
          const sliders = eqControls.querySelectorAll(".bmp-eq-slider");
          gains.forEach((gain, index) => {
            if (sliders[index]) {
              sliders[index].value = gain;
              if (
                window.audioController &&
                window.audioController.updateEqGain
              ) {
                window.audioController.updateEqGain(index, gain);
              }
            }
          });
        }
      });
    }

    // Environment Preset functionality
    const envPresetSelect = document.getElementById("bmp-eq-env-preset");
    if (envPresetSelect) {
      const envPresets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0],
        live: [4, 2, 0, -2, 0, 2, 4, 6],
        "3d": [6, 2, -2, -4, -2, 2, 6, 8],
        theatre: [3, 4, 2, 0, 1, 2, 3, 4],
        outdoor: [6, 4, 2, 1, 0, 3, 5, 6],
        "indoor-large": [2, 0, -2, -3, 0, 2, 4, 5],
        "indoor-middle": [2, 1, -1, -1, 0, 1, 3, 4],
        "indoor-small": [0, -1, -2, 0, 0, 1, 2, 3],
        headphone: [5, 3, 0, -1, 0, 1, 3, 5],
        earphone: [7, 4, 1, 0, 1, 3, 4, 6],
      };

      envPresetSelect.addEventListener("change", () => {
        const presetSelect = document.getElementById("bmp-eq-preset");
        if (presetSelect) presetSelect.value = "flat";

        const gains = envPresets[envPresetSelect.value];
        if (gains) {
          const sliders = eqControls.querySelectorAll(".bmp-eq-slider");
          gains.forEach((gain, index) => {
            if (sliders[index]) {
              sliders[index].value = gain;
              if (
                window.audioController &&
                window.audioController.updateEqGain
              ) {
                window.audioController.updateEqGain(index, gain);
              }
            }
          });
        }
      });
    }
  }

  function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;

    // Revoke previous URL to prevent memory leak
    if (currentTrackUrl) {
      URL.revokeObjectURL(currentTrackUrl);
      currentTrackUrl = null;
    }

    const file = playlist[index];
    const url = URL.createObjectURL(file);
    currentTrackUrl = url;

    audio.src = url;
    trackName.textContent = file.name;

    audio
      .play()
      .then(() => {
        updatePlayButton();
      })
      .catch((err) => {
        console.error("Playback error:", err);
      });

    updatePlayerControls();

    renderPlaylist();
  }

  function updatePlayButton() {
    if (audio.paused) {
      btnPlay.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    } else {
      btnPlay.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }
  }

  btnPlay.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
    updatePlayButton();
  });

  btnPrev.addEventListener("click", () => {
    if (playlist.length === 0) return;
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentIndex);
  });

  btnNext.addEventListener("click", () => {
    if (playlist.length === 0) return;
    currentIndex = (currentIndex + 1) % playlist.length;
    loadTrack(currentIndex);
  });

  audio.addEventListener("ended", () => {
    if (playlist.length > 0) {
      currentIndex = (currentIndex + 1) % playlist.length;
      loadTrack(currentIndex);
    }
  });

  // Time & Progress Update
  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const curr = audio.currentTime;
    const dur = audio.duration;

    progress.value = (curr / dur) * 100;
    timeCurrent.textContent = formatTime(curr);
    timeTotal.textContent = formatTime(dur);
  });

  audio.addEventListener("loadedmetadata", () => {
    timeTotal.textContent = formatTime(audio.duration);
  });

  progress.addEventListener("input", (e) => {
    if (!audio.duration) return;
    const pct = parseFloat(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
  });

  volumeSlider.addEventListener("input", (e) => {
    audio.volume = parseFloat(e.target.value);
  });

  // Initialize volume from slider
  audio.volume = parseFloat(volumeSlider.value);

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Initialize empty view
  renderPlaylist();
}
