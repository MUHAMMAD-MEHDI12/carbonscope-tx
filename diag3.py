import ijson
in_path = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson"
data = {}
with open(in_path, "r", encoding="utf-8") as f:
    for feat in ijson.items(f, "features.item"):
        p = feat.get("properties") or {}
        m = p.get("metro")
        if not m:
            continue
        a = (feat.get("geometry") or {}).get("coordinates")
        while isinstance(a, list) and a and isinstance(a[0], list):
            a = a[0]
        if isinstance(a, list) and len(a) >= 2:
            lng, lat = float(a[0]), float(a[1])
            d = data.setdefault(m, [lng, lng, lat, lat])
            d[0] = min(d[0], lng); d[1] = max(d[1], lng)
            d[2] = min(d[2], lat); d[3] = max(d[3], lat)
print("Expected: dallas LNG~-96.8 | austin LNG~-97.7 | sanantonio LNG~-98.5")
for m, d in data.items():
    print(m, "-> LNG", round(d[0],2), "to", round(d[1],2), "| LAT", round(d[2],2), "to", round(d[3],2))