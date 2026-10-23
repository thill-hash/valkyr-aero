/* Valkyr Aero — universal avionics / engine-data importer.
   Pluggable parser registry → auto-detect (file name, header, content signature) → parse in a Web Worker (chunked)
   → normalized flight-data schema → aircraft matching with confidence → user confirms → hours, fuel, trends, exceedances. */
(function(){
const {esc,h1,money,todayISO,uid}=VA;const S=()=>VA.state();

/* ---------------- registry ---------------- */
// status: 'verified' (layout checked against published samples/manuals), 'partial' (container/file names verified, some columns unverified),
//         'detect-only' (recognized, not decoded), 'unsupported' (no public format; send us a sample), 'ignore' (non-data files)
const R=VA.PARSERS=[
 {id:'garmin-g1000',name:'Garmin G1000 / G1000 NXi / Cirrus Perspective & Perspective+',status:'verified',
  covers:'SD card data_log/*.csv. Also expected for G3000/G5000 (same #airframe_info family — UNVERIFIED for those decks).',
  detect:(n,h)=>/^#airframe_info/.test(h)&&!/product="GDU/.test(h)&&/Lcl Date/.test(h)?95:0,
  src:['NTSB WPR21LA068 G1000 Cockpit Display Factual Report (parameter list)','Published DA40 G1000 sample header (r/flying, CloudAhoy-provided file)','Savvy Aviation: G1000/Perspective data_log folder']},
 {id:'garmin-g3x',name:'Garmin G3X / G3X Touch',status:'verified',
  covers:'data_log/*.csv and fdr_log/fdr_*.csv. Metadata has aircraft_ident (tail), system_id, airframe/engine hours; two header rows (labels, short names).',
  detect:(n,h)=>/^#airframe_info/.test(h)&&/product="GDU/.test(h)?96:(/fdr_\d+_\d+\.csv$/i.test(n)?70:0),
  src:["Van's Air Force forum G3X CSV example (Aug 2023)","Van's Aircraft 'Garmin G3X: How to Export Flight Data'"]},
 {id:'dynon-skyview',name:'Dynon SkyView / SkyView HDX — User Data Log',status:'partial',
  covers:'File name DATE-TAIL-SNxxxx-VER-…-USER_LOG_DATA.csv (tail parsed from file name). First row = headers "Name (Units)"; columns vary by EMS mapping. Lat/Lon/CHT/fuel-flow header names UNVERIFIED (matched by keywords).',
  detect:(n,h)=>/USER_LOG_DATA\.csv$/i.test(n)?95:/^(Time Recorded|Session Time|System Time)/i.test(h)?60:0,
  src:['Dynon SkyView System Installation Guide, Appendix F: User Data Logs','NTSB WPR21FA243 Electronic Devices Factual Report (SkyView D700 parameters)']},
 {id:'avidyne-r9',name:'Avidyne Entegra Release 9 (R9)',status:'partial',
  covers:'USB log export C_ENGINE.CSV, C_FLIGHT.CSV, C_SYSTEM.CSV (file names verified; merged by timestamp). Column layout not publicly specified — mapped by keywords, UNVERIFIED.',
  detect:n=>/(^|\/)C_(ENGINE|FLIGHT|SYSTEM)\.CSV$/i.test(n)?90:0,
  src:['Savvy Aviation: How to Download Engine Monitor Data (Avidyne R9)','Avidyne dealer KB: How to download Technician Logs in R9 IFDs','github.com/RISCfuture/1MA-Avidyne-R9-Data-Loader']},
 {id:'jpi-edm',name:'J.P. Instruments EDM (.JPI / legacy .DAT)',status:'detect-only',
  covers:'Binary file: ASCII "$U,…" header (tail number) + compressed flight records. We read the header (tail, model) and flag it; record decoding is planned. Today: export to CSV from EzTrends or send the file.',
  detect:(n,h)=>/^\$U,/.test(h)||/\.jpi$/i.test(n)?92:0,
  src:['JPI EDM-900 Pilot Guide §8 (data download)','Savvy Aviation download guide (upload .JPI/.DAT only)','github.com/unicornlines/JPI-Parser filespec.md (community spec)']},
 {id:'gpx',name:'GPX track (Garmin Pilot, ForeFlight, portable GPS exports)',status:'verified',
  covers:'GPX 1.0/1.1 <trkpt lat lon><ele><time>. Track only (no engine data): block/air time from position-derived ground speed.',
  detect:(n,h)=>/<gpx[\s>]/i.test(h)?90:0,src:['GPX 1.1 schema (topografix.com/GPX/1/1)']},
 {id:'kml',name:'KML track (ForeFlight / Google Earth gx:Track)',status:'partial',
  covers:'KML with <gx:Track> <when>/<gx:coord> or LineString. App-specific KML variants UNVERIFIED.',
  detect:(n,h)=>/<kml[\s>]/i.test(h)?85:0,src:['OGC KML 2.2 + Google gx:Track extension reference']},
 {id:'ei-mvp',name:'Electronics International MVP-50 / CGR-30',status:'unsupported',covers:'Stores flights internally, USB download; export file format is not publicly documented. Send us a sample.',detect:()=>0,src:['iflyei.com MVP-50P/MVP-50T product pages']},
 {id:'aspen',name:'Aspen Evolution',status:'unsupported',covers:'No public flight-data-log export format found. Send us a sample.',detect:()=>0,src:[]},
 {id:'garmin-txi',name:'Garmin G500/G600 TXi + EIS, GI 275 EIS',status:'unsupported',covers:'Engine data reaches flyGarmin via Flight Stream 510; SD log layout not verified — send a sample.',detect:()=>0,src:['Garmin blog: flyGarmin exceedance notifications / Connext']},
 {id:'oem-tool',name:'Collins Pro Line 21 / Fusion · Honeywell Primus Epic / Apex',status:'unsupported',covers:'Maintenance data (CMC/ACMF/fault history) needs OEM ground tools or OEM data services; not an open SD-card format. Plan: partner/OEM data feeds.',detect:()=>0,src:[]},
 {id:'valkyr-csv',name:'Valkyr CSV (flights, due items, expenses)',status:'verified',covers:'Templates on the Log flight screen.',detect:(n,h)=>{const f=h.split(/\r?\n/)[0].toLowerCase();return (f.includes('tail')&&(f.includes('hours')||f.includes('interval_hours')||f.includes('amount')))?80:0},src:[]}
];
const IGNORE=/(readme[^/]*|\.txt)$|\.(img|gpi|bin|gca|sys|tif|tiff|jpe?g|png|bmp|pdf|html?|db|dbf|ldr|upd|sig|cfg|ini|log\.bak|exe|dll|txt\.bak|ds_store|lnk|tmp)$/i;
const IGNORE_DIR=/(^|\/)(ldr_sys|garmin|jeppesen|chartview|navdata|\.spotlight|\.fseventsd|system volume information|terrain|obstacle|safetaxi|charts?)\//i;
VA.detectFile=function(name,head){
  if(IGNORE_DIR.test(name)||IGNORE.test(name))return {id:'ignore',score:100,reason:'Not flight data (database, chart, image or system file)'};
  let best=null;for(const p of R){const sc=p.detect(name,head||'');if(sc&&(!best||sc>best.score))best={id:p.id,score:sc}}
  if(best)return best;
  if(/\.csv$/i.test(name)||/,/.test((head||'').split('\n')[0]))return {id:'unknown',score:0,reason:'Unsupported CSV layout — send us a sample and we will add a parser.'};
  return {id:'unknown',score:0,reason:'Unsupported format — send us a sample (support@valkyr.aero, demo).'};
};

/* ---------------- worker (built from this function's source, works from file:// via Blob URL) ---------------- */
function workerMain(){
  const CH=4*1024*1024;
  self.onmessage=async e=>{const {job,file,bytes,id,name}=e.data;
    try{
      let text='';
      if(bytes){const dec=new TextDecoder('latin1');for(let o=0;o<bytes.length;o+=CH){text+=dec.decode(bytes.subarray(o,o+CH),{stream:true});self.postMessage({id,progress:Math.min(1,(o+CH)/bytes.length)*.5})}}
      else{const fr=new FileReaderSync();for(let o=0;o<file.size;o+=CH){text+=fr.readAsText(file.slice(o,o+CH),'latin1');self.postMessage({id,progress:Math.min(1,(o+CH)/file.size)*.5})}}
      const out=PARSE[job](text,name,p=>self.postMessage({id,progress:.5+p*.5}));
      self.postMessage({id,done:true,result:out});
    }catch(err){self.postMessage({id,done:true,error:String(err&&err.message||err)})}
  };
  /* ---- canonical summarizer: rows of {t(ms), lat, lon, ias, gs, rpm, ng, itt, tq, ff, oilT, oilP, cht[], egt[]} ---- */
  function summarize(rows,turbine,devRefRpm){
    const sessions=[];let cur=[];
    for(let i=0;i<rows.length;i++){const r=rows[i];if(cur.length&&r.t-cur[cur.length-1].t>15*60e3){sessions.push(cur);cur=[]}cur.push(r)}
    if(cur.length)sessions.push(cur);
    return sessions.map(rs=>{
      let engOn=0,tach=0,fuel=0,landings=0,air=false,airFirst=null,airLast=null,mvFirst=null,mvLast=null,startPos=null,endPos=null,airSec=0;
      const mx={cht:null,egt:null,oilT:null,oilP:null,itt:null,ng:null,tq:null},ff=[];const series=[];let lastT=null;
      const up=(k,v,min)=>{if(v==null||isNaN(v))return;if(mx[k]==null||(min?v<mx[k]:v>mx[k]))mx[k]=v};
      for(let i=0;i<rs.length;i++){const r=rs[i];const dt=lastT==null?1:Math.min(10,Math.max(0,(r.t-lastT)/1000));lastT=r.t;
        const spd=r.ias!=null&&!isNaN(r.ias)?r.ias:r.gs;const on=turbine?r.ng>50:(r.rpm>500||(r.rpm==null&&spd>3));
        if(on){engOn+=dt;if(!turbine&&r.rpm>0)tach+=dt*r.rpm/(devRefRpm||2700);if(r.ff>0){fuel+=r.ff*dt/3600;ff.push(r.ff)}
          if(r.cht&&r.cht.length)up('cht',Math.max(...r.cht.filter(x=>!isNaN(x))));if(r.egt&&r.egt.length)up('egt',Math.max(...r.egt.filter(x=>!isNaN(x))));
          up('oilT',r.oilT);if(turbine?r.ng>60:r.rpm>1500)up('oilP',r.oilP,true);up('itt',r.itt);up('ng',r.ng);up('tq',r.tq)}
        if(r.lat!=null&&!isNaN(r.lat)){if(!startPos)startPos=[r.lat,r.lon];endPos=[r.lat,r.lon]}
        if(r.gs>3){if(mvFirst==null)mvFirst=r.t;mvLast=r.t}
        const flying=spd>50;if(flying){if(airFirst==null)airFirst=r.t;airLast=r.t;airSec+=dt}
        if(air&&!flying&&spd<35){landings++;air=false}else if(flying)air=true;
        if(i%30===0)series.push([Math.round((r.t-rs[0].t)/1000),r.cht&&r.cht.length?Math.max(...r.cht):null,r.itt??null,r.oilT??null,r.oilP??null,r.ff??null,r.rpm??r.ng??null,spd??null]);
      }
      if(air)landings++;
      const H=s=>Math.round(s/360)/10;
      const eng=turbine?{itt:mx.itt,ng:mx.ng!=null?Math.round(mx.ng*10)/10:null,tq:mx.tq,oilT:mx.oilT,oilP:mx.oilP,ff:ff.length?Math.round(ff.reduce((a,b)=>a+b,0)/ff.length):null}
                       :{cht:mx.cht,egt:mx.egt,oilT:mx.oilT,oilP:mx.oilP,ff:ff.length?Math.round(ff.reduce((a,b)=>a+b,0)/ff.length*10)/10:null};
      Object.keys(eng).forEach(k=>{if(eng[k]!=null)eng[k]=Math.round(eng[k]*10)/10});
      return {start:rs[0].t,end:rs[rs.length-1].t,rows:rs.length,blockOut:mvFirst,blockIn:mvLast,takeoff:airFirst,landing:airLast,
        blockHrs:mvFirst!=null?H((mvLast-mvFirst)/1000):0,airHrs:airFirst!=null?H((airLast-airFirst)/1000):0,hobbs:H(engOn),tach:turbine?null:H(tach),
        landings,cycles:turbine?1:null,fuelGal:Math.round(fuel*10)/10,startPos,endPos,eng,turbine,series};
    });
  }
  const num=v=>{if(v==null)return NaN;v=String(v).trim();return v===''?NaN:parseFloat(v)};
  function parseTime(d,t,ofs){ // d: yyyy-mm-dd or m/d/yy(yy) ; t: hh:mm:ss ; ofs: "-04:00" (local→UTC)
    if(!d||!t)return NaN;let y,m,dd;d=d.trim();t=t.trim();
    let mm=d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(mm){y=+mm[1];m=+mm[2];dd=+mm[3]}else{mm=d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!mm)return NaN;y=+mm[3];if(y<100)y+=2000;m=+mm[1];dd=+mm[2]}
    const tp=t.split(':').map(Number);let ms=Date.UTC(y,m-1,dd,tp[0]||0,tp[1]||0,Math.floor(tp[2]||0));
    if(ofs){const o=String(ofs).trim().match(/^([+-])?(\d{1,2}):?(\d{2})?$/);if(o){const s=(o[1]==='-'?-1:1)*((+o[2])*60+(+(o[3]||0)));ms-=s*60e3}}
    return ms;
  }
  function meta(line){const o={};(line.match(/(\w+)="([^"]*)"/g)||[]).forEach(kv=>{const m=kv.match(/(\w+)="([^"]*)"/);o[m[1]]=m[2]});return o}
  function splitCSV(l){return l.split(',').map(x=>x.trim())}
  const ALIAS={itt:['E1 ITT','E1 ITT-1','E1 ITT1'],ng:['E1 NG','E1 Ng','E1 Ng-1','E1 NG1'],tq:['E1 Torq','E1 TRQ','E1 Torque','E1 Torq-1']};
  function garminLike(text,name,prog,g3x){
    const lines=text.split(/\r?\n/);const M=meta(lines[0]);
    const hi=lines.findIndex((l,i)=>i>0&&!l.startsWith('#')&&/(^|,)\s*Lcl Date\s*,/.test(l));if(hi<0)throw new Error('Header row with "Lcl Date" not found');
    const H=splitCSV(lines[hi]);const c=n=>H.indexOf(n);const ca=a=>{for(const n of a){const i=c(n);if(i>=0)return i}return -1};
    const C={d:c('Lcl Date'),t:c('Lcl Time'),o:c('UTCOfst'),lat:c('Latitude'),lon:c('Longitude'),ias:c('IAS'),gs:c('GndSpd'),rpm:c('E1 RPM'),ff:c('E1 FFlow'),oilT:c('E1 OilT'),oilP:c('E1 OilP'),itt:ca(ALIAS.itt),ng:ca(ALIAS.ng),tq:ca(ALIAS.tq),
      cht:H.map((h,i)=>/^E1 CHT\d$/.test(h)?i:-1).filter(i=>i>=0),egt:H.map((h,i)=>/^E1 EGT\d$/.test(h)?i:-1).filter(i=>i>=0)};
    const VER=['Lcl Date','Lcl Time','UTC Time','UTCOfst','AtvWpt','Latitude','Longitude','AltB','BaroA','AltMSL','OAT','IAS','GndSpd','VSpd','Pitch','Roll','LatAc','NormAc','HDG','TRK','volt1','volt2','amp1','FQtyL','FQtyR','FQty1','FQty2','E1 FFlow','E1 FPres','E1 OilT','E1 OilP','E1 MAP','E1 RPM','E1 CHT1','E1 CHT2','E1 CHT3','E1 CHT4','E1 EGT1','E1 EGT2','E1 EGT3','E1 EGT4','E1 %Pwr','AltGPS','TAS','AltP','AltInd','Volts1','Amps1','GPSfix'];
    const unverified=H.filter(h=>/^E\d /.test(h)&&!VER.includes(h));
    const rows=[];const N=lines.length;
    for(let i=hi+1;i<N;i++){const L=lines[i];if(!L||L[0]==='#')continue;const r=splitCSV(L);if(r.length<4)continue;
      const t=parseTime(r[C.d],r[C.t],C.o>=0?r[C.o]:null);if(isNaN(t))continue;
      rows.push({t,lat:num(r[C.lat]),lon:num(r[C.lon]),ias:num(r[C.ias]),gs:num(r[C.gs]),rpm:C.rpm>=0?num(r[C.rpm]):null,ng:C.ng>=0?num(r[C.ng]):null,itt:C.itt>=0?num(r[C.itt]):null,tq:C.tq>=0?num(r[C.tq]):null,ff:num(r[C.ff]),oilT:num(r[C.oilT]),oilP:num(r[C.oilP]),cht:C.cht.map(j=>num(r[j])),egt:C.egt.map(j=>num(r[j]))});
      if(i%20000===0)prog(i/N)}
    const turbine=C.ng>=0||C.itt>=0;
    return {format:g3x?'garmin-g3x':'garmin-g1000',device:{systemId:M.system_id||null,tail:M.aircraft_ident||null,airframe:M.airframe_name||M.product||null,product:M.product||null,unit:M.unit||null,
      airframeHours:M.airframe_hours?+M.airframe_hours:null,engineHours:M.engine_hours?+M.engine_hours:null},columns:H.length,unverified,turbine,sessions:summarize(rows,turbine)};
  }
  function keyCol(H,res){for(const re of res){const i=H.findIndex(h=>re.test(h));if(i>=0)return i}return -1}
  function keywordCSV(text,name,prog,fmt,device){ // header-keyword mapping for Dynon / Avidyne (columns UNVERIFIED unless noted)
    const lines=text.split(/\r?\n/).filter(Boolean);const H=splitCSV(lines[0]);
    const C={d:keyCol(H,[/^date\b/i,/gps date/i]),t:keyCol(H,[/^time recorded/i,/^(lcl |local )?time\b/i,/system time/i,/session time/i]),lat:keyCol(H,[/latitude/i,/^lat\b/i]),lon:keyCol(H,[/longitude/i,/^lon/i]),
      ias:keyCol(H,[/indicated airspeed/i,/\bias\b/i,/airspeed/i]),gs:keyCol(H,[/ground ?speed/i,/\bgs\b/i]),rpm:keyCol(H,[/^rpm\b/i,/engine rpm/i,/\brpm\b/i]),ng:keyCol(H,[/\bng\b/i,/n1\b/i]),itt:keyCol(H,[/\bitt\b/i,/\btit\b/i]),tq:keyCol(H,[/torque/i]),
      ff:keyCol(H,[/fuel flow/i,/\bff\b/i]),oilT:keyCol(H,[/oil temp/i,/oil t\b/i]),oilP:keyCol(H,[/oil press/i,/oil p\b/i]),cht:H.map((h,i)=>/\bcht\s*#?\d/i.test(h)?i:-1).filter(i=>i>=0),egt:H.map((h,i)=>/\begt\s*#?\d/i.test(h)?i:-1).filter(i=>i>=0)};
    const degC=i=>i>=0&&/deg ?c|°c|\(c\)/i.test(H[i]);const f=v=>v*9/5+32;
    const rows=[];for(let i=1;i<lines.length;i++){const r=splitCSV(lines[i]);const t=parseTime(r[C.d],r[C.t],null);if(isNaN(t))continue;
      const cv=(j,conv)=>{const v=num(r[j]);return conv&&degC(j)?f(v):v};
      rows.push({t,lat:num(r[C.lat]),lon:num(r[C.lon]),ias:num(r[C.ias]),gs:num(r[C.gs]),rpm:C.rpm>=0?num(r[C.rpm]):null,ng:C.ng>=0?num(r[C.ng]):null,itt:C.itt>=0?num(r[C.itt]):null,tq:C.tq>=0?num(r[C.tq]):null,ff:num(r[C.ff]),oilT:cv(C.oilT,true),oilP:num(r[C.oilP]),cht:C.cht.map(j=>cv(j,true)),egt:C.egt.map(j=>cv(j,true))});
      if(i%20000===0)prog(i/lines.length)}
    const turbine=C.ng>=0||C.itt>=0;
    return {format:fmt,device,columns:H.length,unverified:['column mapping by keyword (not verified against an official spec)'],turbine,sessions:summarize(rows,turbine)};
  }
  function track(points,fmt){ // [{t,lat,lon}] → derive ground speed
    const rows=[];for(let i=0;i<points.length;i++){const p=points[i],q=points[i-1];let gs=0;if(q){const dt=(p.t-q.t)/3600e3;const d=Math.hypot((p.lat-q.lat)*60,(p.lon-q.lon)*60*Math.cos(p.lat*Math.PI/180));gs=dt>0?d/dt:0}rows.push({t:p.t,lat:p.lat,lon:p.lon,gs,ias:null,rpm:null})}
    return {format:fmt,device:{},columns:3,unverified:[],turbine:false,trackOnly:true,sessions:summarize(rows,false)};
  }
  const PARSE={
    'garmin-g1000':(t,n,p)=>garminLike(t,n,p,false),
    'garmin-g3x':(t,n,p)=>garminLike(t,n,p,true),
    'dynon-skyview':(t,n,p)=>{const m=n.split('/').pop().match(/^(\d{4}-\d{2}-\d{2})-([A-Z0-9-]+?)-SN(\d+)-([\d.]+)/i);return keywordCSV(t,n,p,'dynon-skyview',{tail:m?m[2]:null,systemId:m?'SN'+m[3]:null,product:'Dynon SkyView',airframe:null})},
    'avidyne-r9':(t,n,p)=>keywordCSV(t,n,p,'avidyne-r9',{product:'Avidyne Entegra R9',systemId:null,tail:null}),
    'gpx':(t)=>{const pts=[];const re=/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;let m;while((m=re.exec(t))){const tm=(m[3].match(/<time>([^<]+)<\/time>/)||[])[1];if(tm)pts.push({lat:+m[1],lon:+m[2],t:Date.parse(tm)})}return track(pts,'gpx')},
    'kml':(t)=>{const pts=[];const w=[...t.matchAll(/<when>([^<]+)<\/when>/g)].map(x=>Date.parse(x[1]));const c=[...t.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/g)].map(x=>x[1].trim().split(/\s+/).map(Number));for(let i=0;i<Math.min(w.length,c.length);i++)pts.push({t:w[i],lon:c[i][0],lat:c[i][1]});return track(pts,'kml')},
    'jpi-edm':(t)=>{const hdr=t.slice(0,4000);const u=(hdr.match(/\$U,([^*\r\n]*)/)||[])[1];const c=(hdr.match(/\$C,(\d+)/)||[])[1];return {format:'jpi-edm',device:{tail:u?u.trim().replace(/_/g,''):null,product:c?'JPI EDM-'+c:'JPI EDM',systemId:null},detectOnly:true,sessions:[]}}
  };
}
let worker=null,seq=0;const pending=new Map();
function getWorker(){
  if(worker!==null)return worker;
  try{const src='('+workerMain.toString()+')()';worker=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
    worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;if(e.data.progress!=null)p.onProgress&&p.onProgress(e.data.progress);if(e.data.done){pending.delete(e.data.id);e.data.error?p.reject(new Error(e.data.error)):p.resolve(e.data.result)}};
    worker.onerror=()=>{worker=false}}catch(e){worker=false}
  return worker;
}
VA.workerMode=()=>!!getWorker();
// main-thread fallback (same code) if Workers are unavailable
let local=null;function localParser(){if(local)return local;const self_={};const fn=new Function('self','FileReaderSync',workerMain.toString().replace(/^function workerMain\(\)\{/,'').replace(/\}$/,'')+';return PARSE;');local=fn(self_,null);return local}
VA.parseInWorker=function(job,{file,bytes,name},onProgress){
  const w=getWorker();
  if(!w){const P=localParser();return (bytes?Promise.resolve(new TextDecoder('latin1').decode(bytes)):file.text()).then(t=>P[job](t,name,p=>onProgress&&onProgress(p)))}
  const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,onProgress});w.postMessage({job,file,bytes,id,name})});
};

