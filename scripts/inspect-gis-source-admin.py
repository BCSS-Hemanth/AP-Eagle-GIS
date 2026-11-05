"""Inspect GIS-Source Admin shapefiles: CRS, fields, counts, bbox, samples."""
from __future__ import annotations

import json
from pathlib import Path

import shapefile  # pyshp

ROOT = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Admin\Admin")
OUT = Path(__file__).resolve().parents[1] / "scripts" / "_admin_inspect_report.json"
APP = Path(__file__).resolve().parents[1] / "public" / "geo"


SHPS = [
    ("ap_roads", ROOT / "ap_road network" / "ap_roads"),
    ("districts", ROOT / "Dists" / "districts"),
    ("rail_nt", ROOT / "Ind_Rail_nw" / "rail_nt"),
    ("borderps", ROOT / "pss" / "borderps"),
    ("soi_50k", ROOT / "SOI_50K_grid" / "50k_grid_nos"),
    ("ind_adm1", ROOT / "STATES" / "IND_adm1"),
    ("taluk", ROOT / "Taluk" / "Talukas" / "taluk"),
    ("vsp", ROOT / "villages" / "vsp" / "vsp"),
]


def read_prj(base: Path) -> str:
    prj = base.with_suffix(".prj")
    return prj.read_text(encoding="utf-8", errors="replace").strip() if prj.exists() else ""


def crs_hint(prj: str) -> str:
    u = prj.upper()
    if "WGS_1984" in u or "GCS_WGS_1984" in u or 'GEOGCS["WGS 84"' in prj:
        return "EPSG:4326 (geographic WGS84)"
    if "LAMBERT" in u or "LCC" in u:
        return "Projected Lambert Conformal Conic (needs reprojection to WGS84)"
    if "UTM" in u:
        return "Projected UTM"
    if prj:
        return "See PRJ"
    return "Unknown (no .prj)"


def inspect_shp(base: Path) -> dict:
    r = shapefile.Reader(str(base), encoding="latin1")
    fields = [(f[0], f[1], f[2], f[3]) for f in r.fields[1:]]  # skip DeletionFlag
    shapes = r.shapes()
    records = r.records()
    n = len(shapes)
    types = {}
    xs: list[float] = []
    ys: list[float] = []
    for s in shapes:
        types[s.shapeTypeName] = types.get(s.shapeTypeName, 0) + 1
        try:
            bb = getattr(s, "bbox", None)
            if bb:
                xs.extend([bb[0], bb[2]])
                ys.extend([bb[1], bb[3]])
                continue
        except Exception:
            pass
        pts = getattr(s, "points", None) or []
        for x, y in pts:
            xs.append(x)
            ys.append(y)
    samples = []
    field_names = [f[0] for f in fields]
    for i in range(min(5, n)):
        rec = {field_names[j]: records[i][j] for j in range(len(field_names))}
        samples.append(rec)
    # unique value counts for key-looking fields
    uniques = {}
    for name in field_names:
        idx = field_names.index(name)
        vals = set()
        for rec in records[: min(n, 5000)]:
            vals.add(str(rec[idx]).strip())
            if len(vals) > 80:
                break
        uniques[name] = {"approxDistinct_first5k": len(vals), "sample": sorted(list(vals))[:12]}
    return {
        "base": str(base),
        "featureCount": n,
        "geometryTypes": types,
        "fields": [{"name": a, "type": b, "length": c, "decimal": d} for a, b, c, d in fields],
        "prj": read_prj(base),
        "crsHint": crs_hint(read_prj(base)),
        "bbox": {"west": min(xs), "south": min(ys), "east": max(xs), "north": max(ys)} if xs else None,
        "samples": samples,
        "fieldUniques": uniques,
    }


def geojson_meta(path: Path) -> dict | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    feats = data.get("features") or []
    return {
        "path": str(path.relative_to(APP.parent)) if APP.parent in path.parents else str(path),
        "featureCount": len(feats),
        "meta": data.get("meta"),
        "name": data.get("name"),
    }


def main() -> None:
    report = {"sourceRoot": str(ROOT), "datasets": [], "appExisting": {}}
    for key, base in SHPS:
        print("inspect", key)
        info = inspect_shp(base)
        info["id"] = key
        report["datasets"].append(info)
        print(
            f"  {key}: n={info['featureCount']} crs={info['crsHint']} types={info['geometryTypes']}"
        )

    # app geo comparison candidates
    for label, rel in [
        ("ap_state", "ap-state.geojson"),
        ("ap_districts_2022", "ap-districts-2022.geojson"),
        ("ap_police", "ap-police-stations.geojson"),
        ("gs_state", "gis-source/admin/ap_state_gis_source.geojson"),
        ("gs_districts", "gis-source/admin/ap_districts_gis_source.geojson"),
        ("gs_taluk", "gis-source/admin/ap_taluk_gis_source.geojson"),
        ("gs_vsp", "gis-source/admin/vsp_villages_pts.geojson"),
        ("gs_border", "gis-source/admin/border_ps.geojson"),
        ("gs_soi", "gis-source/admin/soi_50k_grid.geojson"),
        ("gs_rail", "gis-source/admin/rail_nt.geojson"),
        ("gs_roads", "gis-source/admin/ap_roads_major.geojson"),
        ("gs_manifest", "gis-source/admin/manifest.json"),
    ]:
        p = APP / rel
        if rel.endswith("manifest.json") and p.exists():
            report["appExisting"][label] = json.loads(p.read_text(encoding="utf-8"))
        else:
            report["appExisting"][label] = geojson_meta(p)

    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
