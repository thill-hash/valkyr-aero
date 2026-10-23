/* Valkyr Aero — aircraft type library from the real FAA Aircraft Registry (ACFTREF / ENGINE / MASTER).
   Data files in ./data are loaded lazily with <script> tags (works from file://). Owner data is not bundled. */
(function(){
const T=VA.types={lib:null};
const loadScript=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src));document.head.appendChild(s)});
const TYPE_ACFT={1:'Glider',2:'Balloon',3:'Blimp/dirigible',4:'Fixed wing single-engine',5:'Fixed wing multi-engine',6:'Rotorcraft',7:'Weight-shift control',8:'Powered parachute',9:'Gyroplane',H:'Hybrid lift',O:'Other'};
const TYPE_ENG={0:'None',1:'Reciprocating',2:'Turbo-prop',3:'Turbo-shaft',4:'Turbo-jet',5:'Turbo-fan',6:'Ramjet',7:'2-cycle',8:'4-cycle',9:'Unknown',10:'Electric',11:'Rotary'};
const CERT={0:'Type certificated',1:'Not type certificated (e.g. experimental)',2:'Light sport'};
T.TYPE_ACFT=TYPE_ACFT;T.TYPE_ENG=TYPE_ENG;
T.load=async function(){
  if(T.lib)return T.lib;const t0=performance.now();
  if(!window.FAA_TYPES)await loadScript('data/faa-types.js');
  const F=window.FAA_TYPES;const rows=F.rows.split('\n'),list=new Array(rows.length);const byCode=new Map();
  for(let i=0;i<rows.length;i++){const p=rows[i].split('|');const r={code:p[0],mfr:F.mfrs[+p[1]],model:p[2],typeAcft:p[3],typeEng:p[4].trim(),noEng:+p[5],seats:+p[6],wclass:+p[7]||0,cert:p[8],speed:+p[9]};
    r.key=(r.mfr+' '+r.model).toLowerCase();list[i]=r;byCode.set(r.code,r)}
  const eng=new Map();F.engines.split('\n').forEach(l=>{const p=l.split('|');eng.set(p[0],{code:p[0],mfr:p[1],model:p[2],type:p[3].trim(),hp:+p[4],thrust:+p[5]})});
  // popularity: how many registered aircraft use each type code (from nothing at load; filled by master shards when loaded)
  T.lib={built:F.built,list,byCode,eng,ms:performance.now()-t0};return T.lib;
};
/* typeahead: all tokens must match; ranks type-certificated & well-known OEMs first */
const OEM=/^(CESSNA|TEXTRON|PIPER|BEECH|HAWKER BEECH|RAYTHEON|CIRRUS|DIAMOND|MOONEY|SLING|PILATUS|DAHER|SOCATA|EMBRAER|HONDA|BOMBARDIER|LEARJET|CANADAIR|GULFSTREAM|DASSAULT|ROBINSON|BELL|AIRBUS|EUROCOPTER|VANS|ICON|TECNAM|EXTRA|AMERICAN CHAMPION|MAULE|GRUMMAN|COMMANDER|EPIC|QUEST|KODIAK|SIKORSKY|LEONARDO|AGUSTA|MD HELICOPTERS)/;
T.search=function(q,limit=20){
  const lib=T.lib;if(!lib||!q.trim())return [];
  const toks=q.toLowerCase().replace(/[-]/g,' ').split(/\s+/).filter(Boolean);const out=[];
  for(const r of lib.list){const k=r.key.replace(/-/g,' ');let ok=true;for(const t of toks){if(!k.includes(t)){ok=false;break}}if(ok)out.push(r)}
  const score=r=>(r.cert==='0'?0:10)+(OEM.test(r.mfr)?0:5)+(r.model.length/40);
  out.sort((a,b)=>score(a)-score(b)||a.key.localeCompare(b.key));
  return out.slice(0,limit);
};
/* ---- type → category / pricing tier ---- */
/* Known warbird / ex-military types (jets, turbines, piston fighters & bombers). Word-boundary matches on make + model. */
const WARBIRD=/(\bL-?(29|39|59)\b|\bL-?39[A-Z]{1,3}\b|ALBATROS|DELFIN|\bT-33[A-Z]?\b|SILVER STAR|\bMIG[- ]?\d|MIKOYAN|\bF-86|SABRE MK|\bHUNTER MK|VAMPIRE|JET PROVOST|STRIKEMASTER|MAGISTER|\bCM-?170|BUCKEYE|\bT-37[A-C]?\b|\bA-37[A-B]?\b|\bTS-11|ISKRA|\bP-51|\bP-38|\bP-40|\bP-47|\bF4U|CORSAIR|\bF6F|HELLCAT|SPITFIRE|\bB-25|\bA-26|INVADER|\bB-17|\bB-24|NORTH AMERICAN.*\bT-28|\bT-28[A-D]\b)/;
const HEAVY_TWIN=/(BARON|\bG?58|\b[A-E]?55\b|\b55\b|NAVAJO|CHIEFTAIN|PA-31|\b310|\b320|\b340|\b402|\b404|\b411|\b414|\b421|AEROSTAR|DUKE|QUEEN AIR|60\b|COMMANDER 500|COMMANDER 680|AEROSTAR)/;
/* FAA MASTER CERTIFICATION field (ardata.pdf): 1st char = airworthiness class (1 Standard, 2 Limited, 3 Restricted, 4 Experimental,
   5 Provisional, 6 Multiple, 7 Primary, 8 Special Flight Permit, 9 Light Sport); experimental op codes 0..7, 8A/8B/8C (light-sport), 9A–9E (unmanned). */
