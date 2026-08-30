const fs = require("fs");
const p = "src/data/metros.js";
let s = fs.readFileSync(p, "utf8");
const startKey = "  houston: {";
const i = s.indexOf(startKey);
if (i === -1) { console.log("houston not found (already removed?)"); process.exit(0); }
// walk braces from the opening { after "houston:"
let j = s.indexOf("{", i), depth = 0, end = -1;
for (; j < s.length; j++) {
  if (s[j] === "{") depth++;
  else if (s[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
}
// include the trailing comma and following blank line
let after = end + 1;
if (s[after] === ",") after++;
while (after < s.length && (s[after] === "\r" || s[after] === "\n" || s[after] === " ")) {
  if (s[after] === "\n") { after++; break; }
  after++;
}
const out = s.slice(0, i) + s.slice(after);
fs.writeFileSync(p, out);
console.log("Removed houston. 'houston' still present?", out.includes("  houston: {"));