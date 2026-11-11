---
name: yt-dlp
description: Download or inspect online video/audio with yt-dlp — list formats, get best MP4, audio-only, a time range, subtitles, metadata JSON. Use when the user gives a video URL (YouTube, X, Vimeo, TikTok, etc.) to fetch, analyze or reuse as source material.
---

# yt-dlp

Binary: `yt-dlp` (installed with `uv tool install yt-dlp`; update with `uv tool upgrade yt-dlp`). FFmpeg is on PATH, so merging works.

## Before downloading

- Only download content the user has the right to use (their own, licensed, or for analysis they are entitled to). Do not help bypass DRM or paywalls.
- Inspect first: `yt-dlp -F URL` (formats) or `yt-dlp -J --skip-download URL > meta.json` (title, duration, chapters).

## Recipes

```bash
# Best quality as MP4 (H.264/AAC when available)
yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" --merge-output-format mp4 -o "%(title).80s [%(id)s].%(ext)s" URL

# Max 1080p
yt-dlp -S "res:1080,ext:mp4:m4a" -o "%(id)s.%(ext)s" URL

# Audio only (for transcription)
yt-dlp -x --audio-format wav -o "%(id)s.%(ext)s" URL

# Only a section
yt-dlp --download-sections "*00:01:30-00:02:10" --force-keyframes-at-cuts -o clip.mp4 URL

# Subtitles (existing + auto), no video
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "ja,en" --convert-subs srt URL
```

## Troubleshooting

- `CONNECT tunnel failed, response 403`: the site is blocked by this environment's network policy (youtube.com is blocked by default). Tell the user the host must be allowed in the environment's network settings, or ask them to upload the file.
- "Sign in to confirm you're not a bot": needs `--cookies cookies.txt` exported by the user; never ask for passwords.
- Outdated extractor errors: `uv tool upgrade yt-dlp`.
