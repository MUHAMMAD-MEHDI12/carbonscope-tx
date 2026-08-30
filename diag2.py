import ijson
in_path = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson"
lngs, lats = [], []
with open(in_path, "r", encoding="utf-8") as f:
    for feat in ijson.items(f, "features.item"):
        p = feat.get("properties") or {}
        if p.get("metro") != "dallas":
            continue
        a = (feat.get("geometry") or {}).get("coordinates")
        while isinstance(a, list) and a and isinstance(a[0], list):
            a = a[0]
        if isinstance(a, list) and len(a) >= 2:
            lngs.append(float(a[0])); lats.append(float(a[1]))
print("Dallas buildings:", len(lngs))
print("LNG range:", min(lngs), "to", max(lngs))
print("LAT range:", min(lats), "to", max(lats))
print("Real Dallas should be: LNG ~ -96.8, LAT ~ 32.78")