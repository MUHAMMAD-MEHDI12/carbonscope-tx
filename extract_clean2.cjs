const fs = require("fs");
const StreamChain = require("stream-chain");
const chain = StreamChain.chain || StreamChain;
const StreamJson = require("stream-json");
const parser = StreamJson.parser || require("stream-json/Parser").parser;
const { pick } = require("stream-json/filters/Pick.js");
const { streamArray } = require("stream-json/streamers/StreamArray.js");

const inPath = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson";
const outPath = "D:/Hackathon_work/dallas_clean.geojson";
const ws = fs.createWriteStream(outPath);
ws.write('{"type":"FeatureCollection","features":[');

let seen = 0, kept = 0, dupes = 0, broken = 0, notDallas = 0;
const keys = new Set();

function firstCoord(geom) {
  try { let a = geom.coordinates; while (Array.isArray(a[0])) a = a[0]; return [a[0], a[1]]; }
  catch (e) { return null; }
}

const pipeline = chain([
  fs.createReadStream(inPath),
  parser(),
  pick({ filter: "features" }),
  streamArray(),
]);

pipeline.on("data", ({ value }) => {
  seen++;
  const p = value.properties || {};
  if (p.metro !== "dallas") { notDallas++; return; }
  const c = firstCoord(value.geometry || {});
  const carbon = p.carbon_tons_co2e;
  if (!c || !isFinite(c[0]) || !isFinite(c[1]) ||
      c[0] < -107 || c[0] > -93 || c[1] < 25 || c[1] > 37 ||
      !isFinite(carbon) || carbon <= 0) { broken++; return; }
  const key = c[0].toFixed(5) + "," + c[1].toFixed(5) + "," + (p.area_sqm || 0).toFixed(1);
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
    console.log("Total scanned:      ", seen);
    console.log("Not Dallas:         ", notDallas);
    console.log("Broken (dropped):   ", broken);
    console.log("Duplicates (dropped):", dupes);
    console.log("KEPT (clean Dallas): ", kept);
  });
});
pipeline.on("error", (e) => console.error("ERROR:", e.message));