import json
from pathlib import Path

r = json.loads(Path("scripts/_admin_inspect_report.json").read_text(encoding="utf-8"))
for d in r["datasets"]:
    print("=" * 70)
    print(d["id"], "n=", d["featureCount"], d["geometryTypes"], d["crsHint"])
    print("  bbox:", d.get("bbox"))
    print("  fields:", [f["name"] for f in d["fields"]])
    for s in d["samples"][:2]:
        print("  sample:", {k: s[k] for k in list(s)[:12]})
    # highlight state/district name fields
    for fname, meta in d.get("fieldUniques", {}).items():
        if any(x in fname.upper() for x in ("STATE", "DIST", "NAME", "TALUK", "MAP", "RD_", "TYPE")):
            print(f"  unique[{fname}]: {meta['approxDistinct_first5k']} e.g. {meta['sample'][:8]}")

print("\nAPP EXISTING:")
for k, v in r["appExisting"].items():
    if not v:
        print(k, "MISSING")
    elif isinstance(v, dict) and "featureCount" in v:
        print(k, "features=", v["featureCount"], "meta=", v.get("meta"))
    else:
        print(k, "keys=", list(v)[:8] if isinstance(v, dict) else type(v))