/* ---------------- ingestion: files / folder / zip → sessions ---------------- */
async function expand(files,onStep){
  const out=[];
  for(const f of files){
    const name=f.webkitRelativePath||f.name;
    if(/\.zip$/i.test(name)){onStep&&onStep('Unzipping '+name);const buf=new Uint8Array(await f.arrayBuffer());const z=fflate.unzipSync(buf);
      Object.entries(z).forEach(([p,b])=>{if(!p.endsWith('/'))out.push({name:name.replace(/\.zip$/i,'')+'/'+p,bytes:b,size:b.length})})}
    else out.push({name,file:f,size:f.size});
  }
  return out;
}
async function headOf(x){if(x.bytes)return new TextDecoder('latin1').decode(x.bytes.subarray(0,4096));return await x.file.slice(0,4096).text()}
VA.ingest=async function(files,onProgress){
  const t0=performance.now();const items=await expand(files,s=>onProgress&&onProgress(0,s));
  const report={files:[],sessions:[],ms:0};let done=0;const total=items.reduce((t,x)=>t+(x.size||1),0);
  for(const x of items){
    const head=await headOf(x);const det=VA.detectFile(x.name,head);const p=R.find(r=>r.id===det.id);
    const rec={name:x.name,size:x.size,format:det.id,formatName:p?p.name:det.id==='ignore'?'Ignored':'Unknown',status:p?p.status:det.id,reason:det.reason||'',sessions:0};
    report.files.push(rec);
    const parsable=p&&['verified','partial','detect-only'].includes(p.status)&&p.id!=='valkyr-csv';
    if(parsable){try{const res=await VA.parseInWorker(p.id,x,f=>onProgress&&onProgress((done+f*(x.size||1))/total,x.name));
        rec.device=res.device;rec.unverified=res.unverified;
        if(res.detectOnly){rec.reason='Recognized '+(res.device.product||'')+(res.device.tail?' · tail '+res.device.tail:'')+' — binary flight records not decoded yet. Export CSV from EzTrends or send us the file.'}
        res.sessions.filter(s=>s.rows>=60&&(s.hobbs>=0.1||s.airHrs>=0.1)).forEach((s,i)=>report.sessions.push({...s,id:uid('ses'),file:x.name,format:res.format,device:res.device,turbine:res.turbine,trackOnly:!!res.trackOnly}));
        rec.sessions=report.sessions.filter(s=>s.file===x.name).length}
      catch(err){rec.status='error';rec.reason=err.message}}
    else if(p&&p.status==='unsupported')rec.reason=p.covers;
    else if(p&&p.id==='valkyr-csv')rec.reason='Valkyr CSV — import from the Log flight screen.';
    done+=x.size||1;onProgress&&onProgress(done/total,x.name);
  }
  // group: same device + overlapping time = one flight (e.g. PFD + MFD both logging, or Avidyne C_ENGINE + C_FLIGHT)
  const merged=[];report.sessions.sort((a,b)=>a.start-b.start).forEach(s=>{const k=(s.device.systemId||s.device.tail||s.format);
    const m=merged.find(o=>(o.device.systemId||o.device.tail||o.format)===k&&s.start<o.end&&o.start<s.end);
    if(m){m.files.push(s.file);const keep={eng:(m.eng&&m.eng.cht)?m.eng:s.eng,series:Object.assign({},s.series||{},m.series||{})};
      if(s.rows>m.rows){Object.assign(m,{...s,files:m.files,id:m.id})}
      if(!m.airHrs&&s.airHrs)['takeoff','landing','airHrs','landings','startPos','endPos'].forEach(k=>m[k]=s[k]);
      if(!m.startPos&&s.startPos){m.startPos=s.startPos;m.endPos=s.endPos}
      if(!m.fuelGal&&s.fuelGal)m.fuelGal=s.fuelGal;Object.assign(m,keep)}else merged.push({...s,files:[s.file]})});
  report.sessions=merged;
  report.sessions.forEach(s=>Object.assign(s,VA.matchSession(s)));
  report.ms=performance.now()-t0;VA.lastIngest=report;return report;
};

