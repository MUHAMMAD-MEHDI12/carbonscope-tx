import ijson
path = "D:/Hackathon_work/drive-download-20260830T045752Z-1-001/dallas_buildings.geojson"
f = open(path,"r",encoding="utf-8")
n=0; lngs=[]; lats=[]; sample=None
for feat in ijson.items(f,"features.item"):
    p=feat.get("properties") or {}
    a=(feat.get("geometry") or {}).get("coordinates")
    while isinstance(a,list) and a and isinstance(a[0],list): a=a[0]
    if isinstance(a,list) and len(a)>=2:
        lngs.append(float(a[0])); lats.append(float(a[1]))
    if sample is None: sample=dict(p)
    n+=1
f.close()
print("total buildings:", n)
print("LNG range:", round(min(lngs),3), "to", round(max(lngs),3))
print("LAT range:", round(min(lats),3), "to", round(max(lats),3))
print("Real Dallas = LNG ~ -96.8, LAT ~ 32.78")
print("property keys:", list(sample.keys()))
print("carbon fields:", [k for k in sample if "carbon" in k.lower()])