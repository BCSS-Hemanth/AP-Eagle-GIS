from __future__ import annotations

import json
import ssl
import urllib.request

CTX = ssl.create_default_context()
HEADERS = {"User-Agent": "EAGLE-AP-GIS/1.0"}

URLS = [
    "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/",
    "https://apsac.ap.gov.in/geoserver/Andhra-MandalBnd/wms?service=WMS&request=GetCapabilities",
    "https://apsac.ap.gov.in/geoserver/Andhra-VillageBnd/wms?service=WMS&request=GetCapabilities",
    "https://apsac.ap.gov.in/geoserver/ows?SERVICE=WMS&request=GetCapabilities",
    "https://github.com/datameet/indian_village_boundaries/archive/refs/heads/master.zip",
    "https://api.github.com/repos/datameet/indian_village_boundaries",
    "https://api.github.com/search/repositories?q=andhra+pradesh+mandal+geojson",
]


def head_or_get(url: str) -> None:
    print("\n===", url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, context=CTX, timeout=45) as resp:
            print("status", resp.status, "ctype", resp.headers.get("Content-Type"), "len", resp.headers.get("Content-Length"))
            chunk = resp.read(1800)
            print(chunk[:1600].decode("utf-8", "replace")[:1600])
    except Exception as exc:  # noqa: BLE001
        print("FAIL", type(exc).__name__, exc)


if __name__ == "__main__":
    head_or_get("https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/")
    meta = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/", headers=HEADERS
            ),
            context=CTX,
            timeout=45,
        ).read()
    )
    print("ADM3 keys", list(meta.keys()))
    for k in ("staticDownloadLink", "simplifiedGeometryGeoJSON", "gjDownloadURL", "simplifiedGeometryGeoJSON"):
        if k in meta:
            print(k, meta[k])
    print("all url-like:")
    for k, v in meta.items():
        if isinstance(v, str) and ("http" in v or "geojson" in v.lower() or "zip" in v.lower()):
            print(k, ":", v)

    for url in URLS[1:]:
        head_or_get(url)
