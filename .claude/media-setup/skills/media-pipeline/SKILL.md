---
name: media-pipeline
description: Map of the local video/3D/audio toolchain in this environment (Remotion, HyperFrames, GSAP, Three.js, FFmpeg, yt-dlp, faster-whisper, Chatterbox, Blender, ComfyUI, Chrome DevTools MCP, Blender MCP, Impeccable) — where each tool is installed, which skill to load for it, and how they chain together. Read first when a request spans more than one of these tools (e.g. "transcribe this clip and add animated captions", "make a promo video with a 3D logo and voiceover").
---

# Media pipeline: tool map

## Where things are installed

| Tool | How to call it | Skill to load |
|---|---|---|
| FFmpeg 6.1 | `ffmpeg`, `ffprobe` (on PATH) | `ffmpeg` |
| yt-dlp | `yt-dlp` (on PATH, installed with `uv tool`) | `yt-dlp` |
| faster-whisper | `~/.venvs/whisper/bin/python` | `faster-whisper` |
| Chatterbox TTS | `~/.venvs/chatterbox/bin/python` | `chatterbox-tts` |
| Blender 4.0 | `blender -b ... --python script.py` | `blender` |
| ComfyUI | `~/ComfyUI` (own `.venv`), API on `127.0.0.1:8188` | `comfyui` |
| Remotion | per project: `npx create-video@latest`, `npx remotion render` | `remotion-best-practices` (router) |
| HyperFrames | per project: `npx hyperframes ...` | `hyperframes` (read first) |
| GSAP | per project: `npm i gsap` | `gsap-core`, `gsap-timeline`, ... |
| Three.js | per project: `npm i three` | `threejs` |
| Impeccable | skill only (design audit/polish) | `impeccable` |
| Chrome DevTools MCP | MCP server `chrome-devtools` (headless Chromium) | `chrome-devtools` |
| Blender MCP | MCP server `blender` (needs Blender with addon running) | `blender` |

Chromium for headless rendering: `/opt/pw-browsers/chromium`.

Verified render commands in this container:
- Remotion (its own Chrome download may be blocked, so point it at the preinstalled headless shell):
  `npx remotion render src/index.ts <CompId> out.mp4 --browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
  (the `-1243` build number can change; `ls /opt/pw-browsers` to find it)
- HyperFrames: `npx hyperframes init <dir> --example=blank --non-interactive` → `cd <dir> && npx hyperframes render -o out.mp4` (uses software GPU, works headless).
- Blender: `blender -b --factory-startup --python script.py` (Cycles CPU or Workbench).

## Choosing the video engine

- **Remotion**: React components, frame-based (`useCurrentFrame`), good for data-driven or templated videos. Commercial use by companies may need a paid license (see `remotion-license`).
- **HyperFrames**: plain HTML + CSS/GSAP rendered to MP4, has a block registry of ready-made transitions/titles. Good default for motion graphics written by an agent.
- Do not mix both in one project; `remotion-to-hyperframes` converts one to the other.

## Typical chains

1. **Captioned clip**: `yt-dlp` (or local file) → `ffmpeg` extract 16 kHz mono WAV → `faster-whisper` with `word_timestamps=True` → JSON → captions in Remotion (`remotion-captions`) or HyperFrames → render → `ffmpeg` final encode.
2. **Narrated explainer**: script text → `chatterbox-tts` WAV per scene → `ffprobe` durations decide scene lengths → HyperFrames/Remotion composition → render.
3. **3D asset in video**: `blender -b` renders a PNG sequence with alpha (or exports GLB) → place as `<img>` sequence / video in the composition, or load GLB with Three.js.
4. **Web animation QA**: build page with GSAP/Three.js → open in `chrome-devtools` MCP → screenshot, performance trace → `impeccable` audit.

## Environment limits (cloud session)

- No GPU: Whisper, Chatterbox and ComfyUI run on CPU (slow; use small models, short clips).
- Hugging Face is allowed in the "media tools" environment; `youtube.com`, `download.pytorch.org`, `download.blender.org` stay blocked. If a download fails with `CONNECT tunnel failed, response 403`, the host is blocked: tell the user which host needs to be allowed instead of retrying.
- Everything outside the git repo is lost when the container is recycled. Restore with `bash .claude/media-setup/setup.sh`.

## Model downloads (Hugging Face) in this cloud environment

Set these before any command that downloads models. Without them you get `CERTIFICATE_VERIFY_FAILED`, or the Xet transfer hangs:
```bash
export SSL_CERT_FILE=~/.local/share/media-tools/ca-combined.pem REQUESTS_CA_BUNDLE=~/.local/share/media-tools/ca-combined.pem HF_HUB_DISABLE_XET=1
```
(created by `.claude/media-setup/setup.sh`; Hugging Face hosts are allowed in the "media tools" environment).
