"""Probe public WFS / GeoJSON sources for AP mandal and village polygons."""
from __future__ import annotations

import ssl
import urllib.request

CTX = ssl.create_default_context()
HEADERS = {"User-Agent": "EAGLE-AP-GIS/1.0 (local development)"}

URLS = {
    "apsac_gati_caps": "https://apsac.ap.gov.in/geoserver/gatishakti1/wfs?service=WFS&version=1.1.0&request=GetCapabilities",
    "apsac_mandal_caps": "https://apsac.ap.gov.in/geoserver/Andhra-MandalBnd/ows?service=WFS&version=1.0.0&request=GetCapabilities",
    "apsac_village_caps": "https://apsac.ap.gov.in/geoserver/Andhra-VillageBnd/ows?service=WFS&version=1.0.0&request=GetCapabilities",
    "gadm_adm3_meta": "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/",
    "gadm_adm4_meta": "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM4/",
    "india_geodata_readme": "https://api.github.com/repos/yashveeeeeeer/india-geodata/releases/latest",
}


def fetch(name: str, url: str, limit: int = 2500) -> None:
    print(f"\n=== {name} ===")
    print(url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, context=CTX, timeout=60) as resp:
            data = resp.read(limit)
            print("status", resp.status, "len-head", len(data), "ctype", resp.headers.get("Content-Type"))
            print(data[:1200].decode("utf-8", "replace"))
    except Exception as exc:  # noqa: BLE001
        print("FAIL", type(exc).__name__, exc)


if __name__ == "__main__":
    for k, v in URLS.items():
        fetch(k, v)
