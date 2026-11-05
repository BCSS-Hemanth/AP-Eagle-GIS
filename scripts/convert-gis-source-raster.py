"""
Convert GIS-Source Raster KMZ GroundOverlays → public/geo/gis-source/raster/.

Preserves LatLonBox (WGS84) and embedded imagery. No resampling/reprojection.
Conflict policy: these products replace Esri World Imagery / Esri Hillshade /
OpenTopoMap for the corresponding legend layers.
"""
from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Raster\Raster")
OUT = ROOT / "public" / "geo" / "gis-source" / "raster"

JOBS = [
    {
        "id": "google_roadmap",
        "label": "Google Map roadmap snapshot",
        "kmzs": [SRC / "Google Map" / "Google map.kmz"],
        "role": "roadmap",
        "replaces": ["basemap-context"],
    },
    {
        "id": "google_sat",
        "label": "Google satellite hybrid snapshot",
        "kmzs": [SRC / "Google Map" / "Google_sat_img.kmz"],
        "role": "satellite_overview",
        "replaces": ["lyr-cartosat-esri-overview"],
    },
    {
        "id": "google_terrain",
        "label": "Google terrain snapshot",
        "kmzs": [SRC / "Google Map" / "google_terrian_map.kmz"],
        "role": "terrain",
        "replaces": ["lyr-hillshade-esri"],
    },
    {
        "id": "aob",
        "label": "AOB Google Earth satellite pyramid",
        "kmzs": [SRC / "SAT_data" / "AOB.kmz"],
        "role": "satellite_detail",
        "replaces": ["lyr-cartosat-esri-aob"],
    },
    {
        "id": "nt_cg",
        "label": "NT_CG Mallampeta satellite mosaic (parts 1–5)",
        "kmzs": [
            SRC / "SAT_data" / "NT_CG (1).kmz",
            SRC / "SAT_data" / "NT_CG (2).kmz",
            SRC / "SAT_data" / "NT_CG (3).kmz",
            SRC / "SAT_data" / "NT_CG (4).kmz",
            SRC / "SAT_data" / "NT_CG (5).kmz",
        ],
        "role": "satellite_detail",
        "replaces": ["lyr-cartosat-esri-ntcg"],
    },
    {
        "id": "soi_topo",
        "label": "SOI 1:50K toposheet mosaic",
        "kmzs": [SRC / "SOI_Topos" / "soi_maps_mosaic.kmz"],
        "role": "topo",
        "replaces": ["basemap-opentopo-aoi", "fake-toposheet-cards-imagery"],
    },
]


def local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def strip_ns(xml: str) -> str:
    xml = re.sub(r'xmlns(:\w+)?="[^"]+"', "", xml)
    return re.sub(r"<(/?)(\w+):", r"<\1", xml)


