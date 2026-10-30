"""Download official/open AP mandal (sub-district) and village polygons; simplify for the web map."""
from __future__ import annotations

import json
import math
import ssl
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "geo"
TMP = Path(__file__).resolve().parents[1] / "scripts" / "_tmp_geo"
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
CTX = ssl.create_default_context()
HEADERS = {"User-Agent": "EAGLE-AP-GIS/1.0 (local development)"}

VILLAGE_ZIP = (
    "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/"
    "resource/80335829-b05e-4b0f-a920-91971a93bce1/download/vb_soi_ap_geojson.zip"
)
MANDAL_GEOJSON = (
    "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/"
    "releaseData/gbOpen/IND/ADM3/geoBoundaries-IND-ADM3_simplified.geojson"
)
MANDAL_GEOJSON_ALT = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM3/"
    "geoBoundaries-IND-ADM3_simplified.geojson"
)


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"cached {dest} ({dest.stat().st_size} bytes)")
        return dest
    print(f"GET {url}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=CTX, timeout=300) as resp:
        dest.write_bytes(resp.read())
    print(f"  saved {dest} ({dest.stat().st_size} bytes)")
    return dest


def dist2(a: list[float], b: list[float]) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def simplify_ring(coords: list, tol: float) -> list:
    if len(coords) <= 4:
        return [[round(c[0], 5), round(c[1], 5)] for c in coords]
    tol2 = tol * tol
    kept = [coords[0]]
    for pt in coords[1:-1]:
        if dist2(pt, kept[-1]) >= tol2:
            kept.append(pt)
    kept.append(coords[-1])
    if len(kept) < 4:
        step = max(1, len(coords) // 8)
        kept = coords[::step]
        if kept[-1] != coords[-1]:
            kept.append(coords[-1])
    return [[round(c[0], 5), round(c[1], 5)] for c in kept]


def simplify_geom(geom: dict, tol: float) -> dict | None:
    gtype = geom.get("type")
    if gtype == "Polygon":
        rings = [simplify_ring(r, tol) for r in geom.get("coordinates") or [] if len(r) >= 4]
        rings = [r for r in rings if len(r) >= 4]
        if not rings:
            return None
        return {"type": "Polygon", "coordinates": rings}
    if gtype == "MultiPolygon":
        polys = []
        for poly in geom.get("coordinates") or []:
            rings = [simplify_ring(r, tol) for r in poly if len(r) >= 4]
            rings = [r for r in rings if len(r) >= 4]
            if rings:
                polys.append(rings)
        if not polys:
            return None
        return {"type": "MultiPolygon", "coordinates": polys}
    return geom


def pick_name(props: dict, keys: list[str]) -> str:
    lower = {str(k).lower(): v for k, v in (props or {}).items()}
    for key in keys:
        for k, v in lower.items():
            if key in k and v not in (None, ""):
                return str(v)
    return ""


def write_fc(path: Path, features: list, extra: dict | None = None) -> None:
    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": features,
    }
    if extra:
        fc.update(extra)
    path.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"wrote {path.name}: {len(features)} features, {path.stat().st_size} bytes")


def process_mandals() -> None:
    dest = TMP / "ind-adm3-simplified.geojson"
    try:
        download(MANDAL_GEOJSON, dest)
    except Exception as exc:  # noqa: BLE001
        print("primary mandal download failed", exc)
        download(MANDAL_GEOJSON_ALT, dest)
    if dest.stat().st_size < 1000:
        raise SystemExit(f"ADM3 file too small: {dest.stat().st_size}")
    head = dest.read_text(encoding="utf-8", errors="replace")[:200]
    if "git-lfs" in head:
        raise SystemExit("ADM3 download was an LFS pointer")
    print("parsing ADM3…")
    data = json.loads(dest.read_text(encoding="utf-8"))
    features = []
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        blob = " ".join(str(v) for v in props.values()).lower()
        if "andhra pradesh" not in blob and "andhra_pradesh" not in blob:
            # some files use shapeGroup=IND and ADM1NAME
            adm1 = pick_name(props, ["adm1", "state", "shapegroup", "shapename"])
            if "andhra" not in adm1.lower() and props.get("shapeGroup") != "IND":
                continue
            # shapeName is the subdistrict; filter via adm1Name if present
            adm1n = pick_name(props, ["adm1name", "state_name", "statename", "shapeiso"])
            if adm1n and "andhra" not in adm1n.lower():
                continue
            if not adm1n:
                # last resort: skip unless a known AP district token appears
                continue
        name = pick_name(props, ["shapename", "mandal", "subdistrict", "tehsil", "taluk", "name"])
        district = pick_name(props, ["adm2", "district"])
        geom = simplify_geom(feat.get("geometry") or {}, 0.0018)
        if not geom or not name:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "mandal_name": name,
                    "district_name": district,
                    "source": "geoBoundaries ADM3 (LGD/SOI sub-district)",
                },
                "geometry": geom,
            }
        )
    write_fc(OUT / "ap-mandals.geojson", features, {"name": "andhra_pradesh_mandals"})


def extract_zip_geojson(zpath: Path) -> dict:
    with zipfile.ZipFile(zpath) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith((".geojson", ".json"))]
        if not names:
            raise SystemExit(f"no geojson in {zpath}: {zf.namelist()[:12]}")
        print("zip members geojson", names)
        with zf.open(names[0]) as fh:
            return json.loads(fh.read().decode("utf-8"))


def process_villages() -> None:
    dest = TMP / "vb_soi_ap_geojson.zip"
    download(VILLAGE_ZIP, dest)
    data = extract_zip_geojson(dest)
    features = []
    sample_props = None
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        if sample_props is None:
            sample_props = list(props.keys())
            print("village property keys", sample_props)
        name = pick_name(props, ["village", "vil_name", "vname", "name"])
        mandal = pick_name(props, ["mandal", "subdis", "tehsil", "taluk"])
        district = pick_name(props, ["district", "dtname", "dist"])
        geom = simplify_geom(feat.get("geometry") or {}, 0.0022)
        if not geom:
            continue
        if not name:
            name = f"village-{len(features)+1}"
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "village_name": name,
                    "mandal_name": mandal,
                    "district_name": district,
                    "source": "NWIC / SOI Village Boundary of Andhra Pradesh",
                },
                "geometry": geom,
            }
        )
    write_fc(OUT / "ap-villages.geojson", features, {"name": "andhra_pradesh_villages"})


def main() -> None:
    process_villages()
    process_mandals()
    print("done")


if __name__ == "__main__":
    main()
