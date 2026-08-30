const fs = require("fs");
const inPath = "D:/Hackathon_work/buildings_with_carbon_footprints.geojson";
const outPath = "D:/Hackathon_work/dallas_clean.geojson";
const ws = fs.createWriteStream(outPath);
ws.write('{"type":"FeatureCollection","features":[');

let seen = 0, kept = 0, dupes = 0, broken = 0;
const keys = new Set();
let buf = "", depth = 0, start = -1, inStr = false, esc = false, armed = false;

function handle(feat) {
  seen++;
  let obj;
  try { obj = JSON.parse(feat); } catch (e) { broken++; return; }
  const p = obj.properties || {};
  if (p.metro !== "dallas") return;
  let a = obj.geometry && obj.geometry.coordinates;
  while (Array.isArray(a) && Array.isArray(a[0])) a = a[0];
  const lng = a && a[0], lat = a && a[1];
  const carbon = p.carbon_tons_co2e;
  if (!isFinite(lng) || !isFinite(lat) || lng < -107 || lng > -93 || lat < 25 || lat > 37 || !isFinite(carbon) || carbon <= 0) { broken++; return; }
  const key = lng.toFixed(5) + "," + lat.toFixed(5) + "," + (p.area_sqm || 0).toFixed(1);
  if (keys.has(key)) { dupes++; return; }
  keys.add(key);
  if (kept > 0) ws.write(",");
  ws.write(JSON.stringify(obj));
  kept++;
}

const s = fs.createReadStream(inPath, { encoding: "utf8", highWaterMark: 4 << 20 });
s.on("data", (chunk) => {
  buf += chunk;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (!armed) { if (buf.indexOf('"features"', i) === i) { armed = true; i += 9; } continue; }
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) { handle(buf.slice(start, i + 1)); } }
  }
  if (depth > 0 && start !== -1) { buf = buf.slice(start); start = 0; }
  else { buf = ""; start = -1; }
});
s.on("end", () => {
  ws.write("]}");
  ws.end(() => {
    console.log("=== CLEAN EXTRACT REPORT ===");
    console.log("Features scanned:    ", seen);
    console.log("Broken (dropped):    ", broken);
    console.log("Duplicates (dropped):", dupes);
    console.log("KEPT (clean Dallas): ", kept);
  });
});