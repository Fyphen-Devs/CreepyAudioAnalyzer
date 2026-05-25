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
  const playlistEl = document.getElementById("bmp-playlist");

  let playlist = [];
  let currentIndex = -1;

  // Toggle Collapse
  header.addEventListener("click", () => {
    container.classList.toggle("collapsed");
  });

  // Load Music
  uploadInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const wasEmpty = playlist.length === 0;
    playlist = playlist.concat(files);

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

      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      playlistEl.appendChild(li);
    });
  }

  function removeTrack(index) {
    playlist.splice(index, 1);

    if (playlist.length === 0) {
      audio.pause();
      audio.src = "";
      currentIndex = -1;
      trackName.textContent = "No track loaded";
      timeCurrent.textContent = "0:00";
      timeTotal.textContent = "0:00";
      progress.value = 0;
      btnPrev.disabled = true;
      btnNext.disabled = true;
      btnPlay.disabled = true;
      progress.disabled = true;
      updatePlayButton();
    } else {
      if (index === currentIndex) {
        currentIndex = index >= playlist.length ? 0 : index;
        loadTrack(currentIndex);
      } else if (index < currentIndex) {
        currentIndex--;
      }
    }
    renderPlaylist();
  }

  function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    const file = playlist[index];
    const url = URL.createObjectURL(file);

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

    btnPrev.disabled = playlist.length <= 1;
    btnNext.disabled = playlist.length <= 1;
    btnPlay.disabled = false;
    progress.disabled = false;

    renderPlaylist();
  }

  function updatePlayButton() {
    if (audio.paused) {
      btnPlay.textContent = "▶";
    } else {
      btnPlay.textContent = "⏸";
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

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Initialize empty view
  renderPlaylist();
}