def text_of(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def find_child(parent: ET.Element, name: str) -> ET.Element | None:
    for c in parent:
        if local(c.tag) == name:
            return c
    return None


def parse_level(name: str, href: str) -> int:
    blob = f"{name} {href}"
    m = re.search(r"_L(\d+)_", blob)
    if m:
        return int(m.group(1))
    m = re.search(r"Mallampeta\s+(\d+)_", blob, re.I)
    if m:
        return 10 + int(m.group(1))
    if re.search(r"Earth_Mallampeta", blob, re.I):
        return 5
    return 0


def safe_stem(path: str, idx: int) -> str:
    base = Path(path).name
    stem = re.sub(r"[^\w.\-]+", "_", base).strip("_")
    if not stem:
        stem = f"tile_{idx}"
    return f"{idx:04d}_{stem}"


def extract_product(job: dict) -> dict:
    product_id = job["id"]
    out_dir = OUT / product_id
    tiles_dir = out_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    overlays: list[dict] = []
    idx = 0
    for kmz_path in job["kmzs"]:
        if not kmz_path.exists():
            raise SystemExit(f"Missing {kmz_path}")
        print(f"  {kmz_path.name} …")
        with zipfile.ZipFile(kmz_path) as z:
            names = z.namelist()
            kml_name = next(n for n in names if n.lower().endswith(".kml"))
            root = ET.fromstring(strip_ns(z.read(kml_name).decode("utf-8", errors="replace")))
            for el in root.iter():
                if local(el.tag) != "GroundOverlay":
                    continue
                name = text_of(find_child(el, "name")) or f"overlay_{idx}"
                icon = find_child(el, "Icon")
                href = text_of(find_child(icon, "href")) if icon is not None else ""
                box_el = find_child(el, "LatLonBox")
                if not href or box_el is None:
                    continue
                try:
                    north = float(text_of(find_child(box_el, "north")))
                    south = float(text_of(find_child(box_el, "south")))
                    east = float(text_of(find_child(box_el, "east")))
                    west = float(text_of(find_child(box_el, "west")))
                except ValueError:
                    continue
                rot_txt = text_of(find_child(box_el, "rotation"))
                rotation = float(rot_txt) if rot_txt else 0.0

                member = None
                base = Path(href.replace("\\", "/")).name
                for n in names:
                    if n == href or n.endswith("/" + base) or Path(n).name == base:
                        member = n
                        break
                if member is None:
                    continue

                idx += 1
                out_name = safe_stem(member, idx)
                if not Path(out_name).suffix:
                    out_name += Path(member).suffix.lower() or ".jpg"
                dest = tiles_dir / out_name
                dest.write_bytes(z.read(member))
                area = abs(east - west) * abs(north - south)
                overlays.append(
                    {
                        "id": f"{product_id}-{idx:04d}",
                        "name": name,
                        "url": f"/geo/gis-source/raster/{product_id}/tiles/{out_name}",
                        "north": north,
                        "south": south,
                        "east": east,
                        "west": west,
                        "rotation": rotation,
                        "level": parse_level(name, href),
                        "areaDeg2": area,
                        "sourceKmz": kmz_path.name,
                    }
                )

    if not overlays:
        raise SystemExit(f"No ground overlays in {product_id}")

    levels = sorted({o["level"] for o in overlays})
    # Prefer finer detail: within each product, also rank by area (smaller = finer)
    coverage = {
        "north": max(o["north"] for o in overlays),
        "south": min(o["south"] for o in overlays),
        "east": max(o["east"] for o in overlays),
        "west": min(o["west"] for o in overlays),
    }
    manifest = {
        "id": product_id,
        "label": job["label"],
        "role": job["role"],
        "replaces": job["replaces"],
        "crs": "EPSG:4326",
        "overlayCount": len(overlays),
        "levels": levels,
        "coverage": coverage,
        "convertedAt": datetime.now(timezone.utc).isoformat(),
        "sourceKmzs": [str(p) for p in job["kmzs"]],
        "overlays": overlays,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    mb = sum((tiles_dir / Path(o["url"]).name).stat().st_size for o in overlays) / (1024 * 1024)
    print(f"  → {product_id}: {len(overlays)} overlays, levels={levels}, ~{mb:.1f} MB tiles")
    return {
        "id": product_id,
        "file": f"{product_id}/manifest.json",
        "overlays": len(overlays),
        "levels": levels,
        "role": job["role"],
        "coverage": coverage,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    products = []
    for job in JOBS:
        print(f"converting {job['id']} …")
        products.append(extract_product(job))
    catalog = {
        "phase": "1C-raster-kmz",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRoot": str(SRC),
        "conflictPolicy": {
            "lyr-cartosat": "Replaces Esri World Imagery — uses google_sat + aob + nt_cg",
            "lyr-hillshade": "Replaces Esri World Hillshade — uses google_terrain",
            "basemap-topo-aoi": "SOI mosaic (soi_topo) preferred over OpenTopoMap inside coverage",
            "duplicates": "Loose JPG/PNG copies omitted; KMZ LatLonBox is authoritative",
        },
        "products": products,
    }
    (OUT / "catalog.json").write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    print("catalog.json written")


if __name__ == "__main__":
    main()
