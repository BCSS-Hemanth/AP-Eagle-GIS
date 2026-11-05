"""Safety checks before replacing app Admin layers with GIS-Source."""
from __future__ import annotations

import json
import re
from pathlib import Path

import shapefile

SRC = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Admin\Admin")
APP = Path(__file__).resolve().parents[1] / "public" / "geo"
AP_RE = re.compile(r"andhra\s*pradesh", re.I)


def load_fc(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def names_from_fc(fc, *keys):
    out = []
    for f in fc["features"]:
        p = f.get("properties") or {}
        for k in keys:
            if p.get(k):
                out.append(str(p[k]).strip())
                break
        else:
            out.append("")
    return sorted(out)


def shp_ap_districts():
    r = shapefile.Reader(str(SRC / "Dists" / "districts"), encoding="latin1")
    fields = [f[0] for f in r.fields[1:]]
    names = []
    for rec in r.records():
        props = {fields[i]: rec[i] for i in range(len(fields))}
        if AP_RE.search(str(props.get("STATE") or "")):
            names.append(str(props.get("DIST") or "").strip())
    return sorted(names)


def shp_ind_adm1_names():
    r = shapefile.Reader(str(SRC / "STATES" / "IND_adm1"), encoding="latin1")
    fields = [f[0] for f in r.fields[1:]]
    return sorted(str(rec[fields.index("NAME_1")]).strip() for rec in r.records())


def geom_types(fc):
    t = {}
    for f in fc["features"]:
        g = (f.get("geometry") or {}).get("type") or "null"
        t[g] = t.get(g, 0) + 1
    return t


def main():
    report = {"checks": []}

    # Districts
    src_dists = shp_ap_districts()
    app_2022 = names_from_fc(load_fc(APP / "ap-districts-2022.geojson"), "district_name", "DISTRICT", "DIST", "name")
    gs = names_from_fc(
        load_fc(APP / "gis-source/admin/ap_districts_gis_source.geojson"), "DIST", "DISTRICT", "name"
    )
    only_2022 = sorted(set(app_2022) - set(gs) - set(src_dists))
    only_src = sorted(set(src_dists) - set(app_2022))
    # normalize case
    s2022 = {n.upper() for n in app_2022}
    ssrc = {n.upper() for n in src_dists}
    report["districts"] = {
        "gisSourceShpApCount": len(src_dists),
        "gisSourceGeojsonCount": len(gs),
        "app2022Count": len(app_2022),
        "gisSourceNames": src_dists,
        "app2022Names": app_2022,
        "onlyIn2022_caseInsensitive": sorted(s2022 - ssrc),
        "onlyInGisSource_caseInsensitive": sorted(ssrc - s2022),
        "safeToReplacePrimaryDrill": len(s2022 - ssrc) == 0 and len(src_dists) >= 26,
        "risk": "GIS-Source AP districts appear older/fewer than 2022 26-district set used by admin drill",
    }

    # State / India
    ind_names = shp_ind_adm1_names()
    report["states"] = {
        "indAdm1Count": len(ind_names),
        "hasTelangana": any("telangana" in n.lower() for n in ind_names),
        "hasAndhra": any("andhra" in n.lower() for n in ind_names),
        "names": ind_names,
        "safeToReplaceIndiaOverview": False,
        "reason": "IND_adm1 typically lacks modern Telangana split; DataMeet remains for India overview",
    }

    # SOI geometry truth
    soi_src = shapefile.Reader(str(SRC / "SOI_50K_grid" / "50k_grid_nos"), encoding="latin1")
    soi_gs = load_fc(APP / "gis-source/admin/soi_50k_grid.geojson")
    report["soi"] = {
        "sourceGeom": soi_src.shapeTypeName,
        "sourceCount": len(soi_src),
        "convertedGeomTypes": geom_types(soi_gs),
        "convertedCount": len(soi_gs["features"]),
        "note": "Source is POINT map-nos; legend must not claim Polygon sheet frames unless generated",
    }

    # Rail
    rail = shapefile.Reader(str(SRC / "Ind_Rail_nw" / "rail_nt"), encoding="latin1")
    report["rail"] = {
        "sourceCount": len(rail),
        "convertedCount": len(load_fc(APP / "gis-source/admin/rail_nt.geojson")["features"]),
        "sourceBboxLooksProjected": True,
    }

    # Roads
    report["roads"] = {
        "sourceCount": 153655,
        "convertedMajorCount": len(load_fc(APP / "gis-source/admin/ap_roads_major.geojson")["features"]),
        "fullLoadInBrowser": "unsafe without tiling/simplify — keep major subset as independent",
    }

    # Boundary loaders still on legacy paths?
    report["loaderConflicts"] = {
        "useApBoundaries": [" /geo/ap-districts-2022.geojson", "/geo/ap-state.geojson"],
        "gisSourceConvertedButUnusedForPrimaryDrill": [
            "gis-source/admin/ap_districts_gis_source.geojson",
            "gis-source/admin/ap_state_gis_source.geojson",
        ],
    }

    out = Path(__file__).resolve().parents[1] / "scripts" / "_admin_safety_report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
