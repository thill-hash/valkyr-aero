/* Valkyr360 — CSV import/export, Garmin data-log import, engine exceedance detection */
(function(){
const {esc,h1,money,todayISO,uid,fmtShort,addDays}=VA;
const S=()=>VA.state();
/* RFC-4180-ish parser (quotes, escaped quotes, CRLF) */
VA.parseCSV=function(text){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}else f+=c}
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()!==''));
};
VA.toCSV=rows=>rows.map(r=>r.map(v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\n');
VA.download=function(name,text,type='text/csv'){const b=new Blob([text],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);VA.lastDownload={name,text}};
const normDate=s=>{s=(s||'').trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`}return null};
const acByTail=t=>S().aircraft.find(a=>a.tail.toUpperCase()===String(t||'').trim().toUpperCase());
function table(rows){const [h,...b]=rows;const k=h.map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_'));return b.map((r,i)=>{const o={_line:i+2};k.forEach((c,j)=>o[c]=(r[j]||'').trim());return o})}

VA.TEMPLATES={
  flights:'tail,date,from,to,hours,pilot\nN350VK,2026-10-01,KM02,KBNA,0.8,Jake Morrow\n',
  due:'tail,item,type,ref,interval_hours,interval_months,last_done_hours,last_done_date,required\nN813ZK,Alternator belt inspection,Inspection,Mfr SIL,100,,790.0,,yes\n',
  expenses:'date,tail,category,vendor,description,quantity,unit,unit_price,amount,paid_by,notes\n2026-10-01,N350VK,Fuel & oil,KM02 FBO,Jet A uplift,120,gal,6.10,732.00,Company card,\n'
};
/* ---------- validate rows → {ok:[...], errors:[...]} ---------- */
VA.validate={
  flights(rows){const ok=[],errors=[];table(rows).forEach(r=>{const a=acByTail(r.tail),d=normDate(r.date),h=parseFloat(r.hours||r.flight_time||r.total_time);
    if(!a)return errors.push(`Line ${r._line}: unknown tail "${r.tail}"`);if(!d)return errors.push(`Line ${r._line}: bad date "${r.date}"`);if(!(h>0&&h<=24))return errors.push(`Line ${r._line}: bad hours "${r.hours}"`);
    const p=S().people.find(x=>x.name.toLowerCase()===(r.pilot||'').toLowerCase());
    ok.push({ac:a.id,date:d,from:(r.from||'KM02').toUpperCase(),to:(r.to||'KM02').toUpperCase(),hrs:Math.round(h*10)/10,pilot:p?p.id:'p_jake',src:'CSV'})});return {ok,errors}},
  due(rows){const ok=[],errors=[];const cats=['Inspection','AD','SB','Life-limited','Calendar'];table(rows).forEach(r=>{const a=acByTail(r.tail);
    if(!a)return errors.push(`Line ${r._line}: unknown tail "${r.tail}"`);if(!r.item)return errors.push(`Line ${r._line}: missing item`);
    const ih=parseFloat(r.interval_hours)||null,im=parseInt(r.interval_months)||null,lh=r.last_done_hours?parseFloat(r.last_done_hours):null,ld=r.last_done_date?normDate(r.last_done_date):null;
    if(ih&&lh==null)return errors.push(`Line ${r._line}: interval_hours needs last_done_hours`);if(im&&!ld)return errors.push(`Line ${r._line}: interval_months needs last_done_date`);
    ok.push({id:uid('m'),ac:a.id,cat:cats.find(c=>c.toLowerCase()===(r.type||'').toLowerCase())||'Inspection',name:r.item,ref:r.ref||'CSV import',intHrs:ih,intMo:im,lastHrs:lh,lastDate:ld,required:!/^(n|no|false|0)$/i.test(r.required||'yes'),verified:null,imported:true})});return {ok,errors}},
  expenses(rows){const ok=[],errors=[];table(rows).forEach(r=>{const a=acByTail(r.tail),d=normDate(r.date);
    if(!a)return errors.push(`Line ${r._line}: unknown tail "${r.tail}"`);if(!d)return errors.push(`Line ${r._line}: bad date "${r.date}"`);
    const qty=parseFloat(r.quantity)||1,up=parseFloat(r.unit_price),amt=parseFloat((r.amount||'').replace(/[$,]/g,''))||(up?qty*up:NaN);
    if(!(amt>=0))return errors.push(`Line ${r._line}: bad amount "${r.amount}"`);
    const cn=(r.category||'').toLowerCase();const c=VA.CATS.find(x=>x[1].toLowerCase()===cn||x[0]===cn)||VA.CATS.find(x=>cn&&x[1].toLowerCase().startsWith(cn.split(/[ /&]/)[0]))||['other'];
    ok.push({id:uid('x'),ac:a.id,date:d,cat:c[0],vendor:r.vendor||'',desc:r.description||'',qty,unit:r.unit||'ea',unitPrice:up||amt/qty,amount:Math.round(amt*100)/100,receipt:'',paidBy:r.paid_by||'',notes:r.notes||'',src:'csv'})});return {ok,errors}}
};
VA.applyImport=async function(kind,ok){
  const t0=performance.now();
  if(kind==='flights'){const before={};ok.forEach(f=>{before[f.ac]=before[f.ac]??VA.ac(f.ac).tt});
    const entries=[],fuel=[];const cut=addDays(todayISO(),-365);
    ok.forEach(f=>{const a=VA.ac(f.ac);a.tt=Math.round((a.tt+f.hrs)*10)/10;if(f.date>=cut)a.hrs12=Math.round((a.hrs12+f.hrs)*10)/10;const e=VA.flightEntry({...f,id:uid('l')});e.imported=true;entries.push(e);const fx=VA.fuelExpense(a,e,'csv');fuel.push(fx);VA.aggFlight(e);VA.aggAdd(fx)});
    await DAL.addLogs(entries);await DAL.putExpenses(fuel);VA.logCount=(VA.logCount||0)+entries.length;VA.save();
    return {ms:performance.now()-t0,msg:`${ok.length.toLocaleString()} flights · +${h1(ok.reduce((t,f)=>t+f.hrs,0))} h · ${fuel.length.toLocaleString()} fuel expenses created`,before}}
  if(kind==='due'){S().items.push(...ok);VA.save();return {ms:performance.now()-t0,msg:`${ok.length} due items added — marked "Needs IA review"`}}
  if(kind==='expenses'){await DAL.putExpenses(ok);ok.forEach(VA.aggAdd);return {ms:performance.now()-t0,msg:`${ok.length.toLocaleString()} expenses added (${money(ok.reduce((t,x)=>t+x.amount,0))})`}}
};

/* ---------- Garmin G1000 / G1000 NXi / Perspective / G3X SD-card data log ----------
   Layout (verified against a published DA40 G1000 sample and NTSB G1000 reports):
     line 1: #airframe_info, log_version="1.00", airframe_name="...", unit_software_part_number=..., system_id="...", mode=NORMAL,
     line 2: #units row        line 3: column header        then 1 row per second.
   Header names verified: Lcl Date, Lcl Time, UTCOfst, AtvWpt, Latitude, Longitude, AltB, BaroA, AltMSL, OAT, IAS, GndSpd, VSpd,
     Pitch, Roll, LatAc, NormAc, HDG, TRK, volt1, FQtyL, FQtyR, E1 FFlow, E1 FPres, E1 OilT, E1 OilP, E1 MAP, E1 RPM, E1 CHT1-4, E1 EGT1-4, AltGPS, TAS ...
   UNVERIFIED (turbine) column names — accepted as aliases: E1 ITT / E1 ITT-1, E1 NG / E1 Ng, E1 Torq / E1 TRQ, E1 NP. Six-cylinder CHT5/6, EGT5/6 inferred. */
VA.GARMIN_VERIFIED=['Lcl Date','Lcl Time','UTCOfst','AtvWpt','Latitude','Longitude','AltB','BaroA','AltMSL','OAT','IAS','GndSpd','VSpd','Pitch','Roll','LatAc','NormAc','HDG','TRK','volt1','FQtyL','FQtyR','E1 FFlow','E1 FPres','E1 OilT','E1 OilP','E1 MAP','E1 RPM','E1 CHT1','E1 CHT2','E1 CHT3','E1 CHT4','E1 EGT1','E1 EGT2','E1 EGT3','E1 EGT4','AltGPS','TAS'];
const ALIAS={itt:['E1 ITT','E1 ITT-1','E1 ITT1'],ng:['E1 NG','E1 Ng','E1 Ng-1','E1 NG1'],tq:['E1 Torq','E1 TRQ','E1 Torque','E1 Torq-1'],np:['E1 NP','E1 Np']};
VA.detectFormat=function(text,name=''){
  const head=text.slice(0,600);
  if(/^#airframe_info/m.test(head))return 'garmin';
  if(/^\$U,/m.test(head)||/\.jpi$/i.test(name))return 'jpi';
  const first=(text.split(/\r?\n/)[0]||'').toLowerCase();
  if(first.includes('category')&&first.includes('amount'))return 'expenses';
  if(first.includes('interval_hours')||first.includes('item'))return 'due';
  if(first.includes('hours')&&first.includes('tail'))return 'flights';
  return 'unknown';
};
const AP={KM02:[36.1287,-87.4300],KBNA:[36.1245,-86.6782],KMQY:[36.0090,-86.5201],KJWN:[36.1824,-86.8867],KCKV:[36.6219,-87.4150],KHSV:[34.6372,-86.7751],KMEM:[35.0424,-89.9767],KCHA:[35.0353,-85.2038],KTYS:[35.8110,-83.9940],KPDK:[33.8756,-84.3020],KSTL:[38.7487,-90.3700]};
function nearest(lat,lon){let best=null,bd=1e9;for(const [k,[a,b]] of Object.entries(AP)){const d=Math.hypot((lat-a)*60,(lon-b)*60*Math.cos(a*Math.PI/180));if(d<bd){bd=d;best=k}}return bd<8?best:`${lat.toFixed(3)},${lon.toFixed(3)}`}
VA.parseGarmin=function(text){
  const lines=text.split(/\r?\n/);const meta={};
  (lines[0].match(/(\w+)="?([^",]*)"?/g)||[]).forEach(kv=>{const m=kv.match(/(\w+)="?([^",]*)"?/);if(m)meta[m[1]]=m[2]});
  const hi=lines.findIndex((l,i)=>i>0&&!l.startsWith('#')&&/Lcl Date/i.test(l));if(hi<0)throw new Error('No Garmin header row found');
  const hdr=lines[hi].split(',').map(x=>x.trim());const col=n=>hdr.indexOf(n);const colA=list=>{for(const n of list){const i=col(n);if(i>=0)return i}return -1};
  const C={date:col('Lcl Date'),time:col('Lcl Time'),lat:col('Latitude'),lon:col('Longitude'),ias:col('IAS'),gs:col('GndSpd'),rpm:col('E1 RPM'),ff:col('E1 FFlow'),oilT:col('E1 OilT'),oilP:col('E1 OilP'),
    cht:hdr.map((h,i)=>/^E1 CHT\d$/.test(h)?i:-1).filter(i=>i>=0),egt:hdr.map((h,i)=>/^E1 EGT\d$/.test(h)?i:-1).filter(i=>i>=0),itt:colA(ALIAS.itt),ng:colA(ALIAS.ng),tq:colA(ALIAS.tq)};
  const unverified=hdr.filter(h=>h&&!VA.GARMIN_VERIFIED.includes(h)&&/^E1 /.test(h));
  const turbine=C.itt>=0||C.ng>=0;
  let n=0,engOn=0,tachSec=0,fuelGal=0,airFirst=null,airLast=null,moveFirst=null,moveLast=null,first=null,last=null,startPos=null,endPos=null;
  const mx={cht:0,egt:0,oilT:0,oilPmin:1e9,itt:0,ng:0,tq:0},ffs=[],chtByCyl=C.cht.map(()=>0);const series=[];
  const num=(r,i)=>i>=0?parseFloat(r[i]):NaN;
  for(let i=hi+1;i<lines.length;i++){const L=lines[i];if(!L||L.startsWith('#'))continue;const r=L.split(',').map(x=>x.trim());if(r.length<5)continue;
    const t=`${r[C.date]} ${r[C.time]}`;n++;if(!first)first=t;last=t;
    const rpm=num(r,C.rpm),ng=num(r,C.ng),ias=num(r,C.ias),gs=num(r,C.gs),ff=num(r,C.ff),lat=num(r,C.lat),lon=num(r,C.lon);
    const on=turbine?ng>50:rpm>500;if(on){engOn++;if(!turbine&&rpm>0)tachSec+=rpm/2700;if(ff>0){fuelGal+=ff/3600;ffs.push(ff)}}
    if(!isNaN(lat)&&!isNaN(lon)){if(!startPos)startPos=[lat,lon];endPos=[lat,lon]}
    if(gs>3){if(!moveFirst)moveFirst=t;moveLast=t}
    if(ias>50||gs>50){if(!airFirst)airFirst=t;airLast=t}
    if(on){C.cht.forEach((ci,k)=>{const v=num(r,ci);if(v>chtByCyl[k])chtByCyl[k]=v;if(v>mx.cht)mx.cht=v});C.egt.forEach(ci=>{const v=num(r,ci);if(v>mx.egt)mx.egt=v});
      const ot=num(r,C.oilT),op=num(r,C.oilP);if(ot>mx.oilT)mx.oilT=ot;if(op>0&&op<mx.oilPmin&&(turbine?ng>60:rpm>1500))mx.oilPmin=op;
      if(ng>mx.ng)mx.ng=ng;const it=num(r,C.itt);if(it>mx.itt)mx.itt=it;const tq=num(r,C.tq);if(tq>mx.tq)mx.tq=tq}
    if(n%30===0)series.push({t:r[C.time],cht:C.cht.length?Math.max(...C.cht.map(ci=>num(r,ci)||0)):null,itt:num(r,C.itt)||null});
  }
  const secs=(a,b)=>a&&b?(new Date(b.replace(' ','T'))-new Date(a.replace(' ','T')))/1000:0;
  const flightHrs=Math.round(secs(airFirst,airLast)/360)/10,hobbs=Math.round(engOn/360)/10,tach=Math.round(tachSec/360)/10;
  const eng=turbine?{itt:Math.round(mx.itt),ng:Math.round(mx.ng*10)/10,tq:Math.round(mx.tq),oilT:Math.round(mx.oilT),oilP:mx.oilPmin<1e9?Math.round(mx.oilPmin):null,ff:ffs.length?Math.round(ffs.reduce((a,b)=>a+b,0)/ffs.length):null}
                   :{cht:Math.round(mx.cht),egt:Math.round(mx.egt),oilT:Math.round(mx.oilT),oilP:mx.oilPmin<1e9?Math.round(mx.oilPmin):null,ff:ffs.length?Math.round(ffs.reduce((a,b)=>a+b,0)/ffs.length*10)/10:null};
  return {meta,rows:n,date:first?first.slice(0,10):null,blockOut:moveFirst&&moveFirst.slice(11),blockIn:moveLast&&moveLast.slice(11),takeoff:airFirst&&airFirst.slice(11),landing:airLast&&airLast.slice(11),
    flightHrs,hobbs,tach:turbine?null:tach,blockHrs:Math.round(secs(moveFirst,moveLast)/360)/10,fuelGal:Math.round(fuelGal*10)/10,from:startPos?nearest(...startPos):'?',to:endPos?nearest(...endPos):'?',
    turbine,eng,chtByCyl,unverified,columns:hdr.length,series};
};
VA.mapGarminAircraft=function(g){
  const m=(S().avionics||[]).find(x=>x.systemId===g.meta.system_id);if(m)return {ac:m.ac,how:'system_id '+g.meta.system_id};
  const nm=(g.meta.airframe_name||'').toLowerCase();const a=S().aircraft.find(a=>nm&&(a.model.toLowerCase().includes(nm)||nm.includes(a.short.toLowerCase().split(' ')[0].toLowerCase())));
  return a?{ac:a.id,how:'airframe_name "'+g.meta.airframe_name+'" (confirm)'}:{ac:null,how:'not matched — pick aircraft'};
};
/* dedupe: same aircraft + date, |Δhrs| ≤ 0.3 and same route (or route unknown) */
VA.findDuplicate=async function(ac,g){
  const fl=await DAL.flightsIn({ac,from:g.date,to:g.date});
  return fl.find(f=>(f.garmin&&f.garmin.key===g.key)||(Math.abs((f.hrs||0)-g.flightHrs)<=0.3&&(f.from===g.from||g.from.includes(','))&&(f.to===g.to||g.to.includes(','))))||null;
};
VA.importGarmin=async function(g,ac,{forceNew=false}={}){
  const a=VA.ac(ac);g.key=(g.meta.system_id||'')+'|'+g.date+'|'+g.blockOut;
  const dup=forceNew?null:await VA.findDuplicate(ac,g);
  const garmin={key:g.key,systemId:g.meta.system_id,airframe:g.meta.airframe_name,hobbs:g.hobbs,tach:g.tach,blockOut:g.blockOut,blockIn:g.blockIn,fuelGal:g.fuelGal,rows:g.rows};
  let flightId,created=false;
  if(dup){dup.eng=g.eng;dup.garmin=garmin;dup.text=dup.text.replace(/ · Garmin data attached$/,'')+' · Garmin data attached';await DAL.putLog(dup);flightId=dup.id}
  else{VA.addFlight({ac,pilot:VA.me().role==='pilot'?VA.me().id:'p_jake',date:g.date,from:g.from,to:g.to,hrs:g.flightHrs||g.hobbs,src:'Garmin SD card',eng:g.eng,garmin,fuelGal:g.fuelGal});await VA.pendingWrite;flightId=VA.lastFlightId;created=true}
  const ex=VA.checkExceedances(ac,g.eng,{id:flightId,date:g.date,from:g.from,to:g.to});
  VA.save();
  return {dup:!!dup,created,flightId,exceedances:ex};
};

/* ---------- limits & exceedances ---------- */
VA.PARAMS={cht:['CHT','°F'],egt:['EGT','°F'],oilT:['Oil temp','°'],oilP:['Oil press','psi'],ff:['Fuel flow','gph'],itt:['ITT','°C'],ng:['Ng','%'],tq:['Torque','ft-lb / psi']};
VA.defaultLimits=a=>VA.isTurbine(a)
  ?{itt:{max:a.short.includes('PC-12')?850:820,grounding:false},ng:{max:104,grounding:false},tq:{max:a.tqMax||2230,grounding:false},oilT:{max:110,grounding:false},oilP:{min:85,grounding:false}}
  :{cht:{max:460,grounding:false},oilT:{max:240,grounding:false},oilP:{min:30,grounding:true},egt:{max:1650,grounding:false}};
VA.limitsFor=ac=>{const s=S();s.limits=s.limits||{};return s.limits[ac]||(s.limits[ac]=VA.defaultLimits(VA.ac(ac)))};
VA.checkExceedances=function(ac,eng,flight){
  if(!eng)return [];const L=VA.limitsFor(ac),out=[];
  Object.entries(L).forEach(([k,l])=>{const v=eng[k];if(v==null)return;if((l.max!=null&&v>l.max)||(l.min!=null&&v<l.min))out.push({k,v,l})});
  out.forEach(x=>{const [nm,u]=VA.PARAMS[x.k];const lim=x.l.max!=null?`limit ${x.l.max} ${u}`:`minimum ${x.l.min} ${u}`;
    S().squawks.unshift({id:uid('s'),ac,title:`Engine exceedance: ${nm} ${x.v} ${u} (${lim})`,desc:`Auto-detected from Garmin engine data on ${flight.from} → ${flight.to} (${flight.date}).${x.l.grounding?' Limit is marked GROUNDING — aircraft grounded pending inspection.':' Draft — needs mechanic review before it affects airworthiness.'}`,
      by:'system',date:flight.date||todayISO(),grounding:!!x.l.grounding,status:x.l.grounding?'open':'draft',auto:true,flight:flight.id})});
  if(out.length)VA.save();
  return out;
};
})();