/* ---------------- matching ---------------- */
const BASES={KM02:[36.1287,-87.4300],KBNA:[36.1245,-86.6782]};
const near=(p,b)=>p&&b&&Math.hypot((p[0]-b[0])*60,(p[1]-b[1])*60*Math.cos(b[0]*Math.PI/180))<5;
VA.deviceKey=d=>d&&(d.systemId?`${d.product||'dev'}|${d.systemId}`:d.tail?'tail|'+d.tail.toUpperCase():null);
VA.matchSession=function(s){
  const st=S();const cands=[];const dk=VA.deviceKey(s.device);
  st.aircraft.forEach(a=>{let sc=0;const why=[];
    const tail=(s.device.tail||'').toUpperCase().replace(/^N?/,'N');
    if(s.device.tail&&tail===a.tail.toUpperCase()){sc=Math.max(sc,95);why.push('tail '+a.tail+' in file')}
    if(dk&&(st.deviceMap||{})[dk]===a.id){sc=Math.max(sc,92);why.push('learned device mapping')}
    if(s.device.systemId&&(st.avionics||[]).some(x=>x.ac===a.id&&x.systemId===s.device.systemId)){sc=Math.max(sc,90);why.push('system_id on file')}
    if(sc<90&&s.device.airframe){const nm=s.device.airframe.toLowerCase();if(a.model.toLowerCase().includes(nm)||nm.includes(a.short.toLowerCase().split(' ')[0])){sc=Math.max(sc,40);why.push('airframe name')}}
    const turb=VA.isTurbine(a);if(!s.trackOnly){if(turb===!!s.turbine){sc+=sc?3:10;why.push(turb?'turbine parameters':'piston parameters')}else{sc-=40;why.push('engine type mismatch')}}
    const base=BASES[a.base||'KM02'];if(near(s.startPos,base)||near(s.endPos,base)){sc+=sc>=90?2:15;why.push('track starts/ends at '+(a.base||'KM02'))}
    const d=new Date(s.start);const ds=VA.isoOf(d),hr=d.getHours();
    if(st.bookings.some(b=>b.ac===a.id&&b.date===ds&&hr>=b.start-1&&hr<=b.start+b.dur)){sc+=sc>=90?2:25;why.push('matches a booking')}
    if(sc>0)cands.push({ac:a.id,score:Math.min(99,Math.max(0,sc)),why})});
  cands.sort((x,y)=>y.score-x.score);
  const top=cands[0];
  return {cands:cands.slice(0,4),match:top&&top.score>=30?top.ac:null,confidence:top?top.score:0,autoConfirm:top&&top.score>=90&&(!cands[1]||cands[1].score<top.score-20)};
};
VA.learnDevice=(s,ac)=>{const k=VA.deviceKey(s.device);if(!k)return;const st=S();st.deviceMap=st.deviceMap||{};st.deviceMap[k]=ac;VA.save()};

