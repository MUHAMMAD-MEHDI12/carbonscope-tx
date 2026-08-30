const fs = require("fs");
const { chain } = require("stream-chain/src/index.js");
const { parser } = require("stream-json/src/index.js");
const { pick } = require("stream-json/src/filters/Pick.js");
const { streamArray } = require("stream-json/src/streamers/StreamArray.js");

const inPath = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson";
const outPath = "D:/Hackathon_work/dallas_clean.geojson";
const ws = fs.createWriteStream(outPath);
ws.write('{"type":"FeatureCollection","features":[');

let seen = 0, kept = 0, dupes = 0, broken = 0;
const keys = new Set();

const pipeline = chain([
  fs.createReadStream(inPath),
  parser(),
  pick({ filter: "features" }),
  streamArray(),
]);

pipeline.on("data", ({ value }) => {
  seen++;
  const p = value.properties || {};
  if (p.metro !== "dallas") return;
  let a = value.geometry && value.geometry.coordinates;
  while (Array.isArray(a) && Array.isArray(a[0])) a = a[0];
  const lng = a && a[0], lat = a && a[1];
  const carbon = p.carbon_tons_co2e;
  if (!isFinite(lng) || !isFinite(lat) || lng < -107 || lng > -93 || lat < 25 || lat > 37 || !isFinite(carbon) || carbon <= 0) { broken++; return; }
  const key = lng.toFixed(5) + "," + lat.toFixed(5) + "," + (p.area_sqm || 0).toFixed(1);
  if (keys.has(key)) { dupes++; return; }
  keys.add(key);
  if (kept > 0) ws.write(",");
  ws.write(JSON.stringify(value));
  kept++;
});
pipeline.on("end", () => {
  ws.write("]}");
  ws.end(() => {
    console.log("=== CLEAN EXTRACT REPORT ===");
    console.log("Features scanned:    ", seen);
    console.log("Broken (dropped):    ", broken);
    console.log("Duplicates (dropped):", dupes);
    console.log("KEPT (clean Dallas): ", kept);
  });
});
pipeline.on("error", (e) => console.error("ERROR:", e.message));