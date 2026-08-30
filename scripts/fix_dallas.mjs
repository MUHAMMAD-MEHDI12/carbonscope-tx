import{createReadStream,writeFileSync}from'fs';import{fileURLToPath}from'url';import{dirname,join}from'path';
const __dir=dirname(fileURLToPath(import.meta.url)),ROOT=join(__dir,'..');
const FILE=process.argv[2]||'D:\\Hackathon_work\\buildings_with_gee_ndvi_and_hotspots.geojson';
const MAX=3000;console.log('Streaming '+FILE+'...');
let mode=null,pre='',started=false,stopped=false,inEl=false,depth=0,inStr=false,esc=false,buf='';
const items=[];let total=0;
function emit(t){let f;try{f=JSON.parse(t)}catch{return}if(!f||f.type!=='Feature')return;total++;
const g=f.geometry;if(!g)return;const t2=g.type;let polys=[];
if(t2==='Polygon')polys=[g.coordinates];else if(t2==='MultiPolygon')polys=g.coordinates;else return;
const ring=polys[0][0];if(!ring||ring.length<3)return;
let sx=0,sy=0;ring.forEach(p=>{sx+=p[0];sy+=p[1]});let lng=sx/ring.length,lat=sy/ring.length;
if(Math.abs(lng)>180&&Math.abs(lat)<=180){}
else if(Math.abs(lat)>90){[lat,lng]=[lng,lat]}
const p=f.properties||{};
let ndvi=null;for(const k of['mean_ndvi','NDVI','ndvi','ndvi_mean']){if(p[k]!=null&&!isNaN(+p[k])){ndvi=+p[k];break}}
let carbon=null;for(const k of['carbon_tons_co2e','carbon_kg_co2e','carbon_tons','carbon_kg']){if(p[k]!=null&&!isNaN(+p[k])){carbon=+p[k];if(k.includes('kg'))carbon/=1000;break}}
const area=Math.round(Math.abs(polys[0][0].reduce((s,pt,i,a)=>{const n=a[(i+1)%a.length];return s+(pt[0]*n[1]-n[0]*pt[1])},0)/2*111319*111319*Math.cos(lat*Math.PI/180)));
const sRing=ring.filter((_,i)=>i%3===0||i===ring.length-1).map(p=>[Math.round(p[1]*1e6)/1e6,Math.round(p[0]*1e6)/1e6]);
const row=[Math.round(lat*1e5)/1e5,Math.round(lng*1e5)/1e5,area||200,sRing];
const bag={};if(carbon!=null)bag.c=Math.round(carbon*100)/100;if(ndvi!=null)bag.n=Math.round(ndvi*1e4)/1e4;
if(Object.keys(bag).length>0)row.push(bag);else if(carbon!=null)row.push(carbon);
if(items.length<MAX)items.push(row);else{const j=Math.floor(Math.random()*total);if(j<MAX)items[j]=row}
}
const consumeFC=chunk=>{for(let i=0;i<chunk.length;i++){const c=chunk[i];
if(!inEl){if(c==='{'){inEl=true;depth=1;inStr=false;esc=false;buf='{'}else if(c===']'){stopped=true;return}continue}
buf+=c;if(inStr){if(esc)esc=false;else if(c==='\\\\')esc=true;else if(c==='"')inStr=false;continue}
if(c==='"')inStr=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){depth--;if(depth===0){emit(buf);inEl=false;buf='';if(stopped)return}}}};
const stream=createReadStream(FILE,{encoding:'utf8',highWaterMark:1<<20});
stream.on('data',chunk=>{if(stopped)return;
if(mode===null){pre+=chunk;const t=pre.trimStart();if(t.startsWith('{')){const fi=pre.indexOf('"features"');if(fi>=0){const o=pre.indexOf('[',fi);if(o>=0){mode='fc';started=true;consumeFC(pre.slice(o+1));pre='';return}}if(pre.length>65536)pre=pre.slice(-4096);return}mode='ndjson';chunk=pre;pre=''}
if(mode==='fc'){if(started)consumeFC(chunk);return}});
stream.on('close',()=>{
console.log('Total features: '+total+', kept: '+items.length);
const out=join(ROOT,'src','data','real_buildings','dallas_buildings.json');
const lats=items.map(r=>r[0]),lngs=items.map(r=>r[1]);
const meta={source:'real-footprints',metro:'dallas',total_in_file:total,sampled:items.length,
extent:[Math.min(...lngs),Math.min(...lats),Math.max(...lngs),Math.max(...lats)],anywhere:true,
note:'positions + footprint areas are real; NDVI from GEE',
ndvi:{field:'mean_ndvi',n_with_ndvi:items.filter(r=>r[4]&&r[4].n!=null).length}};
writeFileSync(out,JSON.stringify({meta,buildings:items}));
console.log('Wrote '+out);console.log('Done!');});
stream.on('error',e=>console.error(e));
