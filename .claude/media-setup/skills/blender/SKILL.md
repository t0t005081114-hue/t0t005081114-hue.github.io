---
name: blender
description: Run Blender headless with its Python API (bpy) — build or modify scenes by script, render stills/PNG sequences with alpha, export GLB for Three.js/web, batch-convert models — and how to use the Blender MCP server for live control. Use for any 3D modeling, 3D render, or Blender automation request.
---

# Blender

Binary: `blender` (Blender 4.0 from Ubuntu apt; needs apt packages `libegl1 python3-numpy`). No GUI and no GPU in this cloud session: always use background mode. Engines that work here: `CYCLES` with `device="CPU"` (final quality) and `BLENDER_WORKBENCH` (fast previews). `BLENDER_EEVEE` needs a GPU/EGL and fails here. Draco compression on glTF export is not available in the apt build (export uncompressed GLB, or compress later with `npx gltf-transform draco`). A harmless `EGL Error ... EGL_NOT_INITIALIZED` line may be printed.

## Run a script headless

```bash
blender -b --factory-startup --python make_scene.py -- --out /abs/path/render
blender -b scene.blend -E CYCLES -o //frames/f_#### -s 1 -e 120 -a   # render animation of an existing file
```
Arguments after `--` reach the script via `sys.argv[sys.argv.index("--")+1:]`.

## Script template

```python
import bpy, sys, math
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.mesh.primitive_monkey_add(location=(0, 0, 0))
obj = bpy.context.active_object
bpy.ops.object.shade_smooth()
mat = bpy.data.materials.new("Mat"); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.1, 0.4, 1, 1)
obj.data.materials.append(mat)

bpy.ops.object.camera_add(location=(0, -4, 1.2), rotation=(math.radians(80), 0, 0)); scene.camera = bpy.context.active_object
bpy.ops.object.light_add(type="AREA", location=(2, -2, 3)); bpy.context.active_object.data.energy = 500

obj.rotation_euler = (0, 0, 0); obj.keyframe_insert("rotation_euler", frame=1)
obj.rotation_euler = (0, 0, math.radians(360)); obj.keyframe_insert("rotation_euler", frame=120)

scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 32
scene.render.resolution_x, scene.render.resolution_y = 1080, 1080
scene.render.film_transparent = True                    # alpha for compositing in video
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
scene.frame_start, scene.frame_end = 1, 120
scene.render.filepath = (argv[1] if len(argv) > 1 else "/tmp/render") + "/f_"
bpy.ops.render.render(animation=True)
bpy.ops.export_scene.gltf(filepath=scene.render.filepath.rstrip("f_") + "model.glb", export_format="GLB")
```

Then: PNG sequence → video/ProRes with the `ffmpeg` skill; GLB → web with the `threejs` skill.

## Rules

- Use `bpy.data` / direct property access instead of `bpy.ops` where possible (ops depend on context and fail in background mode).
- Use absolute paths; `//` means "relative to the .blend file".
- Keep samples low and resolution final-size on CPU; render a single frame first (`-f 1`) to check before the full animation.
- Japanese text objects need a CJK font loaded with `bpy.data.fonts.load("/usr/share/fonts/...")`.

## Blender MCP (live control)

The MCP server `blender` (`uvx mcp-for-blender@2.2.7`) talks to an addon running inside an open Blender (socket, port 9876). It is meant for Blender with a GUI on the user's own computer:
1. `uvx mcp-for-blender install-addon` on that computer, then in Blender: Edit → Preferences → Add-ons → enable "MCP for Blender".
2. In the 3D viewport press N → "MCP for Blender" tab → Start MCP Server.
3. Restart Claude; the `blender` MCP tools (get scene info, run code, etc.) then work.
In this cloud container there is no Blender GUI, so prefer the headless script method above. Blender MCP "execute code" runs arbitrary Python in Blender: only run code you wrote and understand.
