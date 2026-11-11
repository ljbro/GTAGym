# Acknowledgements and asset credits

## Primary acknowledgement: GTA_SZ

**Our primary acknowledgement goes to [GTA_SZ](https://github.com/linranff/GTA_SZ),
created by linranff and the ShenChengJi contributors.** GTASuite's native 3D
environment is developed on top of their work. Its city environment, rendering,
movement and camera foundations, and game systems underpin our 3D tasks.

GTASuite extends this foundation with benchmark scenarios, task generation,
and evaluation interfaces. We thank the GTA_SZ authors and contributors for
making that foundation available. The inherited code and copyright notice
retain the original [MIT license](native-city/LICENSE).

## Rendering and supporting software

The 3D environment uses [Babylon.js](licenses/babylonjs-apache-2.0.md), with its
[third-party notices](licenses/babylonjs-NOTICE.md) and
[meshoptimizer notice](licenses/meshoptimizer-MIT.md) preserved.

## Task references

Task construction draws on GTA V main-story missions and gameplay imagery.
GTA V and its source gameplay content are credited to Rockstar Games.
The reconstructed city, props and route dimensions are adaptations; source
gameplay references and native-city routes are not metrically identical scenes.

## Map, terrain and environment

- Map data and building footprints: OpenStreetMap contributors. Terrain and
  landmark provenance, including Copernicus DEM credits, are recorded in
  [city/LANDMARK_ATTRIBUTION.md](city/LANDMARK_ATTRIBUTION.md).
- Coastal environment: [coastal-terrain.md](licenses/coastal-terrain.md).
- Lighting and sky: [daylight-environment.md](licenses/daylight-environment.md).
- Vegetation, street furniture and ambient vehicles: the source authors,
  licenses and modifications are listed in
  [open-city-assets.md](licenses/open-city-assets.md).

## Vehicles

| Assets | Creator | License / detailed credit |
| --- | --- | --- |
| Car Concept / Indigo GT | Darmstadt Graphics Group; Eric Chadwick | [CC BY 4.0 and modification notes](licenses/carconcept-CC-BY-4.0.md) |
| Motorcycle and convertible | Poly by Google | CC BY 3.0; [source links and modifications](assets/task-vehicles/credits.html) |
| Pickup, sedan, police car and truck | Quaternius | CC0; [source links and modifications](assets/task-vehicles/credits.html) |
| Generic Van | PuKkBuMXDD | CC BY 3.0; [source links and modifications](assets/task-vehicles/credits.html) |
| Semi-truck | WilliWam | CC0; [source links and modifications](assets/task-vehicles/credits.html) |
| Quad Bike | 3D Assets | CC0; [source record](assets/task-vehicles/atv.provenance.json) |

The [vehicle credits](assets/task-vehicles/credits.html) and
[manifest](assets/task-vehicles/manifest.json) retain per-asset sources, processing
records, and notices for additional inherited models.

## Watercraft

| Assets | Creator | License / detailed credit |
| --- | --- | --- |
| Watercraft Kit | Kenney | [CC0 license](assets/task-watercraft/License.txt); [manifest](assets/task-watercraft/manifest.json) |
| Zodiac boat | RedC130 | CC BY 4.0; [source and modifications](assets/task-watercraft/CC-BY-ATTRIBUTION.md) |
| motoryacht 35 | angelo raffaele catalano | CC BY 4.0; [source and modifications](assets/task-watercraft/CC-BY-ATTRIBUTION.md) |
| 2012 Sea-Doo GTI SE 130 | BoatUS Foundation | CC BY 4.0; [source and modifications](assets/task-watercraft/CC-BY-ATTRIBUTION.md) |

## Characters and interiors

Character-specific notices remain in [characters/CREDITS.txt](characters/CREDITS.txt)
and the accompanying manifests. Interior asset provenance includes
[michaels-garage.md](licenses/michaels-garage.md) and the source manifests under
`assets/interiors/`.

This file indexes the existing acknowledgements. Asset-specific license texts,
creator credits, source URLs and modification records remain with their files.
The task-selection interface displays the evaluation instruction; attribution
and implementation notes are maintained here and in the linked documents.
