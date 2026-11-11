---
name: claude-animation-base
description: Hand-painted 2D character animation (p5.js + p5.brush) starring Clawd, with storyboard-first workflow and MP4 rendering. Use when the user wants a cartoon, hand-drawn or painted animated short, or an animation of Clawd.
---

# Claude Animation Base

The starter kit lives in `claude-animation-base/` at the repo root (from github.com/JohnHeibel/ClaudeAnimationBase).

1. Read `claude-animation-base/ANIMATION_GUIDE.md` first and follow its rules and workflow (storyboard before code, contact sheets to check your work).
2. Put new scenes in `claude-animation-base/src/scenes/`.
3. Render from inside that folder: `npm install` once, then `node render.mjs --clip --out=out/video.mp4`.
   - In a cloud session add `--chrome=/opt/pw-browsers/chromium` and, with no GPU, `--soft-gl` (slow on watercolour fills; consider replacing them).
