"""Download authentic OSM / OSRM geometries for Andhra Pradesh GIS overlays.

Highways: OSRM driving along documented NH waypoints.
Rivers: OSM Overpass waterway centerlines for named AP rivers.
Water bodies: OSM Overpass named lakes / reservoirs (QGIS QuickOSM analog).
"""
from __future__ import annotations

import json
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "geo"
OUT.mkdir(parents=True, exist_ok=True)
CTX = ssl.create_default_context()

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OSRM = "https://router.project-osrm.org/route/v1/driving/"

# City / junction waypoints along real NH alignments (WGS84 lat, lon).
NH_ROUTES: dict[str, list[tuple[float, float]]] = {
    "NH-16": [
        (19.1138, 84.6872),  # Ichchapuram
        (18.6725, 84.4596),  # Palasa
        (18.2949, 83.8938),  # Srikakulam
        (18.1067, 83.3956),  # Vizianagaram
        (17.6868, 83.2185),  # Visakhapatnam
        (17.6896, 83.0024),  # Anakapalli
        (17.2789, 82.4010),  # Tuni
        (17.0005, 81.7799),  # Rajahmundry
        (16.7107, 81.0952),  # Eluru
        (16.5062, 80.6480),  # Vijayawada
        (16.3067, 80.4365),  # Guntur
        (15.5057, 80.0499),  # Ongole
        (14.4426, 79.9864),  # Nellore
        (13.6288, 79.4192),  # Tirupati
        (13.2172, 79.1003),  # Chittoor approach
    ],
    "NH-40": [
        (15.8281, 78.0373),  # Kurnool
        (15.4770, 78.4836),  # Nandyal
        (14.4673, 78.8242),  # Kadapa
        (13.6288, 79.4192),  # Tirupati / Renigunta
    ],
    "NH-44": [
        (16.2160, 77.3566),  # AP/KA border near Raichur approach
        (15.8281, 78.0373),  # Kurnool
        (14.6819, 77.6006),  # Anantapur
        (13.8290, 77.4920),  # Hindupur
    ],
}

AGENCY_SH39 = [
    (18.8060, 82.7160),  # Koraput approach
    (18.3273, 82.8775),  # Araku
    (18.0833, 82.6667),  # Paderu
    (17.8745, 82.3512),  # Chintapalle
    (17.6670, 82.6100),  # Narsipatnam
    (17.6896, 83.0024),  # Anakapalli / NH-16
]


def get(url: str, data: bytes | None = None, retries: int = 4) -> bytes:
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"User-Agent": "EAGLE-AP-GIS/1.0 (local development)"},
            )
            with urllib.request.urlopen(req, context=CTX, timeout=180) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 + i * 3)
    raise RuntimeError(f"GET failed {url}: {last}")


def overpass(ql: str) -> dict:
    body = urllib.parse.urlencode({"data": ql}).encode("utf-8")
    last = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            raw = get(endpoint, data=body, retries=3)
            return json.loads(raw.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"  Overpass miss {endpoint}: {exc}")
            time.sleep(2)
    raise RuntimeError(f"Overpass failed: {last}")


def downsample(coords: list[list[float]], step: int = 4, ndigits: int = 5) -> list[list[float]]:
    if len(coords) <= 2:
        return coords
    kept = [coords[0]]
    for pt in coords[step::step]:
        kept.append([round(pt[0], ndigits), round(pt[1], ndigits)])
    last = [round(coords[-1][0], ndigits), round(coords[-1][1], ndigits)]
    if kept[-1] != last:
        kept.append(last)
    return kept


def osrm_route(points: list[tuple[float, float]], name: str) -> dict | None:
    loc = ";".join(f"{lon:.5f},{lat:.5f}" for lat, lon in points)
    url = f"{OSRM}{loc}?overview=full&geometries=geojson"
    raw = get(url)
    payload = json.loads(raw.decode("utf-8"))
    if payload.get("code") != "Ok" or not payload.get("routes"):
        print(f"OSRM miss for {name}: {payload.get('code')}")
        return None
    geom = payload["routes"][0]["geometry"]
    geom["coordinates"] = downsample(geom["coordinates"], step=3)
    km = round(payload["routes"][0]["distance"] / 1000, 1)
    return {
        "type": "Feature",
        "properties": {"name": name, "source": "OSRM/OSM driving network", "length_km": km},
        "geometry": geom,
    }


def fetch_highways() -> None:
    features = []
    for name, pts in NH_ROUTES.items():
        feat = osrm_route(pts, name)
        if feat:
            features.append(feat)
            print(f"  {name}: {feat['properties']['length_km']} km, {len(feat['geometry']['coordinates'])} verts")
        time.sleep(0.6)
    agency = osrm_route(AGENCY_SH39, "SH-39 / ASR Agency corridor")
    if agency:
        print(f"  agency: {agency['properties']['length_km']} km")
        (OUT / "ap-agency-route.geojson").write_text(json.dumps(agency, separators=(",", ":")))
    fc = {"type": "FeatureCollection", "features": features}
    (OUT / "ap-highways.geojson").write_text(json.dumps(fc, separators=(",", ":")))
    print(f"Wrote {OUT / 'ap-highways.geojson'} ({(OUT / 'ap-highways.geojson').stat().st_size} bytes)")


