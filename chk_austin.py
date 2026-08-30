import ijson
f = open("D:/Hackathon_work/austin_clean.geojson","r",encoding="utf-8")
n=0
kg=[]; tons=[]
for feat in ijson.items(f,"features.item"):
    p=feat.get("properties") or {}
    kg.append(float(p.get("carbon_kg_co2e") or 0))
    tons.append(float(p.get("carbon_tons_co2e") or 0))
    n+=1
    if n>=5000: break
f.close()
kg.sort(); tons.sort()
print("carbon_kg_co2e   median:", round(kg[len(kg)//2],1))
print("carbon_tons_co2e median:", round(tons[len(tons)//2],3))
print("ratio kg/tons:", round(kg[len(kg)//2]/max(tons[len(tons)//2],0.0001),1))