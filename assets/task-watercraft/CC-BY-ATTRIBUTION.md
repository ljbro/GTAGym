# Boat GLB attribution and provenance

These three files are **CC BY 4.0**, not covered by the Kenney CC0 license in the adjacent `License.txt`. Attribution must remain with redistributed assets/builds. License: <https://creativecommons.org/licenses/by/4.0/>.

| Local source GLB | Work | Creator | Original source |
| --- | --- | --- | --- |
| `sources/motoryacht-35.glb` | motoryacht 35 | angelo raffaele catalano | <https://sketchfab.com/3d-models/motoryacht-35-0bdd7a0de7254426890bb5745bb7da6d> |
| `sources/seadoo-gti.glb` | 2012 Sea-Doo GTI SE 130 | BoatUS Foundation | <https://sketchfab.com/3d-models/2012-sea-doo-gti-se-130-d7b3e903d7dc43a694720bd347f4fadf> |
| `sources/zodiac.glb` | Zodiac boat | RedC130 | <https://sketchfab.com/3d-models/zodiac-boat-a10b7997f1514bd7829ece74f68c681c> |

Downloaded as browser-ready GLBs redistributed by [Open Water](https://github.com/bob6664569/open-water), pinned to commit `285b6ce32057c70191a7fe16c31d979fa383ac64` under `site/assets/boats/`. Upstream filenames: `motoryacht_10.7r.glb`, `seadoo-gti_3.4.glb`, `zodiac_boat.glb`. Upstream [third-party notices](https://github.com/bob6664569/open-water/blob/285b6ce32057c70191a7fe16c31d979fa383ac64/THIRD_PARTY_NOTICES.md) describe these as browser-ready GLBs of the original works.

GTAbench changes to these source copies: local filenames only. No geometry/texture conversion yet. Do not label the sources as newly authored by GTAbench or infer that an asset's license is MIT from the upstream application's license.

Verified on 2026-10-07 against the **original Sketchfab API**: all three are downloadable, `license.slug=by`, with license URL CC BY 4.0. The corresponding `sources/*-source.json` files preserve that API evidence, authors and model IDs. The non-commercial Frickie's Yacht was not imported.

`motoryacht-35.glb` is now used in c06-n08, c06-n09 and c06-n10. Runtime changes: uniform scaling to 10.7 m length, horizontal centering and bottom-pivot normalization, 180-degree heading correction, -0.55 m waterline offset and slight bob/roll. Original GLB bytes remain unchanged. Bow direction, waterline and stern boarding surface were inspected with the actual model; driving avatar currently stands on the stern platform rather than sitting at the helm. Author and license are indexed in the repository ACKNOWLEDGEMENTS.md and retained in these asset notices.

`zodiac.glb` is used in c06-n05 and c06-n07. Runtime changes: uniform scale to 6.3 m length (corrected from the undersized 4.2 m fit on 2026-10-08), horizontal centering and bottom-pivot normalization in the model's local frame, 180-degree heading correction, -0.36 m waterline offset and slight bob/roll. Original GLB bytes remain unchanged. The rendered hull is about 2.368 m wide; collision dimensions, side boarding point and helm seat were updated together. Characters now walk from the boarding platform and sit at the helm, following the boat transform. Source credit (Zodiac, RedC130, CC BY 4.0) remains in Esc.

The motoryacht also now uses a seated helm character and an additional runtime-generated captain's seat with a supported pedestal behind the console. No geometry is removed from the source GLB. Character poses and the supplementary seat are project adaptations, not author-supplied animations or original GTA assets.

Additional native coastal driving tasks: c06-n06 uses `motoryacht-35.glb` according to its human description, despite the source title saying jet ski; c06-n07 uses `zodiac.glb`. Both begin aboard, use the same unmodified GLB files/runtime transforms and include creator/license credits in Esc. Standing driver poses remain an acknowledged visual limitation, not original GTA driving animations.

c06-n11 also uses `motoryacht-35.glb`, following its description "Beach the yacht". Runtime height/pitch are fitted to the continuous beach surface while grounded; original GLB bytes and textures remain unchanged. Esc credits angelo raffaele catalano / CC BY 4.0. Powered beach approach and standing deck pose are simplified gameplay adaptations, not original GTA or real yacht-grounding physics.

`seadoo-gti.glb` is used for the player and water pursuers in c05-n15 and c05-n16. Runtime changes: stop source animation and bake skinned vertices before sizing/cloning; uniformly scale to 3.4 m length (about 1.281 m width), center horizontally, normalize the bottom pivot, keep heading at zero, and place the bottom 0.13 m below water. Foot-pad and registration materials receive a depth bias to reduce overlapping-surface shimmer; this is not a source-texture edit. Original GLB bytes remain unchanged. A procedural seated Franklin pose and red/blue pursuer lamps are separate GTAbench additions, not authored by BoatUS Foundation. Esc includes the original creator and CC BY 4.0 credit. Overhead surface shimmer and police-specific character appearance remain visual follow-ups. Original API license was rechecked on 2026-10-08.
