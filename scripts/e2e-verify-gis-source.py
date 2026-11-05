import json
from pathlib import Path

root = Path("public/geo/gis-source")
errors = []

print("=== OPS ===")
ops = json.loads((root / "ops" / "manifest.json").read_text(encoding="utf-8"))
for L in ops["layers"]:
    p = root / "ops" / L["file"]
    fc = json.loads(p.read_text(encoding="utf-8"))
    n = len(fc["features"])
    ok = n == L["features"]
    print(f"  {L['id']}: manifest={L['features']} file={n} match={ok}")
    if not ok:
        errors.append(f"ops {L['id']}")
    # spot-check WGS84
    for f in fc["features"][:3]:
        g = f.get("geometry") or {}
        coords = g.get("coordinates")
        if not coords:
            errors.append(f"ops {L['id']} empty geom")
            continue

        def walk(c):
            if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
                lon, lat = c[0], c[1]
                if not (65 <= lon <= 100 and 5 <= lat <= 40):
                    errors.append(f"ops {L['id']} suspicious lonlat {lon},{lat}")
                return
            if isinstance(c, (list, tuple)):
                for x in c:
                    walk(x)

        walk(coords)

print("=== RASTER ===")
cat = json.loads((root / "raster" / "catalog.json").read_text(encoding="utf-8"))
for p in cat["products"]:
    m = json.loads((root / "raster" / p["file"]).read_text(encoding="utf-8"))
    n = len(m["overlays"])
    ok = n == p["overlays"]
    print(f"  {p['id']}: catalog={p['overlays']} manifest={n} match={ok}")
    if not ok:
        errors.append(f"raster {p['id']}")
    for ov in m["overlays"][:2]:
        tile = Path("public") / ov["url"].lstrip("/")
        if not tile.exists():
            errors.append(f"missing tile {ov['url']}")
        if not (5 < ov["south"] < ov["north"] < 40 and 65 < ov["west"] < ov["east"] < 100):
            errors.append(f"bad box {p['id']} {ov['id']}")

print("=== ADMIN ===")
expected = {
    "ap_state_gis_source": 1,
    "ap_districts_gis_source": 25,
    "ap_taluk_gis_source": 208,
    "vsp_villages_pts": 4926,
    "border_ps": 111,
    "soi_50k_grid": 564,
    "rail_nt": 43,
    "ap_roads_major": 5917,
}
for name, exp in expected.items():
    fc = json.loads((root / "admin" / f"{name}.geojson").read_text(encoding="utf-8"))
    n = len(fc["features"])
    gtypes = {}
    for f in fc["features"]:
        t = (f.get("geometry") or {}).get("type") or "null"
        gtypes[t] = gtypes.get(t, 0) + 1
    print(f"  {name}: n={n} expected={exp} match={n==exp} geoms={gtypes}")
    if n != exp:
        errors.append(f"admin {name}")
    if name == "soi_50k_grid" and set(gtypes) != {"Point"}:
        errors.append("soi not all Point")

# legend mapping sanity from apGisData via reading file
ap = Path("src/data/apGisData.ts").read_text(encoding="utf-8")
needles = [
    "gis-source/ops/hotspots",
    "gis-source/ops/d_routes",
    "gis-source/ops/foot_tracks",
    "gis-source/admin/border_ps",
    "gis-source/admin/ap_taluk",
    "gis-source/raster/google_terrain",
    "gis-source/raster/soi_topo",
    "ap-districts-2022",  # primary drill kept
]
print("=== LEGEND PATHS ===")
for n in needles:
    hit = n in ap
    print(f"  {n}: {'OK' if hit else 'MISSING'}")
    if not hit:
        errors.append(f"legend {n}")

print("=== RESULT ===")
if errors:
    print("FAILURES:", len(errors))
    for e in errors:
        print(" -", e)
    raise SystemExit(1)
print("ALL CHECKS PASSED")
