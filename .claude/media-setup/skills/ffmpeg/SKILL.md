---
name: ffmpeg
description: Recipes and rules for FFmpeg/ffprobe — convert, trim, concat, scale/crop to 9:16 or 16:9, burn subtitles, mix/duck audio, extract audio for speech recognition, make GIFs, image sequences to video, and web-safe H.264 delivery. Use for any video or audio file conversion, editing, compositing or inspection task.
---

# FFmpeg

Binary: `ffmpeg` / `ffprobe` (v6.1, on PATH). Always add `-hide_banner -y` in scripts; use `-nostdin` when running in a loop.

## Inspect first

```bash
ffprobe -v error -show_entries format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels -of json in.mp4
```
Never guess duration, fps or resolution — read them.

## Safe delivery encode (plays everywhere, incl. iPhone / web / LINE)

```bash
ffmpeg -i in.mov -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart out.mp4
```
`-pix_fmt yuv420p` and even width/height are mandatory for compatibility (`scale=trunc(iw/2)*2:trunc(ih/2)*2`).

## Common recipes

| Task | Command core |
|---|---|
| Trim (accurate) | `-ss 00:00:05 -to 00:00:15 -i in.mp4 -c:v libx264 -c:a aac` (re-encode; `-c copy` cuts only on keyframes) |
| Speech-recognition audio | `-i in.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le audio.wav` |
| 16:9 → 9:16 (blur fill) | `-filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2"` |
| Burn subtitles | `-vf "subtitles=subs.srt:force_style='FontName=Noto Sans CJK JP,FontSize=14,Outline=2'"` |
| Image sequence → video | `-framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4` |
| PNG seq with alpha → ProRes | `-framerate 30 -i f_%04d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out.mov` |
| Concat same-codec files | list.txt with `file 'a.mp4'` lines → `-f concat -safe 0 -i list.txt -c copy out.mp4` |
| Replace audio | `-i video.mp4 -i voice.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest out.mp4` |
| Duck BGM under voice | `-filter_complex "[1:a][0:a]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[bg];[bg][0:a]amix=inputs=2:duration=first"` (0=voice, 1=bgm) |
| Loudness normalize (web) | `-af loudnorm=I=-14:TP=-1.5:LRA=11` |
| GIF (good palette) | `-vf "fps=15,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse"` |
| Thumbnail at 3s | `-ss 3 -i in.mp4 -frames:v 1 thumb.jpg` |
| Contact sheet for review | `-vf "fps=1,scale=320:-1,tile=4x3" -frames:v 1 sheet.png` |

## Rules

- Put `-ss` before `-i` for fast seek; re-encode if the cut must be frame-accurate.
- Use `-filter_complex` with labeled pads when there is more than one input.
- Japanese text: use a CJK font (`fc-list :lang=ja`); install `fonts-noto-cjk` with apt if none.
- After rendering, verify with `ffprobe` and look at a frame (`-frames:v 1`) before reporting success.
- No GPU encoders here (no NVENC); use libx264/libx265/libvpx-vp9.
