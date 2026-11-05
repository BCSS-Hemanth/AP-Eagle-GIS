"""Compare converted OPS GeoJSON feature counts to KMZ Placemark counts."""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\ops_lyrs\ops_lyrs")
OUT = ROOT / "public" / "geo" / "gis-source" / "ops"

JOBS = [
    ("asr_boundary", SRC / "asr_dist_admn_bdr" / "ASR_Dist-Admin.kmz"),
    ("pharma_hubs", SRC / "Che_Phrm_hub" / "ChemicalPharma hub.kmz"),
    ("check_posts", SRC / "check posts" / "check posts.kmz"),
    ("d_routes", SRC / "d_routes" / "d-routes.kmz"),
    ("ddacs", SRC / "DDACs" / "DDACs.kmz"),
    ("entry_exit", SRC / "entry_exit" / "Entry & Exits.kmz"),
    ("ganja_seized", SRC / "ganja seized" / "Ganja Seized .kmz"),
    ("hotspots", SRC / "hotspots" / "Hotspots.kmz"),
    ("foot_tracks", SRC / "Roads" / "Foot_Tracks.kmz"),
    ("internal_roads", SRC / "Roads" / "Internal_Roads.kmz"),
    ("main_roads", SRC / "Roads" / "Main_Roads.kmz"),
    ("stock_points", SRC / "stock_points" / "Stock Points.kmz"),
    ("toll_plazas", SRC / "Tolls_Plazas" / "Tole Plazas.kmz"),
]


def local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def strip_ns(xml: str) -> str:
    xml = re.sub(r'xmlns(:\w+)?="[^"]+"', "", xml)
    return re.sub(r"<(/?)(\w+):", r"<\1", xml)


def has_coords(pm: ET.Element) -> bool:
    for el in pm.iter():
        if local(el.tag) != "coordinates":
            continue
        text = (el.text or "").strip()
        if text:
            return True
    return False


def main() -> None:
    mismatches = 0
    for name, kmz in JOBS:
        with zipfile.ZipFile(kmz) as z:
            kml = next(n for n in z.namelist() if n.lower().endswith(".kml"))
            text = strip_ns(z.read(kml).decode("utf-8", errors="replace"))
        root = ET.fromstring(text)
        pm_all = [e for e in root.iter() if local(e.tag) == "Placemark"]
        pm_geom = sum(1 for e in pm_all if has_coords(e))
        empty = len(pm_all) - pm_geom
        fc = json.loads((OUT / f"{name}.geojson").read_text(encoding="utf-8"))
        n = len(fc["features"])
        ok = pm_geom == n
        if not ok:
            mismatches += 1
        extra = f" empty_skipped={empty}" if empty else ""
        print(f"{name}: kmz_with_geom={pm_geom} geojson={n} match={ok}{extra}")
    if mismatches:
        raise SystemExit(f"{mismatches} layer(s) mismatched placemark counts")
    print("all layers match placemarks that contain coordinates")


if __name__ == "__main__":
    main()
