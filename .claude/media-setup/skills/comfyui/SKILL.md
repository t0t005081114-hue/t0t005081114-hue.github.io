---
name: comfyui
description: Run ComfyUI (node-based Stable Diffusion / image & video generation) headless and drive it through its HTTP API — start the server, place models, submit API-format workflow JSON, poll history and fetch outputs. Use for AI image/video generation, img2img, upscaling or background removal pipelines that should run locally.
---

# ComfyUI

Location: `~/ComfyUI` with its own venv `~/ComfyUI/.venv`. CPU only in this cloud session (very slow for SD; fine for small models and tests).

## Start

```bash
cd ~/ComfyUI && .venv/bin/python main.py --cpu --listen 127.0.0.1 --port 8188 > ~/comfyui.log 2>&1 &
curl -s 127.0.0.1:8188/system_stats   # ready check
```
Run it in the background (Bash `run_in_background`), wait for the ready check, then submit work.

## Models

Put files in `~/ComfyUI/models/<type>/` — `checkpoints/`, `vae/`, `loras/`, `upscale_models/`, `clip/`, `unet/`, `controlnet/`. Model hubs (huggingface.co, civitai.com) may be blocked by the network policy; if a download returns `CONNECT tunnel failed, response 403`, ask the user to allow the host or to provide the file. Respect each model's license.

## Run a workflow through the API

Workflows must be in **API format** (in the UI: Settings → enable Dev mode → "Save (API Format)"). Each key is a node id: `{"3": {"class_type": "KSampler", "inputs": {...}}}`.

```python
import json, time, urllib.request, uuid
BASE = "http://127.0.0.1:8188"
wf = json.load(open("workflow_api.json"))
wf["6"]["inputs"]["text"] = "a cozy cafe interior, morning light"   # edit prompt node
req = urllib.request.Request(f"{BASE}/prompt", data=json.dumps({"prompt": wf, "client_id": str(uuid.uuid4())}).encode(),
                             headers={"Content-Type": "application/json"})
pid = json.load(urllib.request.urlopen(req))["prompt_id"]
while True:
    hist = json.load(urllib.request.urlopen(f"{BASE}/history/{pid}"))
    if pid in hist: break
    time.sleep(2)
for node in hist[pid]["outputs"].values():
    for img in node.get("images", []):
        print(f"{BASE}/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}")
```
Outputs are also written to `~/ComfyUI/output/`.

## Rules

- Validate errors from `/prompt` (HTTP 400 lists the bad node and input) before retrying.
- Custom nodes (`~/ComfyUI/custom_nodes/`) run arbitrary Python: install only ones the user chose, from their official repos.
- Generated images for videos: keep a fixed `seed` for reproducibility and note it.

## Model downloads (Hugging Face) in this cloud environment

Set these before any command that downloads models. Without them you get `CERTIFICATE_VERIFY_FAILED`, or the Xet transfer hangs:
```bash
export SSL_CERT_FILE=~/.local/share/media-tools/ca-combined.pem REQUESTS_CA_BUNDLE=~/.local/share/media-tools/ca-combined.pem HF_HUB_DISABLE_XET=1
```
(created by `.claude/media-setup/setup.sh`; Hugging Face hosts are allowed in the "media tools" environment).
