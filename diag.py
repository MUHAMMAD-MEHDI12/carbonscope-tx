import ijson
in_path = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson"
with open(in_path, "r", encoding="utf-8") as f:
    n = 0
    for feat in ijson.items(f, "features.item"):
        p = feat.get("properties") or {}
        if p.get("metro") != "dallas":
            continue
        geom = feat.get("geometry") or {}
        a = geom.get("coordinates")
        depth = 0
        aa = a
        while isinstance(aa, list) and aa and isinstance(aa[0], list):
            aa = aa[0]; depth += 1
        print("geom type:", geom.get("type"))
        print("coord nesting depth:", depth)
        print("first coord sample:", aa[:2] if isinstance(aa, list) else aa)
        print("carbon_tons_co2e:", repr(p.get("carbon_tons_co2e")), type(p.get("carbon_tons_co2e")))
        print("area_sqm:", repr(p.get("area_sqm")))
        n += 1
        if n >= 3:
            break