/* commit one confirmed session → flight (deduped), fuel expense, engine summary, exceedance drafts */
VA.commitSession=async function(s,ac){
  const a=VA.ac(ac);const d=new Date(s.takeoff||s.start);const date=VA.isoOf(d);
  const nearest=p=>{if(!p)return '?';const AP={KM02:[36.1287,-87.43],KBNA:[36.1245,-86.6782],KMQY:[36.009,-86.5201],KJWN:[36.1824,-86.8867],KCKV:[36.6219,-87.415],KHSV:[34.6372,-86.7751],KMEM:[35.0424,-89.9767],KCHA:[35.0353,-85.2038],KTYS:[35.811,-83.994],KPDK:[33.8756,-84.302],KSTL:[38.7487,-90.37]};let b=null,bd=1e9;for(const [k,c] of Object.entries(AP)){const dd=Math.hypot((p[0]-c[0])*60,(p[1]-c[1])*60*Math.cos(c[0]*Math.PI/180));if(dd<bd){bd=dd;b=k}}return bd<8?b:`${p[0].toFixed(2)},${p[1].toFixed(2)}`};
  const g={meta:{system_id:s.device.systemId||s.device.tail||'',airframe_name:s.device.airframe||''},date,from:nearest(s.startPos),to:nearest(s.endPos),flightHrs:s.airHrs,hobbs:s.hobbs,tach:s.tach,blockOut:s.blockOut?new Date(s.blockOut).toTimeString().slice(0,8):'',blockIn:s.blockIn?new Date(s.blockIn).toTimeString().slice(0,8):'',fuelGal:s.fuelGal,rows:s.rows,eng:s.trackOnly?null:s.eng};
  const r=await VA.importGarmin(g,ac);
  if(r.flightId){const e=await DAL.getLog(r.flightId);if(e){e.series=s.series;e.landings=s.landings;e.cycles=s.cycles;e.format=s.format;await DAL.putLog(e)}}
  if(s.landings&&!r.dup){a.landings=(a.landings||0)+s.landings;if(VA.isTurbine(a))a.cycles=(a.cycles||0)+1}
  VA.learnDevice(s,ac);VA.save();
  return r;
};
})();
