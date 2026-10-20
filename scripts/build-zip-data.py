"""Rebuild lib/geo/us-zips.json from a GeoNames US postal-code file.

Usage: python3 scripts/build-zip-data.py path/to/US.txt

Source: https://download.geonames.org/export/zip/US.zip (unzip for US.txt).
GeoNames data is licensed CC BY 4.0 — https://www.geonames.org.
Output: {zip: [city, state, county, latitude, longitude]}, 3-decimal coords.
"""
import json
import sys

rows = {}
with open(sys.argv[1], encoding="utf-8") as f:
    for line in f:
        p = line.rstrip("\n").split("\t")
        if len(p) < 11 or not (p[1].isdigit() and len(p[1]) == 5):
            continue
        if not p[4] or not p[9]:
            continue
        rows[p[1]] = [p[2], p[4], p[5], round(float(p[9]), 3), round(float(p[10]), 3)]

with open("lib/geo/us-zips.json", "w", encoding="utf-8") as out:
    json.dump(dict(sorted(rows.items())), out, separators=(",", ":"))
print(f"{len(rows)} ZIPs")
