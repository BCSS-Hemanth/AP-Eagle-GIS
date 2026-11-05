import json
from pathlib import Path

r = json.loads(Path("scripts/_raster_inspect_report.json").read_text(encoding="utf-8"))
# ASR boundary from ops geojson if present
asr_path = Path("public/geo/gis-source/ops/asr_boundary.geojson")
asr = None
if asr_path.exists():
    fc = json.loads(asr_path.read_text(encoding="utf-8"))
    # bbox from coords
    xs, ys = [], []
    def walk(g):
        if isinstance(g, (list, tuple)) and g and isinstance(g[0], (int, float)):
            xs.append(g[0]); ys.append(g[1]); return
        if isinstance(g, (list, tuple)):
            for i in g: walk(i)
    for f in fc["features"]:
        walk(f["geometry"]["coordinates"])
    asr = {"west": min(xs), "east": max(xs), "south": min(ys), "north": max(ys)}
    print("ASR boundary bbox", asr)

nt_union = None
for f in r["files"]:
    name = Path(f["path"]).name
    cov = f.get("coverageUnion")
    if not cov:
        continue
    print(f"{name}: center {cov['center_lat']:.4f},{cov['center_lon']:.4f} "
          f"span {cov['width_deg']*111:.1f}km x {cov['height_deg']*111:.1f}km "
          f"overlays={f.get('groundOverlayCount')}")
    if name.startswith("NT_CG"):
        if nt_union is None:
            nt_union = dict(cov)
        else:
            nt_union["north"] = max(nt_union["north"], cov["north"])
            nt_union["south"] = min(nt_union["south"], cov["south"])
            nt_union["east"] = max(nt_union["east"], cov["east"])
            nt_union["west"] = min(nt_union["west"], cov["west"])

if nt_union:
    nt_union["width_deg"] = nt_union["east"] - nt_union["west"]
    nt_union["height_deg"] = nt_union["north"] - nt_union["south"]
    print("NT_CG union", nt_union)
    print(f"  ~{nt_union['width_deg']*111:.1f} km E-W x {nt_union['height_deg']*111:.1f} km N-S")

# check hash equality between standalone and kmz embeds
import hashlib, zipfile
root = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Raster\Raster")
pairs = [
    (root / "Google Map" / "ap_google map.png", root / "Google Map" / "Google map.kmz", "files/ap_google map.png"),
    (root / "SAT_data" / "sat_imgs.jpg", root / "Google Map" / "Google_sat_img.kmz", "files/sat_imgs.jpg"),
    (root / "SAT_data" / "google_terrin_map.png", root / "Google Map" / "google_terrian_map.kmz", "files/google_terrin_map.png"),
]
for loose, kmz, member in pairs:
    h1 = hashlib.md5(loose.read_bytes()).hexdigest()
    with zipfile.ZipFile(kmz) as z:
        h2 = hashlib.md5(z.read(member)).hexdigest()
    print(f"dup {loose.name} vs {kmz.name}:{member} match={h1==h2}")