OVERPASS_QL = r"""
[out:json][timeout:90];
(
  way["waterway"="river"]["name"~"Godavari|Krishna|Penna|Penneru|Penner|Nagavali|Vamsadhara|Tungabhadra"](12.55,76.6,19.35,84.9);
  relation["waterway"="river"]["name"~"Godavari|Krishna|Penna|Penneru"](12.55,76.6,19.35,84.9);
);
out geom;
"""

WATER_QL = r"""
[out:json][timeout:180];
(
  way["water"="reservoir"]["name"](12.62,76.75,19.22,84.78);
  relation["water"="reservoir"]["name"](12.62,76.75,19.22,84.78);
  way["landuse"="reservoir"]["name"](12.62,76.75,19.22,84.78);
  relation["landuse"="reservoir"]["name"](12.62,76.75,19.22,84.78);
  way["natural"="water"]["name"~"Lake|Reservoir|Kolleru|Pulicat|Somasila|Srisailam|Nagarjuna|Yeleru|Kandaleru|Sileru|Telineelapuram",i](12.62,76.75,19.22,84.78);
  relation["natural"="water"]["name"~"Lake|Reservoir|Kolleru|Pulicat|Somasila|Srisailam|Nagarjuna|Yeleru|Kandaleru|Sileru",i](12.62,76.75,19.22,84.78);
);
out geom;
"""


def way_coords(el: dict) -> list[list[float]]:
    geom = el.get("geometry") or []
    return [[p["lon"], p["lat"]] for p in geom if "lon" in p and "lat" in p]


def relation_outers(el: dict) -> list[list[list[float]]]:
    rings = []
    for member in el.get("members") or []:
        if member.get("role") not in ("outer", "", None):
            continue
        geom = member.get("geometry") or []
        coords = [[p["lon"], p["lat"]] for p in geom if "lon" in p and "lat" in p]
        if len(coords) >= 4:
            rings.append(coords)
    return rings


def closed_ring(coords: list[list[float]]) -> list[list[float]] | None:
    if len(coords) < 4:
        return None
    ring = downsample(coords, step=5)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    if len(ring) < 4:
        return None
    return ring


def bbox_ok(coords: list[list[float]]) -> bool:
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    if min(lons) < 76.4 or max(lons) > 85.1 or min(lats) < 12.3 or max(lats) > 19.6:
        return False
    # Drop tiny farm ponds: need ~800 m extent.
    return (max(lons) - min(lons) > 0.008) or (max(lats) - min(lats) > 0.008)


def fetch_rivers() -> None:
    data = overpass(OVERPASS_QL)
    features = []
    seen = set()
    for el in data.get("elements", []):
        name = (el.get("tags") or {}).get("name", "river")
        geom = el.get("geometry")
        if not geom:
            members = el.get("members") or []
            coords = []
            for m in members:
                if m.get("geometry"):
                    coords.extend([[p["lon"], p["lat"]] for p in m["geometry"]])
        else:
            coords = [[p["lon"], p["lat"]] for p in geom]
        if len(coords) < 2:
            continue
        coords = downsample(coords, step=6)
        key = (name, round(coords[0][0], 3), round(coords[0][1], 3), len(coords))
        if key in seen:
            continue
        seen.add(key)
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "source": "OpenStreetMap Overpass"},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )
    fc = {"type": "FeatureCollection", "features": features}
    path = OUT / "ap-rivers.geojson"
    path.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"Wrote {path} ({path.stat().st_size} bytes, {len(features)} features)")


def fetch_waterbodies() -> None:
    data = overpass(WATER_QL)
    features = []
    seen: set[tuple] = set()
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        kind = tags.get("water") or tags.get("landuse") or tags.get("natural") or "water"
        rings: list[list[list[float]]] = []
        if el.get("type") == "relation":
            rings = [ring for ring in (closed_ring(r) for r in relation_outers(el)) if ring]
        else:
            ring = closed_ring(way_coords(el))
            if ring:
                rings = [ring]
        if not rings:
            continue
        if not all(bbox_ok(ring) for ring in rings):
            continue
        key = (name.lower(), round(rings[0][0][0], 3), round(rings[0][0][1], 3), len(rings[0]))
        if key in seen:
            continue
        seen.add(key)
        geometry = (
            {"type": "Polygon", "coordinates": rings}
            if len(rings) == 1
            else {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings]}
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": name,
                    "water": kind,
                    "source": "OpenStreetMap Overpass",
                },
                "geometry": geometry,
            }
        )
    features.sort(key=lambda f: f["properties"]["name"])
    fc = {
        "type": "FeatureCollection",
        "features": features,
        "properties": {"source": "OSM Overpass named lakes/reservoirs in AP envelope"},
    }
    path = OUT / "ap-waterbodies.geojson"
    path.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"Wrote {path} ({path.stat().st_size} bytes, {len(features)} features)")


def main() -> None:
    print("Fetching OSM-routed national highways via OSRM...")
    fetch_highways()
    print("Fetching OSM river centerlines via Overpass...")
    fetch_rivers()
    print("Fetching OSM named lakes and reservoirs via Overpass...")
    fetch_waterbodies()
    print("Done.")


if __name__ == "__main__":
    main()
