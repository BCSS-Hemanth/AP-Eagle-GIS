"""Download authentic OSM / OSRM geometries for Andhra Pradesh GIS overlays."""
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

OVERPASS = "https://overpass-api.de/api/interpreter"
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
            with urllib.request.urlopen(req, context=CTX, timeout=120) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 + i * 3)
    raise RuntimeError(f"GET failed {url}: {last}")


def downsample(coords: list[list[float]], step: int = 4, ndigits: int = 5) -> list[list[float]]:
    if len(coords) <= 2:
        return coords
    kept = [coords[0]]
    for pt in coords[step::step]:
        kept.append([round(pt[0], ndigits), round(pt[1], ndigits)])
    if kept[-1] != [round(coords[-1][0], ndigits), round(coords[-1][1], ndigits)]:
        kept.append([round(coords[-1][0], ndigits), round(coords[-1][1], ndigits)])
    return kept


def osrm_route(points: list[tuple[float, float]], name: str) -> dict | None:
    # OSRM wants lon,lat
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


def fetch_rivers() -> None:
    body = urllib.parse.urlencode({"data": OVERPASS_QL}).encode("utf-8")
    raw = get(OVERPASS, data=body)
    data = json.loads(raw.decode("utf-8"))
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


def main() -> None:
    print("Fetching OSM-routed national highways via OSRM...")
    fetch_highways()
    print("Fetching OSM river centerlines via Overpass...")
    fetch_rivers()
    print("Done.")


if __name__ == "__main__":
    main()
