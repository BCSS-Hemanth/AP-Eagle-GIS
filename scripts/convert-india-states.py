"""
Build India states + outline GeoJSON from DataMeet Admin2 (post-2014).

Source: https://github.com/datameet/maps States/Admin2
License: CC BY 4.0 — India boundaries by DataMeet India community
Includes separate Andhra Pradesh & Telangana, Ladakh UT, merged DNH & DD.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import shapefile
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / "_tmp_geo" / "datameet-states"
OUT = ROOT / "public" / "geo"
BASE_URL = "https://raw.githubusercontent.com/datameet/maps/master/States/Admin2"


def ensure_source() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    base = CACHE / "Admin2"
    for ext in ("shp", "dbf", "shx", "prj", "cpg"):
        path = CACHE / f"Admin2.{ext}"
        if path.exists() and path.stat().st_size > 0:
            continue
        url = f"{BASE_URL}.{ext}"
        print(f"download {url}")
        urllib.request.urlretrieve(url, path)
    return base


def round_coords(obj, digits=4):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(obj[0]), digits), round(float(obj[1]), digits)]
        return [round_coords(x, digits) for x in obj]
    return obj


def main() -> None:
    base = ensure_source()
    sf = shapefile.Reader(str(base), encoding="utf-8", encodingErrors="replace")
    fields = [f[0] for f in sf.fields[1:]]
    feats = []
    geoms = []
    for sr in sf.iterShapeRecords():
        props = dict(zip(fields, sr.record))
        name = str(props.get("ST_NM") or "").strip()
        geom = shape(sr.shape.__geo_interface__)
        if geom.is_empty:
            continue
        geom = geom.simplify(0.005, preserve_topology=True)
        geoms.append(geom)
        gj = mapping(geom)
        gj = {"type": gj["type"], "coordinates": round_coords(gj["coordinates"], 4)}
        c = geom.representative_point()
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "state_name": name,
                    "st_nm": name,
                    "label_lon": round(c.x, 4),
                    "label_lat": round(c.y, 4),
                    "area_deg2": round(geom.area, 5),
                    "source": "DataMeet India States Admin2 (Jan 2020, CC BY 4.0)",
                },
                "geometry": gj,
            }
        )

    outline = unary_union(geoms).simplify(0.008, preserve_topology=True)
    out_gj = mapping(outline)
    out_gj = {"type": out_gj["type"], "coordinates": round_coords(out_gj["coordinates"], 4)}

    (OUT / "india-states.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "name": "india-states",
                "meta": {
                    "source": "DataMeet maps States/Admin2",
                    "license": "CC BY 4.0",
                    "attribution": "India boundaries by DataMeet India community (CC BY 4.0)",
                    "asOf": "2020-01",
                },
                "features": feats,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (OUT / "india-outline.geojson").write_text(
        json.dumps(
            {
                "type": "Feature",
                "properties": {"name": "India", "source": "DataMeet Admin2 dissolve"},
                "geometry": out_gj,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"states={len(feats)}")
    assert any(f["properties"]["state_name"] == "Telangana" for f in feats)
    assert any(f["properties"]["state_name"] == "Andhra Pradesh" for f in feats)


if __name__ == "__main__":
    main()
