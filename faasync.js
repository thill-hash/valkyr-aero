/* Valkyr Aero — FAA registry versioning, incremental updates, change review, unmapped-type queue and AD applicability.
   Prototype: updates arrive as a delta file (format "valkyr-faa-delta/1", produced server-side in production) or as a
   ReleasableAircraft.zip the user downloaded; a live in-browser fetch is attempted but registry.faa.gov does not allow
   cross-origin downloads, so production syncs server-side nightly. User-entered aircraft fields are never overwritten. */
(function(){
const {esc,todayISO,uid}=VA;const S=()=>VA.state();const T=()=>VA.types;
const M=window.FAA_VERSION||{version:'unknown',counts:{}};
const F=VA.faa={manifest:M,overlay:{types:{},master:{}},LIVE_URL:M.source||'https://registry.faa.gov/database/ReleasableAircraft.zip'};
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return VA.isoOf(x)};
const ymd=s=>!s?'':/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:s;
F.st=function(){const s=S();if(!s.faa)s.faa={version:M.version,zipSha256:M.zipSha256||null,baseVersion:M.version,lastSync:M.built||null,lastCheck:null,history:[],tierMap:{},unmapped:[],reviews:[],log:[],adSync:null};
  const f=s.faa;['history','unmapped','reviews','log'].forEach(k=>f[k]=f[k]||[]);f.tierMap=f.tierMap||{};return f};
F.init=async function(){
  try{F.overlay=(await DAL.getKV('faaOverlay'))||{types:{},master:{}}}catch(e){F.overlay={types:{},master:{}}}
  const f=F.st();S().aircraft.forEach(a=>{if(a.faa&&a.faa.code&&!f.tierMap[a.faa.code])f.tierMap[a.faa.code]={tier:a.cls,by:'pinned from fleet',at:todayISO()}});
  hook();
};
const saveOverlay=()=>DAL.putKV('faaOverlay',F.overlay);
const log=(kind,text,extra)=>{const f=F.st();f.log.unshift({id:uid('fl'),at:new Date().toISOString(),kind,text,...(extra||{})});if(f.log.length>500)f.log.length=500};

/* ---- record conversion (ACFTREF / MASTER column names per ardata.pdf) ---- */
const typeRec=x=>({code:x['CODE'],mfr:x['MFR'],model:x['MODEL'],typeAcft:String(x['TYPE-ACFT']),typeEng:String(x['TYPE-ENG']).trim(),noEng:+x['NO-ENG']||0,seats:+x['NO-SEATS']||0,
  wclass:+(String(x['AC-WEIGHT']||'').replace(/\D/g,''))||0,cert:String(x['BUILD-CERT-IND']),speed:+x['SPEED']||0});
const masterRec=x=>({n:'N'+String(x['N-NUMBER']).replace(/^N/,'').trim(),serial:String(x['SERIAL NUMBER']||'').trim(),code:String(x['MFR MDL CODE']||'').trim(),engCode:String(x['ENG MFR MDL']||'').trim(),
  year:String(x['YEAR MFR']||'').trim(),status:String(x['STATUS CODE']||'').trim(),certIssue:ymd(String(x['CERT ISSUE DATE']||'').trim()),airworthDate:ymd(String(x['AIR WORTH DATE']||'').trim()),
  expiration:ymd(String(x['EXPIRATION DATE']||'').trim()),registrantType:String(x['TYPE REGISTRANT']||'').trim(),modeSHex:String(x['MODE S CODE HEX']||'').trim(),
  certification:String(x['CERTIFICATION']||'').trim(),ownerHash:x['OWNER_HASH']||x.ownerHash||null});

/* ---- overlay hooks: patched records win over the bundled library ---- */
let hooked=false;
function hook(){if(hooked||!VA.types)return;hooked=true;const t=VA.types;
  const load0=t.load;t.load=async function(){const lib=await load0.call(t);if(!lib._ov||lib._ov!==F.overlayStamp)applyTypesOverlay(lib);return lib};
  const look0=t.lookupN;t.lookupN=async function(n){const key='N'+String(n||'').toUpperCase().replace(/^N/,'').trim();const ov=F.overlay.master[key];
    if(ov===undefined)return look0.call(t,n);await t.load();if(ov===null||ov.deregistered)return {notFound:true,deregistered:true,n:key,overlay:true};
    return {...ov,type:t.lib.byCode.get(ov.code)||null,eng:t.lib.eng.get(ov.engCode)||null,cert:t.decodeCert(ov.certification),overlay:true}};
  const cls0=t.classify;t.classifyRaw=cls0;t.classify=function(r,reg){const c=cls0.call(t,r,reg);const pin=r&&F.st().tierMap[r.code];
    if(pin&&pin.tier!==c.tier&&!(reg&&c.tier==='experimental')){c.flags=['Tier pinned to '+pin.tier+' ('+pin.by+'); current FAA record would map to '+c.tier,...c.flags];c.guess=c.tier;c.tier=pin.tier;c.pinned=true}else if(pin)c.pinned=true;return c};
}
F.overlayStamp=0;
function applyTypesOverlay(lib){F.overlayStamp++;lib._ov=F.overlayStamp;
  for(const [code,r] of Object.entries(F.overlay.types)){const old=lib.byCode.get(code);
    if(r===null){if(old){old.removed=true;lib.byCode.delete(code);const i=lib.list.indexOf(old);if(i>=0)lib.list.splice(i,1)}continue}
    const rec={...r,key:(r.mfr+' '+r.model).toLowerCase(),patched:true};
    if(old){Object.assign(old,rec)}else{lib.list.push(rec);lib.byCode.set(code,rec)}}}

/* ---- registry change detection for fleet aircraft ---- */
const REG_FIELDS=[['n','N-number'],['serial','Serial number'],['code','Model code (ACFTREF)'],['status','Registration status'],['expiration','Registration expires'],['certIssue','Certificate issue date'],
  ['registrantType','Registrant type'],['ownerHash','Owner (hashed — names not stored)'],['certification','Airworthiness class'],['modeSHex','Mode S hex'],['year','Year mfr']];
const REGTYPE={1:'Individual',2:'Partnership',3:'Corporation',4:'Co-owned',5:'Government',7:'LLC',8:'Non-citizen corporation',9:'Non-citizen co-owned'};
F.fmtField=(k,v)=>v==null||v===''?'—':k==='registrantType'?(REGTYPE[v]||v)+` (${v})`:k==='status'?({V:'Valid',R:'Registration pending',D:'Expired / dereg. pending',E:'Revoked',N:'Non-citizen corp. — flight hours not reported',M:'Valid — dealer',T:'Valid — trainee'}[v]||v)+` (${v})`:k==='ownerHash'?'••••'+String(v).slice(-4):k==='certification'&&VA.types&&VA.types.decodeCert?(VA.types.decodeCert(v)||{}).className+` (${v})`:String(v);
function regDiff(a,rec){const cur=a.reg||{n:a.tail};const out=[];REG_FIELDS.forEach(([k,label])=>{if(rec[k]==null||rec[k]==='')return;if(String(cur[k]??'')!==String(rec[k]))out.push({k,label,old:cur[k]??'',new:rec[k]})});return out}
function regItem(a,info){ // registration expiring ≤ 90 days or deregistered → due-list item (system-generated, 14 CFR 47.40 / 91.203)
  const s=S();const id='reg_'+a.id;let it=s.items.find(i=>i.id===id);
  const mk=o=>{if(it)Object.assign(it,o);else{it={id,ac:a.id,cat:'Calendar',verified:null,src:'faa',required:true,...o};s.items.push(it)}VA.dirty&&VA.dirty();return it};
  if(info.deregistered)return mk({name:'Registration — DEREGISTERED per FAA registry (verify)',ref:'14 CFR 91.203(a)(2) / 47.41 · FAA registry '+info.version,targetDate:info.date||todayISO(),soonDays:90,lastDate:null,intMo:null,required:true});
  if(info.expiration){const days=VA.daysBetween(todayISO(),info.expiration);if(days<=90||it)return mk({name:'Aircraft registration expires (FAA registry)',ref:'14 CFR 47.40 — 7-year registration · FAA registry '+info.version,targetDate:info.expiration,soonDays:90,lastDate:null,intMo:null,required:true})}
  return null}
F.regItem=regItem;

/* ---- apply a delta (or a zip converted to a delta) ---- */
F.applyDelta=async function(d,opts={}){
  const t0=performance.now();const f=F.st();const s=S();await VA.types.load();const lib=VA.types.lib;
  if(d.format!=='valkyr-faa-delta/1')throw new Error('Not a Valkyr FAA delta file');
  if(f.history.some(h=>h.version===d.version&&h.zipSha256===d.zipSha256))return {skipped:true,reason:'Version '+d.version+' already applied'};
  const undo={types:{},master:{}};const res={version:d.version,simulated:!!d.simulated,types:{added:0,changed:0,removed:0,pinnedKept:0},master:{changed:0,removed:0},reviews:[],items:[],unmapped:0,ads:{matched:0,items:[]}};
  const A=d.acftref||{};const keepUndo=(bucket,k)=>{if(!(k in undo[bucket]))undo[bucket][k]=F.overlay[bucket][k]};
  (A.added||[]).forEach(x=>{const r=typeRec(x);keepUndo('types',r.code);F.overlay.types[r.code]=r;res.types.added++;
    if(!f.tierMap[r.code]&&!f.unmapped.some(u=>u.code===r.code)){const c=VA.types.classifyRaw(r);f.unmapped.push({code:r.code,mfr:r.mfr,model:r.model,guess:c.tier,flags:c.flags,status:'pending',version:d.version});res.unmapped++}});
  (A.changed||[]).forEach(x=>{const r=typeRec(x);keepUndo('types',r.code);const before=lib.byCode.get(r.code);F.overlay.types[r.code]=r;res.types.changed++;
    const pin=f.tierMap[r.code];if(pin){const now=VA.types.classifyRaw(r).tier;if(now!==pin.tier){res.types.pinnedKept++;log('mapping',`ACFTREF ${r.code} ${r.mfr} ${r.model} changed — would now map to ${now}; tier kept at ${pin.tier} (pinned). Admin can re-map.`)}}
    if(before)log('type-change',`ACFTREF ${r.code} changed: `+['model','typeEng','typeAcft','noEng','seats','wclass','cert'].filter(k=>String(before[k])!==String(r[k])).map(k=>`${k} ${before[k]}→${r[k]}`).join(', '))});
  (A.removed||[]).forEach(code=>{keepUndo('types',code);F.overlay.types[code]=null;res.types.removed++});
  const Mx=d.master||{};const fleetByTail=new Map(s.aircraft.map(a=>[a.tail.toUpperCase(),a]));
  (Mx.changed||[]).forEach(x=>{const r=masterRec(x);keepUndo('master',r.n);F.overlay.master[r.n]=r;res.master.changed++;
    const a=fleetByTail.get(r.n);if(!a)return;const diff=regDiff(a,r);if(!diff.length)return;
    const flags=[];const cur=a.reg||{};
    if(cur.serial&&r.serial&&cur.serial!==r.serial)flags.push('N-number reassigned to a different airframe (serial changed) — verify you still operate this aircraft');
    if(diff.some(z=>z.k==='ownerHash'||z.k==='registrantType')||(diff.some(z=>z.k==='certIssue')&&cur.ownerHash!==r.ownerHash))flags.push('Ownership change on the FAA record');
    if(diff.some(z=>z.k==='code'))flags.push('Model code changed — pricing tier and inspection template stay as configured until you change them');
    if(diff.some(z=>z.k==='status'))flags.push('Registration status changed');
    const exp=r.expiration&&VA.daysBetween(todayISO(),r.expiration);if(exp!=null&&exp<=90)flags.push(exp<0?'Registration EXPIRED':'Registration expires in '+exp+' days');
    const rv={id:uid('rv'),kind:'registry',ac:a.id,tail:a.tail,title:`FAA registry change — ${a.tail}`,fields:diff,flags,newRec:r,status:'open',version:d.version,simulated:!!d.simulated,created:new Date().toISOString()};
    f.reviews.unshift(rv);res.reviews.push(rv.id);const it=regItem(a,{expiration:r.expiration,version:d.version});if(it)res.items.push(it.id)});
  (Mx.removed||[]).forEach(x=>{const n='N'+String(x['N-NUMBER']||x.n).replace(/^N/,'').trim();keepUndo('master',n);F.overlay.master[n]={deregistered:true,n,serial:x['SERIAL NUMBER']||'',reason:x.reason||'Deregistered',date:ymd(x['CANCEL DATE']||'')||todayISO()};res.master.removed++;
    const a=fleetByTail.get(n);if(!a)return;
    const rv={id:uid('rv'),kind:'registry',ac:a.id,tail:a.tail,title:`FAA registry — ${a.tail} DEREGISTERED`,fields:[{k:'status',label:'Registration status',old:(a.reg||{}).status||'V',new:'Deregistered — '+(x.reason||'')}],flags:['Deregistered on the FAA registry — aircraft may not be operated until re-registered (14 CFR 91.203)'],newRec:{deregistered:true,reason:x.reason},status:'open',version:d.version,simulated:!!d.simulated,created:new Date().toISOString()};
    f.reviews.unshift(rv);res.reviews.push(rv.id);const it=regItem(a,{deregistered:true,date:F.overlay.master[n].date,version:d.version});res.items.push(it.id)});
  if(d.ads&&d.ads.length){const r2=F.applyADs(d.ads,{version:d.version,simulated:!!d.simulated});res.ads=r2;res.reviews.push(...r2.reviews)}
  const h={version:d.version,prevVersion:f.version,zipSha256:d.zipSha256||null,at:new Date().toISOString(),source:opts.source||d.source||'delta file',simulated:!!d.simulated,counts:{types:res.types,master:res.master,unmapped:res.unmapped,ads:res.ads.matched||0},undo,reviews:res.reviews,items:[...res.items,...(res.ads.items||[])]};
  f.history.unshift(h);f.version=d.version;f.zipSha256=d.zipSha256||f.zipSha256;f.lastSync=new Date().toISOString();
  log('update',`Applied FAA ${d.simulated?'SIMULATED ':''}update ${d.version} (${opts.source||d.source||'delta file'}): types +${res.types.added} ~${res.types.changed} −${res.types.removed}; registrations ~${res.master.changed} −${res.master.removed}; ${res.reviews.length} review(s); ${res.unmapped} unmapped type(s); ${res.ads.matched||0} AD applicability item(s).`);
  if(VA.types.lib)applyTypesOverlay(VA.types.lib);await saveOverlay();VA.dirty&&VA.dirty();VA.save();
  res.ms=performance.now()-t0;F.lastApply=res;return res;
};
/* rollback the most recent update: restore overlay records, remove still-open reviews/items it created */
F.rollback=async function(){const f=F.st();const h=f.history.shift();if(!h)return null;const s=S();
  for(const b of ['types','master'])for(const [k,v] of Object.entries(h.undo[b]||{})){if(v===undefined)delete F.overlay[b][k];else F.overlay[b][k]=v}
  const openIds=new Set(f.reviews.filter(r=>h.reviews.includes(r.id)&&r.status==='open').map(r=>r.id));f.reviews=f.reviews.filter(r=>!openIds.has(r.id));
  const kept=f.reviews.filter(r=>h.reviews.includes(r.id)).length;
  s.items=s.items.filter(i=>!(h.items.includes(i.id)&&!i.lastDate&&!i.verified));f.unmapped=f.unmapped.filter(u=>!(u.version===h.version&&u.status==='pending'));
  f.version=h.prevVersion;VA.types.lib&&(VA.types.lib=null);await saveOverlay();VA.dirty&&VA.dirty();
  log('rollback',`Rolled back FAA update ${h.version} → ${h.prevVersion}. ${openIds.size} open review(s) removed${kept?`, ${kept} already-decided review(s) kept for audit`:''}.`);VA.save();return h};

/* review decisions — accept copies FAA-sourced fields into the registry snapshot only (never user-entered fields) */
F.decide=function(id,accept){const f=F.st();const rv=f.reviews.find(r=>r.id===id);if(!rv||rv.status!=='open')return null;
  rv.status=accept?'accepted':'ignored';rv.decidedAt=new Date().toISOString();rv.decidedBy=S().role;
  if(accept&&rv.kind==='registry'){const a=VA.ac(rv.ac);const before={...(a.reg||{})};
    if(rv.newRec.deregistered)a.reg={...(a.reg||{}),status:'Deregistered',deregReason:rv.newRec.reason};
    else{a.reg={...(a.reg||{})};REG_FIELDS.forEach(([k])=>{if(rv.newRec[k]!=null&&rv.newRec[k]!=='')a.reg[k]=rv.newRec[k]});a.reg.src='FAA registry '+rv.version+(rv.simulated?' (SIMULATED)':'');
      if(rv.newRec.code&&a.faa&&a.faa.code!==rv.newRec.code){a.faa={...a.faa,prevCode:a.faa.code,code:rv.newRec.code}}}
    rv.before=before}
  log('review',`${accept?'Accepted':'Ignored'}: ${rv.title}`,{review:id});VA.save();return rv};
F.mapType=function(code,tier){const f=F.st();const u=f.unmapped.find(x=>x.code===code);f.tierMap[code]={tier,by:'admin review',at:todayISO()};if(u){u.status='mapped';u.tier=tier}log('mapping',`Mapped ACFTREF ${code}${u?' '+u.mfr+' '+u.model:''} → ${tier}`);VA.save()};
F.openReviews=()=>F.st().reviews.filter(r=>r.status==='open');

/* ---- AD applicability (FAA DRS / Federal Register feed; prototype uses the SIMULATED entries in the delta) ---- */
const num=s=>{const m=String(s||'').match(/(\d+)/);return m?+m[1]:null};
F.matchAD=function(ad,a){const ap=ad.applicability||{};const why=[];const mfr=((a.faa&&a.faa.mfr)||'')+' '+a.model;const model=((a.faa&&a.faa.model)||'')+' '+a.model;
  let hit=false;
  if(ap.make&&new RegExp(ap.make,'i').test(mfr)&&(!ap.models||ap.models.some(m=>model.toUpperCase().includes(m.toUpperCase())))){hit=true;why.push('airframe '+(ap.models||[ap.make]).join('/'))}
  if(ap.engines&&ap.engines.some(e=>(a.engines||'').toUpperCase().includes(e.toUpperCase()))){hit=true;why.push('engine '+ap.engines.join('/'))}
  if(ap.props&&ap.props.some(p=>(a.props||'').toUpperCase().includes(p.toUpperCase()))){hit=true;why.push('propeller '+ap.props.join('/'))}
  if(ap.appliances){const av=(S().avionics||[]).filter(x=>x.ac===a.id).map(x=>x.kind).join(' ');if(ap.appliances.some(p=>av.toUpperCase().includes(p.toUpperCase()))){hit=true;why.push('appliance '+ap.appliances.join('/'))}}
  if(!hit)return null;
  if(ap.serialFrom||ap.serialTo){const sn=num((a.reg||{}).serial);if(sn==null)why.push('serial unknown — IA to verify serial applicability');else if((ap.serialFrom&&sn<ap.serialFrom)||(ap.serialTo&&sn>ap.serialTo))return null;else why.push(`serial ${(a.reg||{}).serial} in ${ap.serialFrom||''}–${ap.serialTo||''}`)}
  return why};
F.applyADs=function(ads,ctx={}){const s=S();const f=F.st();const out={matched:0,items:[],reviews:[]};
  ads.forEach(ad=>s.aircraft.forEach(a=>{const why=F.matchAD(ad,a);if(!why)return;const id='adrev_'+ad.an.replace(/\W/g,'')+'_'+a.id;if(s.items.some(i=>i.id===id))return;
    const label={new:'New AD applicability — review',revised:'Revised AD applicability — review',superseded:'Superseding AD — review'}[ad.status]||'New AD applicability — review';
    s.items.push({id,ac:a.id,cat:'AD',name:`${label}: AD ${ad.an}`,ref:`${ad.subject}${ad.supersedes?' · supersedes '+ad.supersedes:''} · eff. ${ad.effective}${ad.simulated||ctx.simulated?' · SIMULATED':''}`,
      targetDate:ad.effective,soonDays:36500,required:false,verified:null,lastDate:null,adReview:{an:ad.an,status:ad.status,supersedes:ad.supersedes||null,why,url:ad.url||null},src:'ad-feed'});
    const rv={id:uid('rv'),kind:'ad',ac:a.id,tail:a.tail,title:`${label}: AD ${ad.an} — ${a.tail}`,fields:[{k:'an',label:'AD',old:ad.supersedes||'—',new:ad.an},{k:'subject',label:'Subject',old:'',new:ad.subject},{k:'why',label:'Matched on',old:'',new:why.join('; ')},{k:'eff',label:'Effective',old:'',new:ad.effective}],
      flags:['IA must determine applicability & method of compliance — compliance is never auto-marked'],status:'open',version:ctx.version,simulated:!!(ad.simulated||ctx.simulated),created:new Date().toISOString()};
    f.reviews.unshift(rv);out.reviews.push(rv.id);out.items.push(id);out.matched++}));
  f.adSync=new Date().toISOString();VA.dirty&&VA.dirty();return out};

/* ---- live check (graceful CORS handling) ---- */
F.checkOnline=async function(){const f=F.st();f.lastCheck=new Date().toISOString();VA.save();
  if(!navigator.onLine)return {ok:false,offline:true,msg:'You are offline. The FAA registry check runs when you are online; production syncs server-side nightly.'};
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),10000);
  try{const r=await fetch(F.LIVE_URL,{method:'GET',mode:'cors',signal:ctl.signal,cache:'no-store'});clearTimeout(to);
    if(!r.ok)return {ok:false,msg:`FAA registry responded ${r.status}. Try again later — production retries server-side.`};
    const buf=new Uint8Array(await r.arrayBuffer());return await F.applyZip(buf,'live download');}
  catch(e){clearTimeout(to);return {ok:false,blocked:true,msg:'The browser blocked the download from registry.faa.gov (no cross-origin access / CORS'+(e.name==='AbortError'?', or timeout':'')+'). That is expected for a web app: in production a nightly server job downloads ReleasableAircraft.zip, diffs it and pushes changes to every client. In this prototype you can load a delta file, a ReleasableAircraft.zip you downloaded yourself, or the SIMULATED sample update.'}}};
