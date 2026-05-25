import("./js/app.js")
  .then(({ initApp }) => {
    initApp();
  })
  .catch((err) => {
    console.error("Failed to initialize app:", err);
  });

import("./js/bottomPlayer.js")
  .then(({ initBottomPlayer }) => {
    initBottomPlayer();
  })
  .catch((err) => {
    console.error("Failed to initialize bottom player:", err);
  });
