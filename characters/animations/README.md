# Swimming animation source

## Ground action update(2026-10-10)

`quaternius-ground-v1.json` Use the official free Standard of the package `Walk_Loop`, `Sprint_Loop`, `ClimbUp_1m`, The License Remains CC0. Download original package, Permission, SHA-256 and the complete list of free animations are saved in `previews/movement-animations/`(Original ZIP Located in `sources/`). Author page: https://quaternius.itch.io/universal-animation-library and https://quaternius.itch.io/universal-animation-library-2 . 

As requested by the user, Ground Franklin walking and sprinting have been restored to the original GLB Within `walk` / `run` Animation, Also restore the original manifest Stride length and step frequency parameters for. Quaternius walking/Sprint data is retained only for preview and backup, Do not integrate into the production game; Character Model, Movement speed, Other character settings and swimming animations remain unchanged. Keep only the following new actions c07-n01 Climb onto a ledge. 

Based on user constraints, `ClimbUp_1m` **Only used for c07-n01 of `climb:pickup-hood` and `climb:pickup-roof` Forward Climbing**. It plays in sync with the current climbing progress, Pickup truck/The actual rooftop height and collision-validated physical path remain unchanged; Includes minor hand contact corrections constrained by arm length. Descend, Climbing in other tasks, Ladder, Hurdle, Do not replace jumping. 1 meter asset adapted to the actual countertop height in this task, Does not represent measured heights from footage or actions. 

Reproduce: Run from the repository root `node native-city/scripts/build-ground-animation.mjs`. The inputs are two items with original animations in the preview directory GLB; Output bound to the current Franklin GLB of SHA-256. No paid assets were purchased or included. 

Original swimming animation records follow: 

- Author: Quaternius; Universal Animation Library **Standard Free Version**. 
- Official: https://quaternius.itch.io/universal-animation-library
- Permission: CC0 1.0, For the full text, see `QUATERNIUS-CC0.txt`. 
- Download mirror(2025-06-10 free version save data for): https://github.com/J-Ponzo/gltf-universal-animation-library
- Pinned Version: `e24c23cf2a1323488a3faa226ea7ea21f644b73e`. 
- Original File: `glTF/AnimationLibrary_Godot_Standard.gltf` and in the Same Directory `.bin`. 
- Use action: `Swim_Fwd_Loop`(about 1.333 seconds, Stroke with Both Arms/Kick), `Swim_Idle_Loop`(about 3.333 seconds, Tread Water in Place). Not Used Pro or pay Source Content. 

`quaternius-swim.json` Is the above animation retargeted to the existing Franklin Derived data after the skeleton; 30 Hz Sampling, Runtime quaternion interpolation. Preserve the animated shoulder, elbow, Finger, Spine and leg movement, Does not include source model meshes. Character Appearance, Original GLB And mission physics rules remain unchanged. 

Reproduce: The above pinned version of glTF and bin Download to the same directory(bin Name Unchanged), at `native-city` Execute: 

```sh
node scripts/build-swim-animation.mjs /path/to/AnimationLibrary_Godot_Standard.gltf
```

Artifact Recording Target GLB of SHA-256. Regenerate and validate after changes to the target rig, Do not copy bone Euler angles directly. The source package skeleton is T Pose, Franklin for A Pose: The export script corrects the reference pose, Retarget world rotation according to the parent-child hierarchy, Preserve target bone lengths and displacement. 