const AW_CLASS={1:'Standard',2:'Limited',3:'Restricted',4:'Experimental',5:'Provisional',6:'Multiple',7:'Primary',8:'Special Flight Permit',9:'Light Sport'};
const EXP_OPS={'0':'Show compliance with FAR','1':'Research & development','2':'Amateur-built','3':'Exhibition','4':'Racing','5':'Crew training','6':'Market survey','7':'Operating kit-built','8A':'Light-sport reg. prior to 01/31/08','8B':'Operating light-sport kit-built','8C':'Operating light-sport previously issued under 21.190','9A':'Unmanned — R&D','9B':'Unmanned — market survey','9C':'Unmanned — crew training','9D':'Unmanned — exhibition','9E':'Unmanned — compliance'};
T.decodeCert=function(c){c=(c||'').trim();if(!c)return null;const cls=c[0];const out={code:c,cls,className:AW_CLASS[cls]||'Unknown',ops:[]};
  if(cls==='4'){const rest=c.slice(1);for(let i=0;i<rest.length;i++){const two=rest.slice(i,i+2);if(EXP_OPS[two]){out.ops.push(EXP_OPS[two]);i++}else if(EXP_OPS[rest[i]])out.ops.push(EXP_OPS[rest[i]])}}
  out.experimental=cls==='4';out.limited=cls==='2';out.expLSA=cls==='4'&&/8[ABC]/.test(c);out.amateur=cls==='4'&&/2|7/.test(c.slice(1).replace(/8[ABC]|9[A-E]/g,''));return out};
