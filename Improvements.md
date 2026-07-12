# Improvements to be made

## Bugs

[x] Decibel meter freezing when the oscilioscope turned off: likely because the caluculation of decibel meter depends on the code of oscilioscope

Volume tips in the two spectrums don't show when in full screen mode: CSS/JS issue?

[x] The side bar content doesn't fit in the width and it's scrollable: CSS issue

The high frequency audio in the audio spectrum is not showing properly: looks silenced?

Restarting microphone resulting in a lost microphone access permission

Benchmarking freezes realtime analysis

Rendering time and FPS don't match

[x] Snapshot/Microphone audio spectrum wave don't match/is not full width when sidebar collapsed - overdoing frequency analysis going over intended range. Might not be caluculating oversized frequency range, but probably just a problem with displaying/caluculation of resizing.

Dragging over spectrum both point blue shade to mic spectrum - should not happen, only should happen on mic spectrum - also, audio playback is not working

Auto EQ refering to the already Equalizer-manipulated track - should point the original track for better accuracy

Pink noise not being pink noise in audio gen

Changing microphone while analyzing results in lost microphone permission

Coherency graph being stuck when audio playback stops

## Performance issue

[x] Mic/audio spectrum's peak freq is updating too quickly: reduction to 1s or 0.5s

[x] Audio player's CSS overlay causing performance issue: reduction of visual effect

FPS unstable: resolving performance bottlenecks

Coherence graph might be decreasing the overall efficiency and health: consider reducing update span(realtime -> 0.1s)

Random FPS drop; some jobs in the background that takes much resources might be the culplit(e.g. coherencey calculation)

## Improvements

Volume tips design should be more stylish: CSS

[x] Audio delay caluculation/coherency is probably not working as expected: dig into logics and find better alternatives/improvements

Auto EQ presets: live/3D/theatre/outdoor/indoor-large/indoor-middle/indoor-small/headphone/earphone

Auto silence cutting in audio player: option to skip silence span in a song

[x] Better icons in audio player: using SVG to maintain coherenct appearance in all devicesx

Make sure benchmarking uses the current analysis/generation method to test

Make sure rendering time takes into account all the displayes being generated

Reduce load of audio spectrum: quite significantlly affecting overall performance and UX

No sleep mode/button

Keyboard shortcuts for audio player

Space for playing/pausing

Arrow key(left/right) for skipping/backing songs

Up/down for volume

F for fading in/out the audio

Including generator's audio into audio spectrum and caluculation of coherence

Auto DJ/Shuffle

YouTube download function

Anti-Wrong click feature for audio player: keyboard shortcuts requrie double tap for confirmation

[x] Audio output device selection should be just below the input device selection

[x] Organization in the side bar should be more tidy - too messed up

Auto gain adjustment

Codebase refactoring - splitting into multi files or function files

## Target

Bug free

Logic complete

Fast(should work on Chromebook with stable 60>=fps with all features enabled)
