"""Inventory catalog layers that actually intersect Alluri Sitharama Raju (ASR)."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from shapely.geometry import shape
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]


def load_asr():
    dists = json.loads((ROOT / "public/geo/ap-districts-2022.geojson").read_text(encoding="utf-8"))
    asr_f = next(
        f
        for f in dists["features"]
        if str(f.get("properties", {}).get("code", "")).upper() == "ASR"
        or "alluri" in str(f.get("properties", {}).get("district_name", "")).lower()
    )
    geom = shape(asr_f["geometry"]).buffer(0)
    return asr_f["properties"], geom, prep(geom)


def feature_intersects(geom, asr_prep) -> bool:
    try:
        g = shape(geom)
        if g.is_empty:
            return False
        if g.geom_type in ("Polygon", "MultiPolygon"):
            g = g.buffer(0)
        return asr_prep.intersects(g)
    except Exception:
        return False


def count_fc(path: Path, asr_prep):
    if not path.exists():
        return None, "missing"
    data = json.loads(path.read_text(encoding="utf-8"))
    feats = data.get("features") or []
    hit = 0
    samples: list[str] = []
    for f in feats:
        g = f.get("geometry")
        if not g:
            continue
        if feature_intersects(g, asr_prep):
            hit += 1
            if len(samples) < 5:
                props = f.get("properties") or {}
                name = (
                    props.get("name")
                    or props.get("NAME")
                    or props.get("mandal_name")
                    or props.get("district_name")
                    or props.get("MAP_NO")
                    or props.get("folder")
                    or props.get("RD_SUB_TYP")
                    or ""
                )
                samples.append(str(name)[:70])
    return {"total": len(feats), "in_asr": hit, "samples": samples}, None


def count_villages(asr_prep, asr_props):
    """Villages may be a directory of tiles or filtered by district attribute."""
    vil_dir = ROOT / "public/geo/villages"
    if not vil_dir.exists():
        return None, "missing"
    files = sorted(vil_dir.glob("*.geojson"))
    if not files:
        return None, "empty-dir"
    hit = 0
    total = 0
    samples: list[str] = []
    district_keys = ("district_name", "DISTRICT", "district", "DIST")
    asr_names = {
        "alluri sitharama raju",
        "alluri sitharamaraju",
        "asr",
        str(asr_props.get("district_name", "")).lower(),
    }
    for fp in files:
        data = json.loads(fp.read_text(encoding="utf-8"))
        for f in data.get("features") or []:
            total += 1
            props = f.get("properties") or {}
            # Prefer attribute match when present; else spatial
            attr = ""
            for k in district_keys:
                if props.get(k):
                    attr = str(props[k]).strip().lower()
                    break
            if attr and attr in asr_names:
                hit += 1
            elif f.get("geometry") and feature_intersects(f["geometry"], asr_prep):
                hit += 1
            else:
                continue
            if len(samples) < 5:
                samples.append(
                    str(
                        props.get("village_name")
                        or props.get("VIL_NAME")
                        or props.get("name")
                        or ""
                    )[:70]
                )
    return {"total": total, "in_asr": hit, "samples": samples, "files": len(files)}, None


def count_api_roads(layer: str, asr_bounds, asr_prep):
    west, south, east, north = asr_bounds
    # pad slightly
    pad = 0.02
    bbox = f"{west - pad},{south - pad},{east + pad},{north + pad}"
    url = f"http://127.0.0.1:8787/api/gis-roads/geojson?layer={layer}&bbox={bbox}&limit=50000"
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None, f"api-error:{e}"
    feats = data.get("features") or []
    hit = 0
    samples: list[str] = []
    for f in feats:
        g = f.get("geometry")
        if not g:
            continue
        if feature_intersects(g, asr_prep):
            hit += 1
            if len(samples) < 3:
                props = f.get("properties") or {}
                samples.append(str(props.get("rd_sub_typ") or props.get("RD_SUB_TYP") or props.get("name") or "")[:60])
    return {"total": len(feats), "in_asr": hit, "samples": samples, "via": "api-bbox"}, None


def main():
    asr_props, asr_geom, asr_prep = load_asr()
    print("ASR", asr_props)
    print("bounds", [round(x, 4) for x in asr_geom.bounds])

    layers = {
        "Administrative": [
            ("lyr-state-border", "State Border (AP, post-2014)", ROOT / "public/geo/ap-state.geojson"),
            ("lyr-districts", "District Boundaries (26 Dists, 2022)", ROOT / "public/geo/ap-districts-2022.geojson"),
            (
                "lyr-districts-gis-hist",
                "GIS-Source Districts (25, pre-2014 undivided)",
                ROOT / "public/geo/gis-source/admin/ap_districts_gis_source.geojson",
            ),
            (
                "lyr-state-gis-hist",
                "GIS-Source AP State (IND_adm1 undivided)",
                ROOT / "public/geo/gis-source/admin/ap_state_gis_source.geojson",
            ),
            ("lyr-mandals", "Mandals", ROOT / "public/geo/ap-mandals.geojson"),
            ("lyr-pss", "Police Stations", ROOT / "public/geo/ap-police-stations.geojson"),
            ("lyr-border-ps", "Border Police Stations", ROOT / "public/geo/gis-source/admin/border_ps.geojson"),
            ("lyr-taluk-gis", "Taluks / Mandals (GIS-Source)", ROOT / "public/geo/gis-source/admin/ap_taluk_gis_source.geojson"),
            ("lyr-vsp-village-pts", "VSP / AOB Village Points", ROOT / "public/geo/gis-source/admin/vsp_villages_pts.geojson"),
            ("lyr-railways", "Indian Railway (Admin extra)", ROOT / "public/geo/gis-source/admin/rail_nt.geojson"),
            ("lyr-soi-grid", "SOI 1:50K Map-No Points", ROOT / "public/geo/gis-source/admin/soi_50k_grid.geojson"),
        ],
        "Operational": [
            ("lyr-hotspots", "Mapped Hotspots", ROOT / "public/geo/gis-source/ops/hotspots.geojson"),
            ("lyr-drug-routes", "Drug Routes", ROOT / "public/geo/gis-source/ops/d_routes.geojson"),
            ("lyr-checkposts", "Check Posts", ROOT / "public/geo/gis-source/ops/check_posts.geojson"),
            ("lyr-toll-plazas", "Toll Plazas", ROOT / "public/geo/gis-source/ops/toll_plazas.geojson"),
            ("lyr-seizure-polys", "Ganja Seized Points", ROOT / "public/geo/gis-source/ops/ganja_seized.geojson"),
            ("lyr-asr-agency", "ASR Dist-Admin Boundary", ROOT / "public/geo/gis-source/ops/asr_boundary.geojson"),
            ("lyr-pharma-hubs", "Chemical / Pharma Hubs", ROOT / "public/geo/gis-source/ops/pharma_hubs.geojson"),
            ("lyr-ddacs", "DDACs", ROOT / "public/geo/gis-source/ops/ddacs.geojson"),
            ("lyr-entry-exit", "Entry & Exit Points", ROOT / "public/geo/gis-source/ops/entry_exit.geojson"),
            ("lyr-stock-points", "Stock Points", ROOT / "public/geo/gis-source/ops/stock_points.geojson"),
        ],
        "Road Network": [
            ("lyr-ops-main-roads", "OPS Main Roads", ROOT / "public/geo/gis-source/ops/main_roads.geojson"),
            ("lyr-ops-internal-roads", "OPS Internal Roads", ROOT / "public/geo/gis-source/ops/internal_roads.geojson"),
            ("lyr-ap-roads-major", "AP Major Roads NH/SH/MDR", ROOT / "public/geo/gis-source/admin/ap_roads_major.geojson"),
            ("lyr-rivers", "Major Rivers", ROOT / "public/geo/ap-rivers.geojson"),
            ("lyr-waterbodies", "Lakes & reservoirs", ROOT / "public/geo/ap-waterbodies.geojson"),
            ("lyr-forest-trails", "Foot Tracks", ROOT / "public/geo/gis-source/ops/foot_tracks.geojson"),
            ("lyr-railways", "Indian Railway", ROOT / "public/geo/gis-source/admin/rail_nt.geojson"),
        ],
    }

    report: dict[str, list] = {k: [] for k in layers}

    # Villages special
    vil, verr = count_villages(asr_prep, asr_props)
    if not verr and vil and vil["in_asr"] > 0:
        report["Administrative"].append(("lyr-villages", "Revenue Villages", vil))
    elif verr:
        print("villages:", verr)
    else:
        print("villages in_ASR=0", vil)

    for cat, rows in layers.items():
        print("\n==", cat, "==")
        for lid, name, path in rows:
            res, err = count_fc(path, asr_prep)
            if err:
                print(f"  SKIP {lid} | {name}: {err}")
                continue
            mark = "YES" if res["in_asr"] > 0 else "NO "
            print(f"  {mark} {lid} | {name} | in_ASR={res['in_asr']} / total={res['total']} | {res['samples']}")
            if res["in_asr"] > 0:
                report[cat].append((lid, name, res))

    # API road layers
    print("\n== Road API ==")
    for lid, name, layer in [
        ("lyr-highways", "National Highways", "nh"),
        ("lyr-ap-roads-full", "AP Roads Full Network", "full"),
        ("lyr-ops-vsp-roads", "OPS VSP Roads", "vsp"),
    ]:
        res, err = count_api_roads(layer, asr_geom.bounds, asr_prep)
        if err:
            print(f"  SKIP {lid} | {name}: {err}")
            continue
        mark = "YES" if res["in_asr"] > 0 else "NO "
        print(f"  {mark} {lid} | {name} | in_ASR={res['in_asr']} / bbox_total={res['total']} | {res['samples']}")
        if res["in_asr"] > 0:
            report["Road Network"].append((lid, name, res))

    print("\n\n===== AVAILABLE IN ASR ONLY =====")
    for cat, rows in report.items():
        print(f"\n{cat}:")
        if not rows:
            print("  (none)")
            continue
        for lid, name, res in rows:
            print(f"  - {name} ({lid}): {res['in_asr']} feature(s)")


if __name__ == "__main__":
    main()
