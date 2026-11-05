"""
Convert GIS-Source ops_lyrs KMZ → public/geo/gis-source/ops/*.geojson

Preserves placemark names, descriptions, ExtendedData, and folder ancestry.
Does not simplify or reproject geometries (KMZ is already WGS84 lon/lat).
"""
from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\ops_lyrs\ops_lyrs")
OUT = ROOT / "public" / "geo" / "gis-source" / "ops"

# Independent OPS KMZs (VSP.shp deferred — not KMZ / needs LCC reprojection)
KMZ_JOBS = [
    ("asr_boundary", SRC / "asr_dist_admn_bdr" / "ASR_Dist-Admin.kmz", "ASR_Dist-Admin.kmz"),
    ("pharma_hubs", SRC / "Che_Phrm_hub" / "ChemicalPharma hub.kmz", "ChemicalPharma hub.kmz"),
    ("check_posts", SRC / "check posts" / "check posts.kmz", "check posts.kmz"),
    ("d_routes", SRC / "d_routes" / "d-routes.kmz", "d-routes.kmz"),
    ("ddacs", SRC / "DDACs" / "DDACs.kmz", "DDACs.kmz"),
    ("entry_exit", SRC / "entry_exit" / "Entry & Exits.kmz", "Entry & Exits.kmz"),
    ("ganja_seized", SRC / "ganja seized" / "Ganja Seized .kmz", "Ganja Seized .kmz"),
    ("hotspots", SRC / "hotspots" / "Hotspots.kmz", "Hotspots.kmz"),
    ("foot_tracks", SRC / "Roads" / "Foot_Tracks.kmz", "Foot_Tracks.kmz"),
    ("internal_roads", SRC / "Roads" / "Internal_Roads.kmz", "Internal_Roads.kmz"),
    ("main_roads", SRC / "Roads" / "Main_Roads.kmz", "Main_Roads.kmz"),
    ("stock_points", SRC / "stock_points" / "Stock Points.kmz", "Stock Points.kmz"),
    ("toll_plazas", SRC / "Tolls_Plazas" / "Tole Plazas.kmz", "Tole Plazas.kmz"),
]


def local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def strip_ns(xml: str) -> str:
    xml = re.sub(r'xmlns(:\w+)?="[^"]+"', "", xml)
    return re.sub(r"<(/?)(\w+):", r"<\1", xml)


def parse_coords(text: str | None) -> list[list[float]]:
    if not text:
        return []
    out: list[list[float]] = []
    for triple in text.strip().split():
        parts = triple.split(",")
        if len(parts) < 2:
            continue
        out.append([float(parts[0]), float(parts[1])])
    return out


def close_ring(ring: list[list[float]]) -> list[list[float]]:
    if len(ring) >= 1 and ring[0] != ring[-1]:
        return ring + [ring[0]]
    return ring


def first_coords(el: ET.Element) -> ET.Element | None:
    for c in el.iter():
        if local(c.tag) == "coordinates":
            return c
    return None


def polygon_geom(el: ET.Element) -> dict | None:
    rings: list[list[list[float]]] = []
    for ring_el in el.iter():
        if local(ring_el.tag) != "LinearRing":
            continue
        coords_el = first_coords(ring_el)
        ring = close_ring(parse_coords(coords_el.text if coords_el is not None else None))
        if len(ring) >= 4:
            rings.append(ring)
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


def linestring_geom(el: ET.Element) -> dict | None:
    coords_el = first_coords(el)
    line = parse_coords(coords_el.text if coords_el is not None else None)
    if len(line) < 2:
        return None
    return {"type": "LineString", "coordinates": line}


def point_geom(el: ET.Element) -> dict | None:
    coords_el = first_coords(el)
    pts = parse_coords(coords_el.text if coords_el is not None else None)
    if not pts:
        return None
    return {"type": "Point", "coordinates": pts[0]}


def collect_geoms(el: ET.Element) -> list[dict]:
    """Collect geometry nodes that are direct geometry children (handles MultiGeometry)."""
    geoms: list[dict] = []

    def walk(node: ET.Element, under_multi: bool) -> None:
        t = local(node.tag)
        if t == "MultiGeometry":
            for child in node:
                walk(child, True)
            return
        if t == "Polygon":
            g = polygon_geom(node)
            if g:
                geoms.append(g)
            return
        if t == "LineString":
            g = linestring_geom(node)
            if g:
                geoms.append(g)
            return
        if t == "Point":
            g = point_geom(node)
            if g:
                geoms.append(g)
            return
        if not under_multi:
            for child in node:
                walk(child, False)

    walk(el, False)
    return geoms


