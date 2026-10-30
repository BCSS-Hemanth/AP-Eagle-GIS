"""Build web-sized AP mandal + village GeoJSON from NWIC/SOI village polygons."""
from __future__ import annotations

import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform, unary_union

TO_WGS84 = Transformer.from_crs("EPSG:7755", "EPSG:4326", always_xy=True).transform

ROOT = Path(__file__).resolve().parents[1]
ZIP_PATH = ROOT / "scripts" / "_tmp_geo" / "vb_soi_ap_geojson.zip"
OUT = ROOT / "public" / "geo"


def strip_props(props: dict) -> dict:
    return {str(k).replace("\n", " ").strip(): v for k, v in (props or {}).items()}


def clean(v) -> str:
    return str(v or "").replace("\n", " ").strip()


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")
    return s or "unknown"


def largest_poly(g):
    if g.geom_type == "Polygon":
        return Polygon(g.exterior)
    if g.geom_type == "MultiPolygon":
        parts = sorted((Polygon(p.exterior) for p in g.geoms if not p.is_empty), key=lambda p: p.area, reverse=True)
        return parts[0] if parts else g
    return g


def round_geom(geom: dict, ndigits: int = 4) -> dict:
    def rnd(coords):
        if coords and isinstance(coords[0], (int, float)):
            return [round(float(coords[0]), ndigits), round(float(coords[1]), ndigits)]
        return [rnd(c) for c in coords]

    return {"type": geom["type"], "coordinates": rnd(geom["coordinates"])}


def dump(path: Path, features: list, name: str) -> None:
    fc = {
        "type": "FeatureCollection",
        "name": name,
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": features,
    }
    path.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"{path.name}: {len(features)} features, {path.stat().st_size / 1024 / 1024:.2f} MB")


def main() -> None:
    with zipfile.ZipFile(ZIP_PATH) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith((".geojson", ".json")))
        data = json.loads(zf.read(name).decode("utf-8"))

    village_features = []
    by_mandal: dict[str, list] = defaultdict(list)
    mandal_district: dict[str, str] = {}
    by_district: dict[str, list] = defaultdict(list)

    for feat in data.get("features") or []:
        props = strip_props(feat.get("properties") or {})
        geom_in = feat.get("geometry")
        if not geom_in:
            continue
        try:
            g = transform(TO_WGS84, shape(geom_in))
            if g.is_empty:
                continue
            if not g.is_valid:
                g = g.buffer(0)
            g = largest_poly(g).simplify(0.0022, preserve_topology=True)
            if g.is_empty:
                continue
        except Exception:
            continue

        village = clean(props.get("village")) or "Unnamed village"
        mandal = clean(props.get("subdistrict")) or clean(props.get("block")) or "Unknown mandal"
        district = clean(props.get("district")) or "Unknown district"
        gj = round_geom(mapping(g), 4)
        item = {
            "type": "Feature",
            "properties": {
                "village_name": village,
                "mandal_name": mandal,
                "district_name": district,
            },
            "geometry": gj,
        }
        village_features.append(item)
        by_district[district].append(item)
        by_mandal[mandal].append(g)
        mandal_district[mandal] = district

    mandal_features = []
    for mandal, geoms in sorted(by_mandal.items()):
        try:
            u = unary_union(geoms)
            u = u.buffer(0.0008).buffer(-0.0008).simplify(0.0018, preserve_topology=True)
            if u.is_empty:
                continue
            mandal_features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "mandal_name": mandal,
                        "district_name": mandal_district.get(mandal, ""),
                        "village_count": len(geoms),
                    },
                    "geometry": round_geom(mapping(u), 4),
                }
            )
        except Exception as exc:  # noqa: BLE001
            print("mandal fail", mandal, exc)

    dump(OUT / "ap-mandals.geojson", mandal_features, "andhra_pradesh_mandals")

    # Split villages by district so the map loads only the visible set.
    index = []
    vdir = OUT / "villages"
    if vdir.exists():
        for old in vdir.glob("*.geojson"):
            old.unlink()
    vdir.mkdir(parents=True, exist_ok=True)
    for district, feats in sorted(by_district.items()):
        path = vdir / f"{slug(district)}.geojson"
        dump(path, feats, f"villages_{slug(district)}")
        xs, ys = [], []
        for feat in feats:
            coords = feat["geometry"]["coordinates"]
            ring = coords[0] if feat["geometry"]["type"] == "Polygon" else coords[0][0]
            for lon, lat in ring:
                xs.append(lon)
                ys.append(lat)
        index.append(
            {
                "district_name": district,
                "file": f"/geo/villages/{path.name}",
                "count": len(feats),
                "bbox": [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)],
            }
        )
    (OUT / "ap-villages-index.json").write_text(json.dumps({"type": "index", "source": "NWIC/SOI", "total": len(village_features), "districts": index}, separators=(",", ":")))
    print("village index", len(index), "districts, total", len(village_features))


if __name__ == "__main__":
    main()
