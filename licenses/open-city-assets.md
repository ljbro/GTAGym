# Free asset sources for this round

## 2026-10-23 Background NPC Vehicle

| Assets | Original publisher and page | Release page license | Purpose |
| --- | --- | --- | --- |
| White four-door sedan | [Innerscene](https://www.innerscene.com/tools/library/3d-parts/white-four-door-sedan-1f271353) | CC0-1.0 | Hyundai Sedan: Silver gray, Burgundy Paint; Background Traffic, Selection slots for hijackable and regular vehicles |
| 1980s Sedan | [Grab3D](https://grab3d.com/models/vehicles/1980s-sedan/) | CC0-1.0 | Textured blue vintage sedan; Background traffic and vehicles available to steal |

License Link: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). This time, did not obtain the login-required Sketchfab/scailman Model, Do not mark it as integrated. 

Original GLB, Download URL and SHA256 Located in `city/npc-vehicles/sources/` and `city/npc-vehicles/manifest.json`. The offline processing script is `scripts/import-ambient-vehicles.mjs`, At runtime, load only from within the repository `city/traffic-sedan-modern.glb`, `city/traffic-sedan-retro.glb`. Conversion includes coordinate normalization, By material/Merge wheels, Reduce polygon count, Remove small nuts and brake disc holes, Scale textures down to a maximum of 1K, Car paint and light assembly material processing. The glass uses a dark, opaque, reflective material, Avoid transparency sorting errors in traffic instances; Not a glass transmission demo. 

After processing, the Hyundai is approximately 34.6K Triangular Face, 21 grids, 2.00 MB; Classic Car Meetup 14.3K surface, 18 grids, 1.73 MB. Render using shared instances, Do not reload the model for every vehicle. Keep existing 2.1×4.9×1.65 m Traffic Collision Envelope, Refresh Logic, Vehicle speed and mission checks; This round does not modify pedestrian models or mission pursuit target models. Wheels rotate according to the actual signed distance traveled, No rotation while parked or paused; Use the same geometry after stealing the car, Materials and wheel pivots, Opening doors still uses the existing cutout mechanism. 

Verify: 18 vehicle appearance items/Take over/Interact/Collision unit tests passed; `tests/ambient-traffic-browser.mjs` of 9 control checks and collision visual checks passed. `tests/ambient-vehicle-models-browser.mjs` Use on the official page RTX 4090, Verify separately for modern and vintage cars F Enter vehicle, Open Door, driving, Wheel rotation and no scripts/Resource error, Screenshots and reports are in `artifacts/ambient-vehicle-models/`. Minimap Canvas2D Compositing with the page still uses CPU; Did not run the full set of tasks or 8 Concurrency performance acceptance testing. 

| Assets | Source and author | Permission | Real-time use |
| --- | --- | --- | --- |
| Island Tree 03 | [Poly Haven](https://polyhaven.com/a/island_tree_03), Rico Cilliers / Rob Tuytel | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Tested game-derived tree trunk from a high-poly source model, Photo-based foliage clusters and near and far versions |
| Palm tree v2 | [OpenGameArt](https://opengameart.org/content/palm-tree-v2), Yughues | CC0 1.0; License notes included in the original package | Palm trees with realistic leaf veins and transparency masks |
| Modular Street Seating | [Poly Haven](https://polyhaven.com/a/modular_street_seating), Stuart Attenborrow | CC0 1.0 | Assemble a bench with a backrest from the module kit, Keep wood, Metallic albedo / normal / ARM; Remove loose spare connectors and reduce polygon counts |
| Belfast Sunset (Pure Sky) | [Poly Haven](https://polyhaven.com/a/belfast_sunset_puresky), Dimitrios Savva / Greg Zaal / Jarod Guest | CC0 1.0 | Current sunset sky and glass, Water surface, Ambient lighting on vehicle paint; Apply consistent color grading at runtime |

Source model and texture downloads are saved in `sources/`. Poly Haven of 25 files individually verified against the official download manifest MD5, see `sources/verified-downloads.json`. Only assets processed in real time enter the game directory. 

Seat positions come from the existing project OpenStreetMap of the snapshot `amenity=bench` Node, Attribution and ODbL Records follow manifest Keep. Exclude those on the roadway, Records on buildings and water surfaces, Orientation follows the nearest road, Adapted for the game; This does not mean the real seats share the same design. 

Reuse the existing vehicle body CarConcept(DGG / Eric Chadwick, CC BY 4.0), The instrument cabin in this iteration is a reversible runtime-derived component, Retain the original attribution. Sound effects and《Bay Evening Breeze》BGM newly written for the project Web Audio Generated Content, No external recordings or song samples. 

Currently restored for evening use Belfast Sunset 4K photographic clouds of, Render a directional orange sunset glow during loading, Dark cloud bases and indigo backlighting. The fiery sunset panorama generated in the previous version has been removed from the delivery folder. Source, For hashes and processing records, see `data/materials/cinematic-environment.json`. 
