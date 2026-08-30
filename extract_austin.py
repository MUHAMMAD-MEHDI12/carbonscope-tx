import ijson, json

in_path = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson"
out_path = "D:/Hackathon_work/austin_clean.geojson"
TARGET = "austin"

seen = kept = dupes = broken = 0
keys = set()

def first_coord(geom):
    a = geom.get("coordinates")
    while isinstance(a, list) and a and isinstance(a[0], list):
        a = a[0]
    if isinstance(a, list) and len(a) >= 2:
        return a[0], a[1]
    return None, None

with open(out_path, "w", encoding="utf-8") as out:
    out.write('{"type":"FeatureCollection","features":[')
    with open(in_path, "r", encoding="utf-8") as f:
        for feat in ijson.items(f, "features.item"):
            seen += 1
            p = feat.get("properties") or {}
            if p.get("metro") != TARGET:
                continue
            lng, lat = first_coord(feat.get("geometry") or {})
            carbon = p.get("carbon_tons_co2e")
            try:
                lng = float(lng); lat = float(lat); carbon = float(carbon)
            except (TypeError, ValueError):
                broken += 1; continue
            if not (-107 < lng < -93 and 25 < lat < 37) or carbon <= 0:
                broken += 1; continue
            key = (round(lng, 5), round(lat, 5), round(float(p.get("area_sqm") or 0), 1))
            if key in keys:
                dupes += 1; continue
            keys.add(key)
            if kept > 0:
                out.write(",")
            out.write(json.dumps(feat, default=float))
            kept += 1
    out.write("]}")

print("=== AUSTIN CLEAN REPORT ===")
print("Broken (dropped):    ", broken)
print("Duplicates (dropped):", dupes)
print("KEPT (clean Austin): ", kept)