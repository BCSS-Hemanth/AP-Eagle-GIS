"""Phase 0/1A: convert GIS-Source Admin shapefiles → public/geo/gis-source/admin/*.geojson"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[1]

# Andhra Pradesh Survey / APSRAC-style LCC (from GIS-Source .prj files)
AP_LCC_WKT = (
    'PROJCS["Lambert Conformal Conic",'
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
    'PROJECTION["Lambert_Conformal_Conic"],'
    'PARAMETER["False_Easting",1000000.0],PARAMETER["False_Northing",1000000.0],'
    'PARAMETER["Central_Meridian",80.875],PARAMETER["Standard_Parallel_1",13.75],'
    'PARAMETER["Standard_Parallel_2",18.75],PARAMETER["Latitude_Of_Origin",16.25543298],'
    'UNIT["Meter",1.0]]'
)
AP_LCC_TO_WGS84 = Transformer.from_crs(CRS.from_wkt(AP_LCC_WKT), "EPSG:4326", always_xy=True).transform


def looks_projected(bounds) -> bool:
    minx, miny, maxx, maxy = bounds
    return abs(minx) > 180 or abs(maxx) > 180 or abs(miny) > 90 or abs(maxy) > 90


def to_wgs84(geom):
    if geom is None or geom.is_empty:
        return geom
    if looks_projected(geom.bounds):
        return shp_transform(AP_LCC_TO_WGS84, geom)
    return geom
SRC = Path(
    os.environ.get(
        "GIS_SOURCE_ADMIN",
        r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Admin\Admin",
    )
)
OUT = ROOT / "public" / "geo" / "gis-source" / "admin"
OUT.mkdir(parents=True, exist_ok=True)

AP_STATE_RE = re.compile(r"andhra\s*pradesh", re.I)
AP_BBOX = (76.5, 12.5, 85.0, 19.9)  # minLon, minLat, maxLon, maxLat
MAJOR_ROAD_RE = re.compile(
    r"\bNH\b|\bSH\b|\bMDR\b|NATIONAL\s*HIGHWAY|STATE\s*HIGHWAY|MAJOR\s*DISTRICT|NH-|SH-",
    re.I,
)


def prop_str(rec: dict, *keys: str) -> str:
    for k in keys:
        v = rec.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def is_ap_state(rec: dict) -> bool:
    return bool(AP_STATE_RE.search(prop_str(rec, "STATE", "NAME_1", "ST_NM", "state", "STATE_UT", "NAME")))


def geom_touches_ap(geom) -> bool:
    if geom is None or geom.is_empty:
        return False
    minx, miny, maxx, maxy = geom.bounds
    return not (maxx < AP_BBOX[0] or minx > AP_BBOX[2] or maxy < AP_BBOX[1] or miny > AP_BBOX[3])


def round_coords(obj, digits=5):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(obj[0]), digits), round(float(obj[1]), digits)]
        return [round_coords(x, digits) for x in obj]
    return obj


def slim_feature(geom, props: dict, keep: list[str], digits=5) -> dict:
    out_props = {k: props.get(k) for k in keep if k in props}
    g = mapping(geom) if geom is not None else None
    if g and "coordinates" in g:
        g = {"type": g["type"], "coordinates": round_coords(g["coordinates"], digits)}
    return {"type": "Feature", "properties": out_props, "geometry": g}


def read_shp(base: Path):
    print(f"  reading {base}")
    sf = shapefile.Reader(str(base), encoding="latin1", encodingErrors="replace")
    fields = [f[0] for f in sf.fields[1:]]
    features = []
    for sr in sf.iterShapeRecords():
        props = {fields[i]: sr.record[i] for i in range(len(fields))}
        try:
            geom = to_wgs84(shape(sr.shape.__geo_interface__))
        except Exception:
            continue
        if geom is None or geom.is_empty:
            continue
        features.append((geom, props))
    return features


def write_fc(name: str, features: list[dict], meta: dict) -> None:
    fc = {
        "type": "FeatureCollection",
        "name": name,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "meta": meta,
        "features": features,
    }
    path = OUT / f"{name}.geojson"
    text = json.dumps(fc, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    mb = path.stat().st_size / (1024 * 1024)
    print(f"wrote {name}.geojson — {len(features)} features, {mb:.2f} MB")


def main() -> None:
    print("SRC =", SRC)
    print("OUT =", OUT)
    if not SRC.exists():
        raise SystemExit(f"Source not found: {SRC}")

    # 1 state
    feats = []
    for geom, props in read_shp(SRC / "STATES" / "IND_adm1"):
        name = prop_str(props, "NAME_1", "NAME", "STATE")
        if AP_STATE_RE.search(name):
            feats.append(slim_feature(geom, props, ["ID_0", "ISO", "NAME_0", "ID_1", "NAME_1", "TYPE_1", "ENGTYPE_1"], 4))
    write_fc(
        "ap_state_gis_source",
        feats,
        {
            "source": "STATES/IND_adm1",
            "note": "AP only from IND_adm1 — undivided (no Telangana split); overlay only",
            "replacePrimaryStateBorder": False,
        },
    )

    # 2 districts
    feats = []
    for geom, props in read_shp(SRC / "Dists" / "districts"):
        if is_ap_state(props):
            feats.append(slim_feature(geom, props, ["DIST", "STATE", "DCODE", "DISTRICT"], 4))
    write_fc(
        "ap_districts_gis_source",
        feats,
        {
            "source": "Dists/districts",
            "note": "STATE=Andhra Pradesh filter — pre-2014 undivided AP+TG (NOT 2022 26-dist drill)",
            "replacePrimaryDrill": False,
        },
    )

    # 3 taluk
    feats = []
    for geom, props in read_shp(SRC / "Taluk" / "Talukas" / "taluk"):
        if is_ap_state(props):
            feats.append(slim_feature(geom, props, ["TALUK", "DISTRICT", "STATE", "TCODE", "DCODE"], 4))
    write_fc("ap_taluk_gis_source", feats, {"source": "Taluk/Talukas/taluk", "note": "STATE=Andhra Pradesh"})

    # 4 villages points
    feats = []
    for geom, props in read_shp(SRC / "villages" / "vsp" / "vsp"):
        feats.append(
            slim_feature(geom, props, ["VIL_NAME", "MANDAL", "PS_LIMITS", "DISTRICT", "REGION", "MAP_NO"], 5)
        )
    write_fc("vsp_villages_pts", feats, {"source": "villages/vsp/vsp", "note": "VSP/AOB points"})

    # 5 border PS
    feats = []
    for geom, props in read_shp(SRC / "pss" / "borderps"):
        feats.append(slim_feature(geom, props, ["POLICE_STA", "DISTRICT", "STATE", "MAP_NO", "SECTOR"], 5))
    write_fc("border_ps", feats, {"source": "pss/borderps", "note": "border PS sample"})

    # 6 SOI grid
    feats = []
    for geom, props in read_shp(SRC / "SOI_50K_grid" / "50k_grid_nos"):
        if geom_touches_ap(geom):
            feats.append(slim_feature(geom, props, ["MAP_NO", "SHEET", "NAME"], 4))
    write_fc(
        "soi_50k_grid",
        feats,
        {
            "source": "SOI_50K_grid/50k_grid_nos",
            "note": "POINT map-no markers (not polygon sheet frames); AP bbox intersection",
            "geometry": "Point",
        },
    )

    # 7 rail
    feats = []
    for geom, props in read_shp(SRC / "Ind_Rail_nw" / "rail_nt"):
        if geom_touches_ap(geom):
            feats.append(
                slim_feature(geom, props, ["LENGTH", "ID", "track_type", "from-to", "division"], 5)
            )
    write_fc(
        "rail_nt",
        feats,
        {
            "source": "Ind_Rail_nw/rail_nt",
            "note": "Reprojected AP LCC → WGS84; AP bbox intersection",
        },
    )

    # 8 major roads
    print("parsing ap_roads (large)…")
    source_count = 0
    major_count = 0
    feats = []
    for geom, props in read_shp(SRC / "ap_road network" / "ap_roads"):
        source_count += 1
        blob = f"{prop_str(props, 'RD_TYPE')} {prop_str(props, 'RD_SUB_TYP')} {prop_str(props, 'NAME')}"
        if not MAJOR_ROAD_RE.search(blob):
            continue
        major_count += 1
        if not geom_touches_ap(geom):
            continue
        # light simplify for browser size
        try:
            simplified = geom.simplify(0.0008, preserve_topology=True)
        except Exception:
            simplified = geom
        feats.append(slim_feature(simplified, props, ["RD_TYPE", "RD_SUB_TYP", "NAME", "LENGTH"], 4))
    write_fc(
        "ap_roads_major",
        feats,
        {
            "source": "ap_road network/ap_roads",
            "note": "NH/SH/MDR subset",
            "sourceFeatureCount": source_count,
            "majorFeatureCount": major_count,
        },
    )

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRoot": str(SRC),
        "layers": [
            "ap_state_gis_source",
            "ap_districts_gis_source",
            "ap_taluk_gis_source",
            "vsp_villages_pts",
            "border_ps",
            "soi_50k_grid",
            "rail_nt",
            "ap_roads_major",
        ],
        "phase": "1A-admin",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("manifest.json written")


if __name__ == "__main__":
    main()