T.classify=function(r,reg){
  const te=r.typeEng,ta=r.typeAcft,flags=[];let tier,kind,program;
  const turbine=['2','3','4','5','6'].includes(te);kind=turbine?'turbine':te==='10'?'electric':'piston';
  if(ta==='6'){tier=turbine?'turbineheli':'pistonheli'}
  else if(ta==='9'||ta==='1'||ta==='2'){tier='single'} // gyroplanes, gliders, balloons: Single tier $29 (confirmed by Trevor)
  else if(te==='4'||te==='5'){tier=r.wclass>=3?'heavyjet':'lightjet';if(r.wclass===2)flags.push('Weight class 2 (12,500–19,999 lb) jet mapped to Light jets — verify')}
  else if(te==='2'||te==='3')tier='turboprop';
  else if(r.noEng>=2||ta==='5'){tier=(HEAVY_TWIN.test(r.model)||r.seats>=8)?'heavytwin':'lighttwin';flags.push('Piston twin split light/heavy by model name & seats (heuristic)')}
  else{tier='single';if(['7','8','O'].includes(ta)||te==='10')flags.push('Non-standard category ('+(TYPE_ACFT[ta]||ta)+') mapped to Single tier — confirm')}
  // Experimental & warbirds — $29 flat (confirmed by Trevor): every experimental purpose (MASTER class 4), Limited category (class 2),
  // types that were never type-certificated (ACFTREF BUILD-CERT-IND 1), and known warbird types incl. jets/turbines. Overrides jet/turboprop/twin tiers.
  const cert=reg&&T.decodeCert(reg.certification);const notes=[];const wb=WARBIRD.test(r.mfr+' '+r.model);
  if(cert&&(cert.experimental||cert.limited)){tier='experimental';flags.length=0;notes.push('Registered '+cert.className+(cert.ops.length?' ('+cert.ops.join(', ')+')':'')+(wb?' · warbird':'')+' → Experimental & warbirds, $29 flat')}
  else if(wb&&!(cert&&cert.cls==='3')){tier='experimental';flags.length=0;notes.push('Warbird type → Experimental & warbirds, $29 flat')}
  else if(!cert&&r.cert==='1'){tier='experimental';flags.length=0;notes.push('Not type-certificated (FAA BUILD-CERT-IND 1) → Experimental & warbirds, $29 flat')}
  else if(cert&&cert.cls==='3')flags.push('Restricted category (FAA class 3, e.g. ag / firefighting / external load) — not covered by the warbird rule; priced by aircraft class — confirm with Trevor');
  else if(cert&&cert.cls==='9')notes.push('Special light-sport (S-LSA) — not experimental; priced by aircraft class');
  if(tier==='experimental')notes.push('Inspection: condition inspection per the aircraft operating limitations — IA customizes the template');
  if(r.cert==='2')flags.push('Light-sport — condition inspection per operating limitations');
  return {tier,kind,flags,notes,warbird:wb,program:T.program(r,tier,kind)};
};
/* ---- inspection programs (only sourced intervals; everything else generic for the IA to customize) ---- */
T.CAL=[ // real FAR calendar items
  {cat:'Calendar',name:'ELT inspection',ref:'14 CFR 91.207(d) — every 12 calendar months',intMo:12},
  {cat:'Calendar',name:'ELT battery replacement',ref:'14 CFR 91.207(c) — 50% of useful life or 1 h cumulative use; set to battery expiry',intMo:null,note:'Enter battery expiration date'},
  {cat:'Calendar',name:'Transponder test',ref:'14 CFR 91.413 — 24 calendar months',intMo:24},
  {cat:'Calendar',name:'Altimeter / static system test (IFR)',ref:'14 CFR 91.411 — 24 calendar months',intMo:24},
  {cat:'Calendar',name:'VOR check (IFR)',ref:'14 CFR 91.171 — within preceding 30 days',intMo:1,required:false},
  {cat:'Calendar',name:'Aircraft registration renewal',ref:'14 CFR 47.40 — registration expires 7 years after issue',intMo:84}
];
T.program=function(r,tier,kind){
  const items=[];const m=(r.mfr+' '+r.model).toUpperCase();
  const cond=tier==='experimental'||r.cert==='1'||r.cert==='2';
  if(kind==='piston'&&!cond){items.push({cat:'Inspection',name:'Annual inspection',ref:'14 CFR 91.409(a) — 12 calendar months',intMo:12},{cat:'Inspection',name:'100-hour inspection (if carrying persons for hire / flight instruction)',ref:'14 CFR 91.409(b)',intHrs:100,required:false})}
  else if(cond)items.push({cat:'Inspection',name:'Condition inspection',ref:'Per aircraft operating limitations — 12 calendar months',intMo:12});
  else if(/BEECH|TEXTRON|HAWKER|RAYTHEON/.test(m)&&/\b(B?200|B?300|C90|E90|F90|350|250)/.test(r.model))items.push({cat:'Inspection',name:'Phase inspection (King Air 4-phase program)',ref:'Beechcraft phase inspection program — confirm intervals in the current maintenance manual',intHrs:200,intMo:12,needsIA:true});
  else items.push({cat:'Inspection',name:'Inspection program (14 CFR 91.409(e)/(f) — choose: manufacturer progressive, CAMP or approved program)',ref:'Generic — IA/DOM selects and customizes the program',intHrs:null,intMo:12,needsIA:true});
  return items.concat(T.CAL);
};
/* ---- typical avionics suites (assumptions to pre-select the SD-card parser; user confirms) ---- */
T.avionicsGuess=function(r,year){
  const m=(r.mfr+' '+r.model).toUpperCase();const y=+year||0;
  if(/CIRRUS/.test(m)&&/SR2[02]/.test(m))return y>=2017?{suite:'Cirrus Perspective+ (Garmin)',parser:'garmin-g1000',confidence:'typical'}:y>=2008?{suite:'Cirrus Perspective (Garmin G1000-based)',parser:'garmin-g1000',confidence:'typical'}:{suite:'Avidyne Entegra (likely)',parser:'avidyne-r9',confidence:'uncertain'};
  if(/CESSNA|TEXTRON/.test(m)&&/\b(172S|182T|T182T|206H|T206H)\b/.test(r.model)&&y>=2005)return {suite:'Garmin G1000 / G1000 NXi',parser:'garmin-g1000',confidence:'typical'};
  if(/DIAMOND/.test(m)&&/DA 4[02]/.test(r.model)&&y>=2005)return {suite:'Garmin G1000',parser:'garmin-g1000',confidence:'typical'};
  if(/PILATUS/.test(m)&&/PC-12\/47E/.test(r.model))return {suite:'Honeywell Primus Apex',parser:'oem-tool',confidence:'typical'};
  if(/EMBRAER/.test(m)&&/EMB-50[05]/.test(r.model))return {suite:'Garmin Prodigy (G1000/G3000-based)',parser:'garmin-g1000',confidence:'typical'};
  if(/HONDA/.test(m))return {suite:'Garmin G3000',parser:'garmin-g1000',confidence:'typical'};
  if(/VANS|SLING/.test(m))return {suite:'Garmin G3X Touch or Dynon SkyView (varies)',parser:'garmin-g3x',confidence:'uncertain'};
  return {suite:'Unknown — choose on the Integrations screen',parser:null,confidence:'none'};
};
/* ---- N-number lookup in bundled MASTER shards (lazy, one ~2.5 MB shard per leading digit) ---- */
const shardMaps={};
T.lookupN=async function(n){
  n=String(n||'').toUpperCase().replace(/^N/,'').trim();if(!/^[1-9][0-9A-Z]{0,4}$/.test(n))return {error:'Enter a US N-number like N172SP'};
  const k=n[0];
  if(!shardMaps[k]){if(!(window.FAA_MASTER&&window.FAA_MASTER[k]))await loadScript(`data/faa-master-${k}.js`);const m=new Map();window.FAA_MASTER[k].split('\n').forEach(l=>{const i=l.indexOf('|');m.set(l.slice(0,i),l)});shardMaps[k]=m;delete window.FAA_MASTER[k]}
  const line=shardMaps[k].get(n);if(!line)return {notFound:true,n:'N'+n};
  const p=line.split('|');await T.load();
  const type=T.lib.byCode.get(p[2])||null,eng=T.lib.eng.get(p[3])||null;
  return {n:'N'+p[0],serial:p[1],code:p[2],engCode:p[3],year:p[4],status:p[5],certIssue:p[6],airworthDate:p[7],expiration:p[8],registrantType:p[9],modeSHex:p[10],certification:p[11]||'',cert:T.decodeCert(p[11]),type,eng};
};
T.fmtYMD=s=>s&&s.length===8?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:'';
})();
