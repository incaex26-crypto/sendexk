# Maps guide: download, connect, set up (plan; the agent runs it in Phase 2)

Status: **commands below were checked against Protomaps documentation but not yet run for this project.** The agent tests them in Phase 2 and corrects this file.

## The four map jobs (keep them separate)
| Job | What it needs | Our choice |
|---|---|---|
| 1. Show a map | Map tiles + a drawing library | Protomaps **PMTiles** file + **MapLibre GL JS** |
| 2. Find an address | Geocoder | Start with public Nominatim for light testing; self-host or a paid geocoder before launch |
| 3. Measure distance | Router | Straight line x 1.35 now; **OSRM** later |
| 4. Place a pin | Our own page | Recipient drags a pin; their pin is the truth |

## Licence rule (important)
Map data comes from OpenStreetMap (ODbL). You must show **"© OpenStreetMap contributors"** on every map. Protomaps basemaps are an ODbL "Produced Work". Do not hotlink Protomaps' daily build; copy the file to storage you control (their docs say so).
Public Nominatim: light use only, no bulk and no autocomplete. It would block a real launch.

## Job 1: tiles
1. **Pick the area.** Pilot bounding box from the current service radius (22 km around Sandton) plus margin:
   `minLon 27.83, minLat -26.30, maxLon 28.27, maxLat -25.90`.
   Ask the user to confirm or enlarge it.
2. **Install the `pmtiles` command-line tool** (one file, no dependencies): GitHub releases of `protomaps/go-pmtiles`, or the Docker image `protomaps/go-pmtiles`.
3. **Find the newest daily build** at https://maps.protomaps.com/builds (the planet file is about 120 GB; we never download it all).
4. **Extract only our box** (the tool reads just the needed parts over the network):
   ```
   pmtiles extract <DAILY_BUILD_URL> data/maps/jhb.pmtiles --bbox=27.83,-26.30,28.27,-25.90 --maxzoom=15
   ```
   Lower `--maxzoom` to 14 if the file is too big (each zoom level roughly doubles the size).
   Network note: this must run where the internet is open (the user's computer, or a cloud environment whose network access allows the download).
5. **Check it:** `pmtiles show data/maps/jhb.pmtiles` prints the bounds and zoom range. Expected: bounds match the box.
6. **Preview locally:** `pmtiles serve data/maps --cors=* --port=8080` then open `http://localhost:8080/jhb.json`.
7. **Host it for real:** upload the file to object storage with HTTP range requests and CORS enabled (Cloudflare R2 or S3-compatible), or serve it from our own server. Never commit the file to git (it is in `.gitignore`).

## Job 1b: draw it in the pages
- Add MapLibre GL JS and the `pmtiles` JavaScript protocol plugin; use the `@protomaps/basemaps` package to generate a map style (light and dark "flavors"). Guides: https://docs.protomaps.com/pmtiles/maplibre and https://docs.protomaps.com/basemaps/maplibre
- Replace `mapView()` in `public/app.js` (today a schematic SVG with the same inputs: zones, pins, `onPin`). Keep its interface so the four pages barely change.
- Keep the attribution control on.
- Fonts and sprites for the style must also be hosted by us (or the style will fetch them from elsewhere).

## Job 2: address search ("take the location from the CV and check it")
- Flow: business uploads CSV > for each address call the geocoder > store **lat, lng, confidence** (exact / street / suburb only) > anything not exact shows "recipient will confirm on map" > recipient pin overrides.
- Put the geocoder behind `src/geocode.js` with one function `geocode(address, region)` so the provider can change.
- Pilot: max 1 request per second to public Nominatim and send a proper User-Agent. Before launch: self-host Nominatim/Photon, or pick a paid provider after checking its terms on storing results.

## Job 3: roads and distance (Phase 3)
1. Download the South Africa extract from Geofabrik (`download.geofabrik.de`, Africa > South Africa, `.osm.pbf`). Check its size and licence on the page.
2. Run OSRM in Docker with the **MLD** pipeline: `osrm-extract` (with a profile), `osrm-partition`, `osrm-customize`, then `osrm-routed`.
3. Use the car profile for cars and vans; for motorbikes start with the car profile (a bicycle profile is wrong for motorbikes). Note it in decisions.
4. Wire it in at `roadKm()` in `src/geo.js` behind a `Router` function: `route(points) -> {km, minutes}`. Keep haversine as the fallback if OSRM is down.
5. It needs a small server (a few GB of RAM for a country extract; the agent confirms before we rent one).

## New city checklist (plug and play)
1. `npm run new-region -- <id> "<Name>" <lat> <lng> <timezone> <currency> <country>`
2. Compute its bounding box; run the `pmtiles extract` command with a new file name.
3. Add the city's OSM extract to OSRM (or a second OSRM container).
4. Fill in local prices and cut-off times in the region file; add a `map` block with `tilesUrl` and `bbox`.
5. Run the simulator for the new region before any real order.

## Decisions the user owes
Service area (suburbs), whether to pay for a hosted geocoder, where to host tiles (R2/S3/own server).
