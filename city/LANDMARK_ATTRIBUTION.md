# Asset sources for key ShenChengJi landmarks

## Map and building footprints

© OpenStreetMap contributors, Use [Open Database License 1.0](https://www.openstreetmap.org/copyright). Originally Distributed by Geofabrik Guangdong Data, Source for each object ID And processing records are saved in the project `data/landmarks/`. Overture If derived records reference the same OSM Elements, Do not treat as an independent measurement. 

## Lianhuashan terrain

Use AWS Hosted Copernicus DEM 2021 GLO-30 Tiles `Copernicus_DSM_COG_10_N22_00_E114_00_DEM`, at 2026-09-05 Get. [Data registration](https://registry.opendata.aws/copernicus-dem/) · [Product and usage instructions](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM). 

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

The terrain has been cropped for this project, Interpolation, Game scale adjustments and edge alignment. Source approximately 30m DSM Includes vegetation and building surfaces, 15m The grid is an interpolation result. The model does not represent bare-earth survey accuracy. 

## Building Exterior Reference

Tencent Seafront Towers reference Tencent, NBBJ, WSP, Inhabit and public project information from the contractor; The MixC World references public project materials from Huayang International and China Resources; Fortune Plaza and Qijie Residence / Harbin Building incorporates publicly available location data, Photos and OSM Footprints. By source URL, See the project for facts and estimates `data/landmarks/tencent.json`, `data/landmarks/priority-places.json`. 

Photos serve only as geometry and material references for this iteration, Not packaged as a texture. Models use procedural geometry and project materials, Not Photogrammetry, As-built model or detailed measured dimensions. For the curtain wall, Connecting Bridge Location, Rooftop, Approximation of the entrance and unspecified heights, Label separately in the object evidence. 
