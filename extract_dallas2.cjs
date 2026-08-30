const fs = require("fs");
const inPath = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson";
const outPath = "D:/Hackathon_work/dallas_real.geojson";
const ws = fs.createWriteStream(outPath);
ws.write('{"type":"FeatureCollection","features":[');
let tail = "", kept = 0;
const s = fs.createReadStream(inPath, { encoding: "utf8", highWaterMark: 4 << 20 });
s.on("data", (chunk) => {
  let data = tail + chunk;
  let depth = 0, start = -1, lastCut = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const feat = data.slice(start, i + 1);
        if ((feat.indexOf('"metro": "dallas"') !== -1 || feat.indexOf('"metro":"dallas"') !== -1) && feat.indexOf('"geometry"') !== -1) {
          if (kept > 0) ws.write(",");
          ws.write(feat);
          kept++;
        }
        lastCut = i + 1;
        start = -1;
      }
    }
  }
  tail = depth > 0 && start !== -1 ? data.slice(start) : data.slice(lastCut);
  if (tail.length > 20000000) tail = tail.slice(-20000000);
});
s.on("end", () => {
  ws.write("]}");
  ws.end(() => console.log("Wrote Dallas buildings:", kept));
});