def geom_from_element(el: ET.Element) -> dict | None:
    geoms = collect_geoms(el)
    if not geoms:
        return None
    if len(geoms) == 1:
        return geoms[0]
    # Homogeneous Multi* or GeometryCollection
    types = {g["type"] for g in geoms}
    if types == {"Point"}:
        return {"type": "MultiPoint", "coordinates": [g["coordinates"] for g in geoms]}
    if types == {"LineString"}:
        return {"type": "MultiLineString", "coordinates": [g["coordinates"] for g in geoms]}
    if types == {"Polygon"}:
        return {"type": "MultiPolygon", "coordinates": [g["coordinates"] for g in geoms]}
    return {"type": "GeometryCollection", "geometries": geoms}


def folder_path(elem: ET.Element, parents: dict[ET.Element, ET.Element]) -> str:
    parts: list[str] = []
    cur: ET.Element | None = elem
    while cur is not None:
        if local(cur.tag) == "Folder":
            name = None
            for c in cur:
                if local(c.tag) == "name":
                    name = (c.text or "").strip()
                    break
            if name:
                parts.append(name)
        cur = parents.get(cur)
    parts.reverse()
    return " / ".join(parts)


def extended_data(pm: ET.Element) -> dict:
    props: dict = {}
    for data in pm.iter():
        t = local(data.tag)
        if t == "Data":
            key = data.attrib.get("name")
            val = None
            for c in data:
                if local(c.tag) == "value":
                    val = (c.text or "").strip()
            if key:
                props[key] = val
        if t == "SimpleData":
            key = data.attrib.get("name")
            if key:
                props[key] = (data.text or "").strip()
    return props


def kmz_to_features(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as z:
        kml_name = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        text = strip_ns(z.read(kml_name).decode("utf-8", errors="replace"))
    root = ET.fromstring(text)
    parents: dict[ET.Element, ET.Element] = {}
    for p in root.iter():
        for c in p:
            parents[c] = p

    features: list[dict] = []
    idx = 0
    for pm in root.iter():
        if local(pm.tag) != "Placemark":
            continue
        geom = geom_from_element(pm)
        if not geom:
            continue
        name = ""
        desc = ""
        for c in pm:
            if local(c.tag) == "name":
                name = (c.text or "").strip()
            if local(c.tag) == "description":
                desc = (c.text or "").strip()
        idx += 1
        props = {
            "name": name or f"Placemark {idx}",
            "description": desc,
            "folder": folder_path(pm, parents),
            "source_kmz": path.name,
            **extended_data(pm),
        }
        features.append({"type": "Feature", "properties": props, "geometry": geom})
    return features


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_layers = []
    for out_name, kmz_path, label in KMZ_JOBS:
        if not kmz_path.exists():
            raise SystemExit(f"Missing {kmz_path}")
        print(f"converting {label} …")
        feats = kmz_to_features(kmz_path)
        fc = {
            "type": "FeatureCollection",
            "name": out_name,
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
            "meta": {
                "source": f"GIS-Source/ops_lyrs/{label}",
                "sourcePath": str(kmz_path),
                "featureCount": len(feats),
                "convertedAt": datetime.now(timezone.utc).isoformat(),
                "note": "Coordinates preserved from KMZ; folder ancestry in properties.folder",
            },
            "features": feats,
        }
        out_path = OUT / f"{out_name}.geojson"
        out_path.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
        mb = out_path.stat().st_size / (1024 * 1024)
        print(f"  → {out_name}.geojson  {len(feats)} features  {mb:.2f} MB")
        manifest_layers.append(
            {"id": out_name, "file": f"{out_name}.geojson", "features": len(feats), "source": label}
        )

    (OUT / "manifest.json").write_text(
        json.dumps(
            {
                "phase": "1B-ops-kmz-independent",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "sourceRoot": str(SRC),
                "layers": manifest_layers,
                "deferred": ["vsp road/VSP.shp — LCC projected; not independent KMZ"],
                "conflictPolicy": {
                    "d_routes": "Replaces public/geo/ap-agency-route.geojson for lyr-drug-routes",
                    "foot_tracks": "Replaces Waymarked Trails OSM tiles for lyr-forest-trails",
                    "check_posts": "Authoritative for lyr-checkposts (was empty stub)",
                    "hotspots": "Authoritative for lyr-hotspots (was empty stub)",
                    "ganja_seized": "Authoritative for lyr-seizure-points (replaces empty seizure polys stub)",
                    "asr_boundary": "Authoritative for lyr-asr-agency (was empty stub)",
                    "main_roads": "OPS main roads layer; Admin ap_roads_major remains Admin catalog",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("manifest.json written")


if __name__ == "__main__":
    main()
