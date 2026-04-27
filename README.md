# Video Progressive Blur

Bake a progressive blur and tinted gradient into one edge of an MP4 — for thumbnail videos where text needs to stay legible over the affected area.

Everything runs in your browser.

[![Open in browser]][Link]

## Features

- Drop-zone input for MP4 / MOV / M4V (or load a bundled Big Buck Bunny clip).
- Progressive blur on any edge — bottom, top, left, or right — with configurable coverage, max radius, and layer count.
- Tinted linear gradient behind the blur, sampled from the dominant colour of the affected region. Modes: per frame, batched + eased, static, or manual hex.
- Lossless passthrough where possible: source codec, dimensions, frame rate, and average bitrate are mirrored on the output. Audio is copied through without re-encoding.
- Live preview, custom scrub controls, render progress + cancel, settings persisted between sessions.

[Link]: https://joshuabaker.github.io/video-progressive-blur/ 'Open the hosted app'

[Open in browser]: https://img.shields.io/badge/Open_in_browser_%E2%86%97-7c9cff?style=for-the-badge
