"""Inspect GIS-Source Raster folder: KMZ GroundOverlays + stand-alone images."""
from __future__ import annotations

import json
import re
import struct
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(r"C:\Users\HEMANTH\OneDrive\Desktop\GIS-Source\Raster\Raster")
OUT = Path(__file__).resolve().parents[1] / "scripts" / "_raster_inspect_report.json"


def local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def strip_ns(xml: str) -> str:
    xml = re.sub(r'xmlns(:\w+)?="[^"]+"', "", xml)
    return re.sub(r"<(/?)(\w+):", r"<\1", xml)


def png_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return int(w), int(h)


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9):
            i += 2
            continue
        if marker == 0x01 or (0xD0 <= marker <= 0xD7):
            i += 2
            continue
        seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return int(w), int(h)
        i += 2 + seglen
    return None


def image_meta(path: Path) -> dict:
    data = path.read_bytes()
    size = png_size(data) if path.suffix.lower() == ".png" else jpeg_size(data)
    return {
        "path": str(path),
        "format": path.suffix.lower().lstrip("."),
        "bytes": path.stat().st_size,
        "width_px": size[0] if size else None,
        "height_px": size[1] if size else None,
        "kind": "standalone_image",
    }


def text_of(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def find_child(parent: ET.Element, name: str) -> ET.Element | None:
    for c in parent:
        if local(c.tag) == name:
            return c
    return None


def parse_latlonbox(box: ET.Element) -> dict:
    get = lambda n: float(text_of(find_child(box, n)) or "nan")
    north, south, east, west = get("north"), get("south"), get("east"), get("west")
    rotation = text_of(find_child(box, "rotation"))
    return {
        "north": north,
        "south": south,
        "east": east,
        "west": west,
        "rotation": float(rotation) if rotation else 0.0,
        "width_deg": abs(east - west) if east == east and west == west else None,
        "height_deg": abs(north - south) if north == north and south == south else None,
        "center_lon": (east + west) / 2 if east == east and west == west else None,
        "center_lat": (north + south) / 2 if north == north and south == south else None,
    }


def approx_m_per_px(box: dict, w_px: int | None, h_px: int | None) -> dict:
    if not w_px or not h_px or not box.get("width_deg") or not box.get("height_deg"):
        return {}
    # rough: 1 deg lat ~ 111320 m; lon scales by cos(lat)
    import math

    lat = box["center_lat"] or 0
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(lat))
    return {
        "approx_m_per_px_x": (box["width_deg"] * m_per_deg_lon) / w_px,
        "approx_m_per_px_y": (box["height_deg"] * m_per_deg_lat) / h_px,
    }


def inspect_kmz(path: Path) -> dict:
    overlays = []
    placemarks = 0
    folders: list[str] = []
    network_links = 0
    other_files: list[dict] = []
    kml_names: list[str] = []

    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        for n in names:
            info = z.getinfo(n)
            ext = Path(n).suffix.lower()
            entry = {"name": n, "bytes": info.file_size, "ext": ext}
            if ext in {".jpg", ".jpeg", ".png", ".gif"}:
                raw = z.read(n)
                size = jpeg_size(raw) if ext in {".jpg", ".jpeg"} else png_size(raw)
                entry["width_px"] = size[0] if size else None
                entry["height_px"] = size[1] if size else None
            other_files.append(entry)
            if ext == ".kml":
                kml_names.append(n)

        for kml_name in kml_names:
            text = strip_ns(z.read(kml_name).decode("utf-8", errors="replace"))
            root = ET.fromstring(text)
            for el in root.iter():
                t = local(el.tag)
                if t == "Placemark":
                    placemarks += 1
                if t == "Folder":
                    nm = text_of(find_child(el, "name"))
                    if nm:
                        folders.append(nm)
                if t == "NetworkLink":
                    network_links += 1
                if t == "GroundOverlay":
                    name = text_of(find_child(el, "name")) or "(unnamed)"
                    desc = text_of(find_child(el, "description"))
                    href = None
                    icon = find_child(el, "Icon")
                    if icon is not None:
                        href = text_of(find_child(icon, "href"))
                    box_el = find_child(el, "LatLonBox")
                    box = parse_latlonbox(box_el) if box_el is not None else None
                    # resolve image size from zip member
                    w = h = None
                    if href:
                        # try exact then basename match
                        candidates = [href, href.lstrip("./")]
                        base = Path(href).name
                        for n in names:
                            if n == href or n.endswith("/" + base) or Path(n).name == base:
                                raw = z.read(n)
                                size = (
                                    jpeg_size(raw)
                                    if Path(n).suffix.lower() in {".jpg", ".jpeg"}
                                    else png_size(raw)
                                )
                                if size:
                                    w, h = size
                                break
                    ov = {
                        "name": name,
                        "description": desc[:200] if desc else "",
                        "href": href,
                        "latLonBox": box,
                        "image_width_px": w,
                        "image_height_px": h,
                    }
                    if box and w and h:
                        ov["approx_resolution_m_per_px"] = approx_m_per_px(box, w, h)
                    overlays.append(ov)

    # coverage union
    boxes = [o["latLonBox"] for o in overlays if o.get("latLonBox")]
    coverage = None
    if boxes:
        coverage = {
            "north": max(b["north"] for b in boxes),
            "south": min(b["south"] for b in boxes),
            "east": max(b["east"] for b in boxes),
            "west": min(b["west"] for b in boxes),
        }
        coverage["center_lon"] = (coverage["east"] + coverage["west"]) / 2
        coverage["center_lat"] = (coverage["north"] + coverage["south"]) / 2
        coverage["width_deg"] = coverage["east"] - coverage["west"]
        coverage["height_deg"] = coverage["north"] - coverage["south"]

    return {
        "path": str(path),
        "format": "kmz",
        "bytes": path.stat().st_size,
        "kind": "kmz_groundoverlay" if overlays else "kmz_other",
        "kml_files": kml_names,
        "zip_entries": len(other_files),
        "embedded_images": [
            e for e in other_files if e["ext"] in {".jpg", ".jpeg", ".png", ".gif"}
        ],
        "groundOverlayCount": len(overlays),
        "placemarkCount": placemarks,
        "networkLinkCount": network_links,
        "folders": sorted(set(folders))[:40],
        "overlays": overlays,
        "coverageUnion": coverage,
        "crs": "EPSG:4326 (KML LatLonBox WGS84 geographic)",
    }


def main() -> None:
    report = {"root": str(ROOT), "files": []}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext == ".kmz":
            print("KMZ", path.name, f"{path.stat().st_size/1e6:.1f} MB")
            report["files"].append(inspect_kmz(path))
        elif ext in {".jpg", ".jpeg", ".png"}:
            print("IMG", path.name)
            report["files"].append(image_meta(path))
        else:
            report["files"].append(
                {
                    "path": str(path),
                    "format": ext.lstrip("."),
                    "bytes": path.stat().st_size,
                    "kind": "other",
                }
            )
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
