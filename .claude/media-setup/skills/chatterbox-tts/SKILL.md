---
name: chatterbox-tts
description: Local text-to-speech with Resemble AI Chatterbox (incl. multilingual model for Japanese, emotion/exaggeration control, zero-shot voice cloning from a short reference WAV) to make narration/voiceover WAV files for videos. Use for ナレーション, voiceover, TTS, 読み上げ requests.
---

# Chatterbox TTS

Python env: `~/.venvs/chatterbox/bin/python` (package `chatterbox-tts`, PyTorch on CPU here — slow, generate scene by scene).

## Japanese / multilingual

```python
# run: ~/.venvs/chatterbox/bin/python tts.py
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
lines = ["こんにちは。今日は新しいサービスをご紹介します。", "まずは三つのポイントから。"]
for i, text in enumerate(lines, 1):
    wav = model.generate(text, language_id="ja",
                         exaggeration=0.5,   # 0.25 calm … 0.7+ expressive
                         cfg_weight=0.5)     # lower (≈0.3) = slower, clearer pacing
                         # audio_prompt_path="ref.wav"  # optional voice cloning, 5–10 s clean speech
    ta.save(f"vo_{i:02}.wav", wav, model.sr)
```

English-only model: `from chatterbox.tts import ChatterboxTTS` → `model.generate(text)`.

## Workflow for video

1. Split the script into one sentence/scene per file (short inputs sound better and fail less).
2. Generate WAVs, then measure: `ffprobe -v error -show_entries format=duration -of csv=p=0 vo_01.wav`.
3. Use those durations to set scene lengths in Remotion/HyperFrames.
4. Join/normalize with FFmpeg (`loudnorm=I=-16`), mix BGM with ducking (see `ffmpeg` skill).

## Notes

- Weights download from `huggingface.co` (ResembleAI/chatterbox) on first run. If blocked (`CONNECT tunnel failed, response 403`), tell the user that host must be allowed in the environment network settings.
- Output has an inaudible Perth watermark (by design; keep it).
- Voice cloning: only clone a voice with that person's consent. Never imitate a real person without permission.

## Model downloads (Hugging Face) in this cloud environment

Set these before any command that downloads models. Without them you get `CERTIFICATE_VERIFY_FAILED`, or the Xet transfer hangs:
```bash
export SSL_CERT_FILE=~/.local/share/media-tools/ca-combined.pem REQUESTS_CA_BUNDLE=~/.local/share/media-tools/ca-combined.pem HF_HUB_DISABLE_XET=1
```
(created by `.claude/media-setup/setup.sh`; Hugging Face hosts are allowed in the "media tools" environment).