/* build a delta from a full ReleasableAircraft.zip: full ACFTREF diff + MASTER/DEREG rows for fleet tails only */
F.applyZip=async function(buf,source){const t0=performance.now();
  let sha=null;try{const h=await crypto.subtle.digest('SHA-256',buf);sha=[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}catch(e){}
  if(sha&&sha===F.st().zipSha256)return {ok:true,noChange:true,msg:'Already up to date (same file hash as the stored version).'};
  const files=fflate.unzipSync(buf,{filter:x=>/^(ACFTREF|MASTER|DEREG)\.txt$/i.test(x.name)});const dec=new TextDecoder('latin1');
  const csv=name=>{const k=Object.keys(files).find(x=>x.toUpperCase()===name);if(!k)return [];const L=dec.decode(files[k]).split(/\r?\n/);const h=L[0].replace(/^\uFEFF|^ï»¿/,'').split(',').map(x=>x.trim());
    return L.slice(1).filter(Boolean).map(l=>{const p=l.split(',');const o={};h.forEach((c,i)=>o[c]=(p[i]||'').trim());return o})};
  await VA.types.load();const lib=VA.types.lib;const A=csv('ACFTREF.TXT');const seen=new Set();const added=[],changed=[];
  A.forEach(x=>{const r=typeRec(x);seen.add(r.code);const o=lib.byCode.get(r.code);if(!o)added.push(x);else if(['mfr','model','typeAcft','typeEng','noEng','seats','wclass','cert'].some(k=>String(o[k])!==String(r[k])))changed.push(x)});
  const removed=A.length?lib.list.filter(r=>!seen.has(r.code)).map(r=>r.code):[];
  const tails=new Set(S().aircraft.map(a=>a.tail.toUpperCase().replace(/^N/,'')));
  const mChanged=csv('MASTER.TXT').filter(x=>tails.has(String(x['N-NUMBER']).trim())).map(x=>{const o={...x};['NAME','STREET','STREET2','CITY','STATE','ZIP CODE','OTHER NAMES(1)','OTHER NAMES(2)','OTHER NAMES(3)','OTHER NAMES(4)','OTHER NAMES(5)'].forEach(k=>delete o[k]);return o});
  const present=new Set(mChanged.map(x=>String(x['N-NUMBER']).trim()));
  const mRemoved=csv('DEREG.TXT').filter(x=>tails.has(String(x['N-NUMBER']).trim())&&!present.has(String(x['N-NUMBER']).trim())).map(x=>({'N-NUMBER':x['N-NUMBER'],'SERIAL NUMBER':x['SERIAL NUMBER'],'CANCEL DATE':x['CANCEL DATE'],reason:'Deregistered (FAA DEREG file)'}));
  const version=VA.isoOf(new Date());
  const res=await F.applyDelta({format:'valkyr-faa-delta/1',version,zipSha256:sha,source,acftref:{added,changed,removed},master:{changed:mChanged,removed:mRemoved}},{source});
  return {ok:true,res,ms:performance.now()-t0,msg:`Applied ${source}: ${added.length} new / ${changed.length} changed / ${removed.length} removed types; ${mChanged.length} fleet registration record(s) compared.`}};
F.loadFile=async function(file){if(/\.zip$/i.test(file.name))return F.applyZip(new Uint8Array(await file.arrayBuffer()),file.name);
  const d=JSON.parse(await file.text());const res=await F.applyDelta(d,{source:file.name});return {ok:!res.skipped,res,msg:res.skipped?res.reason:`Applied ${d.simulated?'SIMULATED ':''}update ${d.version} from ${file.name}.`}};
})();
