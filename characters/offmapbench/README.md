# OffMapBench player asset

## Pedestrian follow target (2026-10-09)

`michael.glb` and its adjacent provenance are copied unchanged from
`offmapbench/assets/gta-v/characters/`. SHA-256:
`992b8e0e01822fa1e414fd70e2c36f9af59481ac1e9b2d1ff03d61322f3406d7`.
Native pedestrian follow tasks use Michael instead of the player Franklin.
This is a visual substitution, not a claim that Michael is the person in every
source video. The 1.933 m rig is displayed at 1.78 m, with embedded idle/walk/run
clips. Player and target own independent skeletons and materials.

Michael mesh/textures: Rockstar North; export: Vados.
Source: https://p3dm.ru/files/characters/human/1144-michael-.html
The same personal-use / redistribution limitations and donor-animation
attributions below apply; this is not a CC0 or MIT asset. The Franklin-specific
elbow rebind is not applied to Michael.

`franklin.glb` and `franklin.provenance.json` are copied unchanged from
`offmapbench/assets/gta-v/characters/`. The corrected GLB SHA-256 is
`0d0f8f80dfd9e59186a858dddba5398bf38eecab2c11cb5b8d782f65e8ebd964`.
The original pre-fix hash was
`c7bd1423220b7c73769ed00cbfa60061b5a554edf0585f6f9539e126923c8c32`.

Original mesh/textures: Grand Theft Auto V, Rockstar North; export: Vados.
Source: https://p3dm.ru/files/characters/human/1143-franklin-.html
These third-party assets are not covered by GTA_SZ's MIT code license and are
not CC0. OffMapBench's source documentation describes personal-use exports;
no broader redistribution license is asserted here.

The 53-joint rig and idle/walk/run/wave animations were prepared by OffMapBench:
MakeHuman/vsim donor skeleton and idle/wave, retargeted Mixamo locomotion from
the Three.js r180 Soldier example. They are not original GTA V animations.
See the adjacent provenance for source hashes and conversion details.

The shared `franklin-elbow-rebind-v1` fix aligns the donor elbow bind frames to
the actual sleeve mesh and updates inverse bind matrices / joint translations.
Geometry, normals, UVs, textures, skin weights and rotation clips are unchanged.
The unmodified pre-fix asset is backed up locally under
`offmapbench/artifacts/arm-repair/`; the reproducible repair script is
`offmapbench/scripts/rebind-franklin-arms.mjs`.

GTA_SZ uses the same corrected GLB and embedded textures, scales the player from
1.933 to 1.78 game units at runtime, and blends idle/walk/run with its existing
walking controller. Only the controllable player is replaced; cafe NPC assets
are unchanged. Loading failure offers retry, not a fallback cartoon avatar.
