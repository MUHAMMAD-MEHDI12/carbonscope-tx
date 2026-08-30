const fs = require('fs');
const csv = fs.readFileSync('D:\\Hackathon_work\\ndvi_hotspot_samples.csv', 'utf8');
const lines = csv.split('\n').filter(l => l.trim());
function p(l) {
  const c = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { c.push(cur); cur = ''; }
    else cur += ch;
  }
  c.push(cur);
  return c;
}
const h = p(lines[0]);
const ci = h.findIndex(x => x.trim() === 'County');
const gi = h.findIndex(x => x.trim() === '.geo');
let n = 0;
for (let i = 1; i < lines.length && n < 5; i++) {
  const c = p(lines[i]);
  if ((c[ci] || '').trim() === 'Dallas') {
    const g = JSON.parse(c[gi]);
    console.log(g.coordinates);
    n++;
  }
}
