"""Convert Police Stations.kmz to WGS84 GeoJSON points."""
from __future__ import annotations

import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"kml": "http://www.opengis.net/kml/2.2"}
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KMZ = Path(r"c:\Users\HEMANTH\Downloads\Police Stations.kmz")
OUT = ROOT / "public" / "geo" / "ap-police-stations.geojson"

FOLDER_TYPE = {
    "Other-Imp-PSs": "Important",
    "EG-Dist": "East Godavari",
    "Tobe add": "Pending",
    "Police Stations": "Border PS",
}


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "ps"


def text(el: ET.Element | None, tag: str, default: str = "") -> str:
    if el is None:
        return default
    found = el.find(f"kml:{tag}", NS)
    return (found.text or default).strip() if found is not None else default


def simple_data(pm: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    for sd in pm.findall(".//kml:SimpleData", NS):
        key = (sd.get("name") or "").strip()
        if key:
            out[key] = (sd.text or "").strip()
    return out


def coordinates(pm: ET.Element) -> tuple[float, float] | None:
    raw = pm.findtext(".//kml:coordinates", default="", namespaces=NS)
    token = (raw or "").replace("\n", " ").strip().split()
    if not token:
        return None
    parts = token[0].split(",")
    if len(parts) < 2:
        return None
    lon, lat = float(parts[0]), float(parts[1])
    if not (70 <= lon <= 90 and 8 <= lat <= 25):
        return None
    return lon, lat


def innermost_folder(pm: ET.Element, parent: dict[ET.Element, ET.Element | None]) -> str:
    node: ET.Element | None = pm
    while node is not None:
        node = parent.get(node)
        if node is not None and node.tag.endswith("Folder"):
            name = text(node, "name")
            if name:
                return name
    return "Police Stations"


def build_parent_map(root: ET.Element) -> dict[ET.Element, ET.Element | None]:
    parent: dict[ET.Element, ET.Element | None] = {root: None}
    for el in root.iter():
        for child in list(el):
            parent[child] = el
    return parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kmz", type=Path, default=DEFAULT_KMZ)
    args = parser.parse_args()
    kmz = args.kmz
    if not kmz.exists():
        raise SystemExit(f"KMZ not found: {kmz}")

    with zipfile.ZipFile(kmz) as zf:
        kml_name = next(n for n in zf.namelist() if n.lower().endswith(".kml"))
        xml = zf.read(kml_name)

    root = ET.fromstring(xml)
    parent = build_parent_map(root)
    features: list[dict] = []
    seen: set[str] = set()

    for idx, pm in enumerate(root.findall(".//kml:Placemark", NS), start=1):
        xy = coordinates(pm)
        if not xy:
            continue
        lon, lat = xy
        data = simple_data(pm)
        folder = innermost_folder(pm, parent)
        name = data.get("PS_Name") or text(pm, "name") or f"Police Station {idx}"
        ident = slug(name)
        if ident in seen:
            ident = f"{ident}_{idx}"
        seen.add(ident)
        state_raw = data.get("State") or ""
        state_key = state_raw.strip().lower()
        state = {
            "ap": "Andhra Pradesh",
            "andhra pradesh": "Andhra Pradesh",
            "odisha": "Odisha",
            "telangana": "Telangana",
            "chhattisgarh": "Chhattisgarh",
            "maharashtra": "Maharashtra",
        }.get(state_key, state_raw)
        district = data.get("Dist_") or (
            "East Godavari" if folder == "EG-Dist" else "Unspecified"
        )
        features.append(
            {
                "type": "Feature",
                "id": ident,
                "properties": {
                    "id": ident,
                    "name": name,
                    "district": district,
                    "state": state,
                    "group": folder,
                    "station_type": FOLDER_TYPE.get(folder, folder),
                    "map_no": data.get("Map_No") or "",
                    "sector": data.get("Sec_") or "",
                    "sl_no": data.get("Sl_No_") or str(idx),
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "name": "police_stations_kmz",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "source": "Police Stations.kmz",
        "features": features,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.name}: {len(features)} points, {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
