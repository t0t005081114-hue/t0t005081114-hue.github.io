---
name: threejs
description: Best practices for Three.js (WebGL 3D) — scene setup, renderer/color management, GLTF loading, lighting, animation loop, resize, disposal, performance, and deterministic frame-driven rendering for video (Remotion @remotion/three, HyperFrames, GSAP). Use when building 3D scenes, product viewers, 3D logos or 3D elements in a website or video.
---

# Three.js

Install per project: `npm i three` (types included). Import addons from `three/addons/...` (e.g. `three/addons/loaders/GLTFLoader.js`, `three/addons/controls/OrbitControls.js`). In a plain HTML page use an import map pointing at a pinned CDN version.

## Minimal correct setup

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;      // default in r152+, keep it
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(3, 5, 2); scene.add(key);

const gltf = await new GLTFLoader().loadAsync('/model.glb');
scene.add(gltf.scene);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop((t) => { gltf.scene.rotation.y = t * 0.0005; renderer.render(scene, camera); });
```

## Rules

- Color textures (`map`, `emissiveMap`) need `texture.colorSpace = THREE.SRGBColorSpace`; data textures (normal, roughness) stay linear.
- Reuse geometries/materials; for many copies use `InstancedMesh`. Keep draw calls low.
- On teardown call `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, `renderer.dispose()` (React: in effect cleanup).
- Cap pixel ratio at 2; shadows only where they matter (`castShadow` sparingly, small shadow map).
- Compress models: glTF + Draco/Meshopt; export from Blender as `.glb` (see `blender` skill).

## For video (deterministic rendering)

Never animate from wall-clock time or `requestAnimationFrame` deltas in a video render. Drive everything from the frame number:
- **Remotion**: use `@remotion/three` `<ThreeCanvas>` and `useCurrentFrame()`; set `gl={{ preserveDrawingBuffer: true }}`.
- **HyperFrames / GSAP**: put values in a paused GSAP timeline and render inside its `onUpdate`, so seeking a frame reproduces the same image.
- Headless Chromium here has no GPU: it uses SwiftShader (software). Keep scenes light; render at final size only.

## Verify

Open the page in the `chrome-devtools` MCP, check the console for WebGL errors, take a screenshot, and run a performance trace if it stutters.
