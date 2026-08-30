import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const args = process.argv.slice(2)
let csvFile = null
for (let i = 0; i < args.length; i++) { if (args[i] === '--file' && args[i+1]) csvFile = args[++i] }
if (!csvFile || !existsSync(csvFile)) { console.error('ERROR: pass --file <path>'); process.exit(1) }
console.log('Reading: ' + csvFile)
const METROS = {
  dallas: { match: /dallas/i, aoi: [-96.88,32.72,-96.74,32.79], defaultArea: 200 },
  austin: { match: /austin/i, aoi: [-97.8,30.22,-97.66,30.29], defaultArea: 200 },
  sanantonio: { match: /san.?antonio/i, aoi: [-98.56,29.37,-98.42,29.44], defaultArea: 200 },
}
function splitLine(line) {
  const cells=[]; let cur='',inQ=false
  for (let i=0;i<line.length;i++) {
    const c=line[i]
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++}else inQ=!inQ}
    else if(c===','&&!inQ){cells.push(cur);cur=''}
    else cur+=c
  }
  cells.push(cur); return cells
}
const text = readFileSync(csvFile,'utf8')
const lines = text.split('\n').filter(l=>l.trim())
const headers = splitLine(lines[0])
const rows = []
for (let i=1;i<lines.length;i++) {
  const cells=splitLine(lines[i])
  if(cells.length<headers.length) continue
  const obj={}; headers.forEach((h,j)=>obj[h.trim()]=cells[j]); rows.push(obj)
}
console.log('Parsed ' + rows.length + ' rows')
const buckets={dallas:[],austin:[],sanantonio:[]}
let skipped=0
for (const row of rows) {
  const county=(row['County']||'').trim()
  const ndviRaw=parseFloat(row['NDVI'])
  const geoRaw=(row['.geo']||'').trim()
  if(!county||isNaN(ndviRaw)||!geoRaw){skipped++;continue}
  let geo; try{geo=JSON.parse(geoRaw)}catch{skipped++;continue}
  const [lng,lat]=geo.coordinates||[]
  if(typeof lat!=='number'||typeof lng!=='number'){skipped++;continue}
  const ndvi=Math.max(-1,Math.min(1,ndviRaw))
  let metro=null
  for(const [k,cfg] of Object.entries(METROS)){if(cfg.match.test(county)){metro=k;break}}
  if(!metro){skipped++;continue}
  buckets[metro].push({lat,lng,ndvi})
}
if(skipped>0) console.log('Skipped '+skipped+' rows')
const outDir=join(ROOT,'src','data','real_buildings')
if(!existsSync(outDir)) mkdirSync(outDir,{recursive:true})
for(const [metro,points] of Object.entries(buckets)){
  if(points.length===0){console.log(metro+': 0 points - skipping');continue}
  const mean=points.reduce((s,p)=>s+p.ndvi,0)/points.length
  const buildings=points.map(p=>[Math.round(p.lat*1e5)/1e5,Math.round(p.lng*1e5)/1e5,200,{n:Math.round(p.ndvi*1e4)/1e4}])
  const output={meta:{source:'ndvi-csv-sample',metro,sampled:buildings.length,note:'NDVI from GEE sample CSV',ndvi:{field:'NDVI',n_with_ndvi:buildings.length,mean:Math.round(mean*1e4)/1e4}},buildings}
  const outPath=join(outDir,metro+'_buildings.json')
  writeFileSync(outPath,JSON.stringify(output))
  console.log('✓ '+metro+': '+buildings.length+' buildings, mean NDVI '+mean.toFixed(3)+', wrote '+outPath)
}
console.log('\nDone! Now run: npm run build')
