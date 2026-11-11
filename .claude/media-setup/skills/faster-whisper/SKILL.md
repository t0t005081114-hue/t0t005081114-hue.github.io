---
name: faster-whisper
description: Local speech-to-text with faster-whisper (CTranslate2 Whisper) — transcribe Japanese/English audio or video to text, SRT/VTT subtitles, or word-level timestamps JSON for animated captions in Remotion/HyperFrames. Use for 文字起こし, subtitles, captions, meeting/商談 recording transcription.
---

# faster-whisper

Python env: `~/.venvs/whisper/bin/python` (faster-whisper 1.2, CPU only here).

## Steps

1. Extract clean audio: `ffmpeg -hide_banner -y -i in.mp4 -vn -ac 1 -ar 16000 audio.wav`
2. Run the script below. Model choice on CPU: `small` (fast) → `medium` → `large-v3` (best Japanese, slow). Use `compute_type="int8"` on CPU.
3. Check a few lines against the audio before using the result.

```python
# save as transcribe.py ; run: ~/.venvs/whisper/bin/python transcribe.py audio.wav ja
import sys, json
from faster_whisper import WhisperModel

path, lang = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    path, language=lang, vad_filter=True, word_timestamps=True, beam_size=5,
    initial_prompt="以下は日本語の会話です。句読点を付けてください。" if lang == "ja" else None,
)

def ts(t, sep=","):
    h, r = divmod(t, 3600); m, s = divmod(r, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02}{sep}{int((s % 1) * 1000):03}"

out, srt = [], []
for i, seg in enumerate(segments, 1):
    out.append({"start": seg.start, "end": seg.end, "text": seg.text.strip(),
                "words": [{"start": w.start, "end": w.end, "word": w.word} for w in (seg.words or [])]})
    srt.append(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n")
json.dump(out, open("transcript.json", "w"), ensure_ascii=False, indent=1)
open("transcript.srt", "w").write("\n".join(srt))
print(info.language, info.duration, "s ->", len(out), "segments")
```

## Notes

- Model weights download from `huggingface.co` on first use (cache `~/.cache/huggingface`). If it fails with `CONNECT tunnel failed, response 403`, that host is blocked by the environment network policy: tell the user it must be allowed, or have them place a converted model folder locally and pass its path to `WhisperModel("/path/to/model")`.
- Long audio: VAD filter cuts silence and speeds things up. Process in the background and report progress.
- For Remotion captions, `transcript.json` word timings map to `@remotion/captions` `Caption` objects (`startMs = start*1000`).
- Transcripts of business calls can contain personal data: keep them local, don't upload.
