#!/usr/bin/env bash
# Restore the media / 3D / audio toolchain for Claude Code in a fresh cloud container.
# Usage (from the repo root):  bash .claude/media-setup/setup.sh            # everything
#                              SKIP_HEAVY=1 bash .claude/media-setup/setup.sh  # skip Chatterbox + ComfyUI (PyTorch, ~10 GB)
# Idempotent: re-running skips what is already there.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS="$HOME/.claude/skills"
SRC="$HOME/.cache/media-setup-src"
log() { printf '\n== %s\n' "$*"; }

# ---------- 1. System packages ----------
log "apt: blender (+EGL, numpy for glTF export)"
if ! command -v blender >/dev/null || ! python3 -c 'import numpy' 2>/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq blender libegl1 python3-numpy fonts-noto-cjk >/dev/null
fi
command -v ffmpeg >/dev/null || apt-get install -y -qq ffmpeg >/dev/null

# ---------- 2. CLI / Python tools ----------
command -v uv >/dev/null || { echo "uv is required"; exit 1; }
log "yt-dlp"
command -v yt-dlp >/dev/null || uv tool install yt-dlp

log "faster-whisper venv (~/.venvs/whisper)"
[ -x "$HOME/.venvs/whisper/bin/python" ] || uv venv -q "$HOME/.venvs/whisper"
# huggingface_hub<1 (requests-based) and av<16: newer ones break downloads behind the proxy / decode_audio
VIRTUAL_ENV="$HOME/.venvs/whisper" uv pip install -q "faster-whisper==1.2.1" "huggingface_hub<1" "av<16"

# CA bundle for model downloads: Hugging Face is passed through untouched (real public cert),
# while the default SSL_CERT_FILE only holds the proxy CAs. Combine both.
log "combined CA bundle (~/.local/share/media-tools/ca-combined.pem)"
mkdir -p "$HOME/.local/share/media-tools"
cat /usr/share/ca-certificates/mozilla/*.crt /root/.ccr/ca-bundle.crt > "$HOME/.local/share/media-tools/ca-combined.pem" 2>/dev/null || true

if [ "${SKIP_HEAVY:-0}" != "1" ]; then
  log "Chatterbox venv (~/.venvs/chatterbox, Python 3.11)"
  [ -x "$HOME/.venvs/chatterbox/bin/python" ] || uv venv -q --python 3.11 "$HOME/.venvs/chatterbox"
  VIRTUAL_ENV="$HOME/.venvs/chatterbox" uv pip install -q "chatterbox-tts==0.1.7" "setuptools<81"  # perth watermarker needs pkg_resources

  log "ComfyUI (~/ComfyUI)"
  if [ ! -d "$HOME/ComfyUI/.git" ]; then
    git clone -q https://github.com/comfyanonymous/ComfyUI "$HOME/ComfyUI"
    git -C "$HOME/ComfyUI" checkout -q 74eb0c4b8a1a894e7210326882a8d9a016e37ccb
  fi
  [ -x "$HOME/ComfyUI/.venv/bin/python" ] || uv venv -q --python 3.12 "$HOME/ComfyUI/.venv"
  VIRTUAL_ENV="$HOME/ComfyUI/.venv" uv pip install -q -r "$HOME/ComfyUI/requirements.txt"
fi

# ---------- 3. Skills (official, pinned commits) ----------
log "official skills -> $SKILLS"
mkdir -p "$SKILLS" "$SRC"
fetch() { # repo commit
  local dir="$SRC/${1//\//__}"
  [ -d "$dir/.git" ] || git clone -q --filter=blob:none --no-checkout "https://github.com/$1" "$dir"
  git -C "$dir" fetch -q --depth 1 origin "$2" 2>/dev/null || true
  git -C "$dir" checkout -q "$2"
  echo "$dir"
}
d=$(fetch remotion-dev/skills 1fc074b74b95cfecf7b1e419132f2cfe23dafebe);              cp -r "$d"/skills/*/ "$SKILLS"/
d=$(fetch greensock/gsap-skills aed9cfd3277740755f6bfc1155c7aa645403b760);            cp -r "$d"/skills/*/ "$SKILLS"/
d=$(fetch ChromeDevTools/chrome-devtools-mcp eb4b53d1621b906c1c2a323d3460f0f988d169db); cp -r "$d"/skills/*/ "$SKILLS"/
d=$(fetch pbakaus/impeccable c1e0e5492fbb524f5df84d635ecfae7dc438ec45);               cp -r "$d"/plugin/skills/impeccable "$SKILLS"/
d=$(GIT_LFS_SKIP_SMUDGE=1 fetch heygen-com/hyperframes ef5cdeb0a02afc993980809cc359dd68a1c4944d); cp -r "$d"/skills/*/ "$SKILLS"/

log "custom skills -> $SKILLS"
cp -r "$HERE"/skills/*/ "$SKILLS"/

# ---------- 4. MCP servers (user scope) ----------
log "MCP servers"
if command -v claude >/dev/null; then
  claude mcp remove --scope user chrome-devtools >/dev/null 2>&1 || true
  claude mcp remove --scope user blender >/dev/null 2>&1 || true
  CHROME="/opt/pw-browsers/chromium"; [ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
  claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@1.13.0 --headless --isolated \
    --no-usage-statistics ${CHROME:+--executablePath="$CHROME"} --chromeArg=--no-sandbox
  claude mcp add --scope user blender -- uvx mcp-for-blender@2.2.7
fi

log "done"
for c in ffmpeg yt-dlp blender; do printf '  %-8s %s\n' "$c" "$(command -v $c || echo MISSING)"; done
ls -d "$SKILLS"/*/ | wc -l | xargs printf '  skills: %s folders\n'
