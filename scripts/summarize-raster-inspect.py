import json
from pathlib import Path

r = json.loads(Path("scripts/_raster_inspect_report.json").read_text(encoding="utf-8"))
for f in r["files"]:
    p = Path(f["path"]).name
    print("=" * 70)
    print(p, "|", f.get("kind"), "|", f.get("format"), "|", f"{f['bytes']/1e6:.2f} MB")
    if f.get("kind") == "standalone_image":
        print("  px:", f.get("width_px"), "x", f.get("height_px"))
        # compare hash/size to sibling?
        continue
    ovs = f.get("overlays") or []
    imgs = f.get("embedded_images") or []
    print(
        "  overlays:",
        len(ovs),
        "placemarks:",
        f.get("placemarkCount"),
        "netlinks:",
        f.get("networkLinkCount"),
        "embedded_imgs:",
        len(imgs),
    )
    print("  folders sample:", (f.get("folders") or [])[:15])
    cov = f.get("coverageUnion")
    if cov:
        print(
            f"  coverage N{cov['north']:.5f} S{cov['south']:.5f} E{cov['east']:.5f} W{cov['west']:.5f}"
        )
        print(
            f"  span deg W-E {cov['width_deg']:.5f} N-S {cov['height_deg']:.5f} center {cov['center_lat']:.4f}N,{cov['center_lon']:.4f}E"
        )
    # image size histogram
    sizes = {}
    for im in imgs:
        key = f"{im.get('width_px')}x{im.get('height_px')}"
        sizes[key] = sizes.get(key, 0) + 1
    if sizes:
        print("  image size histogram:", dict(sorted(sizes.items(), key=lambda x: -x[1])[:8]))
    # resolution stats
    res_x = [
        ov["approx_resolution_m_per_px"]["approx_m_per_px_x"]
        for ov in ovs
        if ov.get("approx_resolution_m_per_px")
    ]
    if res_x:
        print(
            f"  approx m/px x: min={min(res_x):.1f} median={sorted(res_x)[len(res_x)//2]:.1f} max={max(res_x):.1f}"
        )
    # overlay name samples + unique name prefixes
    names = [ov.get("name") or "" for ov in ovs]
    print("  overlay names (first 12):", names[:12])
    # list each overlay briefly if few
    if len(ovs) <= 6:
        for i, ov in enumerate(ovs):
            box = ov.get("latLonBox") or {}
            res = ov.get("approx_resolution_m_per_px") or {}
            print(
                f"  OV[{i}] {ov.get('name')!r} {ov.get('image_width_px')}x{ov.get('image_height_px')} href={ov.get('href')}"
            )
            if box:
                print(
                    f"       N{box.get('north')} S{box.get('south')} E{box.get('east')} W{box.get('west')} rot={box.get('rotation')}"
                )
            if res:
                print(
                    f"       ~m/px x={res.get('approx_m_per_px_x'):.1f} y={res.get('approx_m_per_px_y'):.1f}"
                )
    else:
        # show 3 example boxes from start/mid/end
        for idx in (0, len(ovs) // 2, len(ovs) - 1):
            ov = ovs[idx]
            box = ov.get("latLonBox") or {}
            res = ov.get("approx_resolution_m_per_px") or {}
            print(
                f"  OV sample[{idx}] {ov.get('name')!r} {ov.get('image_width_px')}x{ov.get('image_height_px')}"
            )
            if box:
                print(
                    f"       N{box.get('north'):.5f} S{box.get('south'):.5f} E{box.get('east'):.5f} W{box.get('west'):.5f}"
                )
            if res:
                print(
                    f"       ~m/px x={res.get('approx_m_per_px_x'):.1f} y={res.get('approx_m_per_px_y'):.1f}"
                )
