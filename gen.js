/* Valkyr360 — DEMO data generators: flight history, engine summaries, expenses, budgets, large dataset.
   Everything produced here is fictitious and tagged demo:true. */
(function(){
const {todayISO,addDays,addMonths,uid,h1}=VA;
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
VA.rng=rng;
const AIRPORTS=['KBNA','KMQY','KJWN','KCKV','KHSV','KMEM','KCHA','KTYS','KPDK','KSTL','KASE','KTEB','KAPF','KDAL','KSDL','KHOU','KMSY','KSRQ','KBWI','KCLT'];
VA.AIRPORTS=AIRPORTS;
const r2=n=>Math.round(n*100)/100, r1=n=>Math.round(n*10)/10;
VA.isTurbine=a=>a.kind?a.kind==='turbine':['turboprop','lightjet','heavyjet','turbineheli'].includes(a.cls);

/* engine summary for one flight (per-flight max/min/avg — what a trend chart needs) */
VA.engSummary=function(a,R,drift=0){
  if(VA.isTurbine(a))return {itt:Math.round(700+R()*55+drift),ng:r1(96+R()*4),tq:Math.round((a.tqMax||2230)*(.82+R()*.12)),oilT:Math.round(68+R()*18),oilP:Math.round(105+R()*20),ff:Math.round(a.gph*(.92+R()*.16))};
  return {cht:Math.round(372+R()*38+drift),egt:Math.round(1340+R()*90),oilT:Math.round(182+R()*26),oilP:Math.round(52+R()*16),ff:r1(a.gph*(.9+R()*.2))};
};
VA.fuelExpense=function(a,f,src='flight'){
  const gal=Math.round(f.hrs*a.gph*10)/10,price=a.fuelPrice;
  return {id:uid('x'),ac:a.id,date:f.date,cat:'fuel',vendor:(f.to&&f.to!=='KM02'?f.to:'KM02')+' FBO (demo)',desc:`${a.fuel} uplift · ${f.from||''}→${f.to||''}`,qty:gal,unit:'gal',unitPrice:price,amount:r2(gal*price),receipt:'',paidBy:'Company card',notes:'Auto-created from logged flight',src,ref:f.id};
};

/* flight history between two dates */
VA.genFlights=function(a,from,to,annualHrs,legHrs,R,pilots,engineFrom){
  const out=[];let d=from;const perDay=annualHrs/legHrs/365;
  while(d<=to){
    if(R()<perDay*0.55){ // a trip day: out-and-back (2 legs), sometimes 3-4
      const legs=R()<.75?2:R()<.6?3:4;let at='KM02';
      for(let i=0;i<legs;i++){const dest=i===legs-1?'KM02':AIRPORTS[Math.floor(R()*AIRPORTS.length)];
        const hrs=Math.max(.3,r1(legHrs*(.5+R())));const p=pilots[Math.floor(R()*pilots.length)];
        const e={id:'l_'+a.id+'_'+d.replace(/-/g,'')+'_'+i+'_'+Math.floor(R()*1e6).toString(36),ac:a.id,date:d,type:'Flight',hrs,from:at,to:dest,pilot:p.id,src:R()<.6?'ForeFlight':R()<.5?'Garmin Pilot':'Manual',demo:true};
        e.text=`${e.from} → ${e.to} · ${h1(hrs)} h · ${p.name}${e.src!=='Manual'?' · auto-imported from '+e.src:''}`;e.by=p.name;
        if(engineFrom&&d>=engineFrom)e.eng=VA.engSummary(a,R,a.chtDrift&&d>addDays(to,-40)?a.chtDrift*(1-VA.daysBetween(d,to)/40):0);
        out.push(e);at=dest}
    }
    d=addDays(d,1);
  }
  return out;
};

/* expenses: flights → fuel/fees/catering/travel; months → fixed; maintenance spread */
VA.genExpenses=function(a,flights,from,to,R){
  const X=[],add=(date,cat,vendor,desc,amount,extra={})=>X.push({id:uid('x'),ac:a.id,date,cat,vendor,desc,qty:extra.qty??1,unit:extra.unit??'ea',unitPrice:extra.unitPrice??r2(amount),amount:r2(amount),receipt:R()<.8?`receipt-${date}-${Math.floor(R()*9999)}.pdf (simulated)`:'',paidBy:extra.paidBy||(R()<.7?'Company card':'ACH'),notes:extra.notes||'',src:'seed',demo:true});
  const turb=VA.isTurbine(a);
  flights.forEach(f=>{
    const fx=VA.fuelExpense(a,f,'seed');fx.demo=true;fx.receipt='fuel-ticket (simulated)';X.push(fx);
    if(f.to!=='KM02')add(f.date,'fees',f.to+' FBO (demo)','Landing / ramp / handling',turb?60+R()*240:15+R()*60);
    if(turb&&f.to!=='KM02'&&R()<.35)add(f.date,'catering','Skyline Catering (demo)','Passenger catering',120+R()*380);
    if(turb&&f.to!=='KM02'&&R()<.25)add(f.date,'travel','Crew hotel (demo)','Crew hotel & per diem',180+R()*420);
  });
  const fa=a.fixedAnnual||{};
  const monthly={hangar:fa['Hangar (KM02)']||0,avionics:fa['Nav data & subscriptions']||0,mgmt:fa['Management & admin']||0,crew:a.crewAnnual||0,finance:(a.leaseMonthly||0)*12,depr:(a.deprMonthly||0)*12};
  let m=from.slice(0,8)+'01';
  const vend={hangar:'Dickson Co. Airport Authority (demo)',avionics:'Nav data subscriptions (demo)',mgmt:'Valkyr Ops Mgmt (demo)',crew:'Payroll (demo)',finance:'Demo Aircraft Finance Co.',depr:'Book depreciation (non-cash)'};
  const desc={hangar:'Hangar rent',avionics:'Nav databases, charts & datalink',mgmt:'Management fee',crew:'Pilot salaries & contract pilots',finance:'Lease payment',depr:'Monthly depreciation'};
  let i=0;
  while(m<=to){
    const d1=m;
    Object.entries(monthly).forEach(([k,v])=>{if(v>0&&d1>=from)add(d1,k,vend[k],desc[k],v/12,{paidBy:k==='depr'?'n/a (non-cash)':'ACH'})});
    if(fa['Insurance']&&d1>=from)add(d1,'insurance','Demo Aviation Underwriters','Hull & liability premium (monthly)',fa['Insurance']/12,{paidBy:'ACH'});
    const reserveHr=turb?(a.reserveHr||180):(a.reserveHr||25);
    const mh=flights.filter(f=>f.date.slice(0,7)===d1.slice(0,7)).reduce((t,f)=>t+f.hrs,0);
    if(mh&&d1>=from)add(addDays(d1,27),'reserves','Engine/prop reserve fund (demo)',`Reserve accrual ${h1(mh)} h × $${reserveHr}/h`,mh*reserveHr,{qty:r1(mh),unit:'h',unitPrice:reserveHr});
    if(i%4===1)add(addDays(d1,9+Math.floor(R()*10)),'mx_unsched','Prentice Aviation Services (demo)','Squawk repair — labor',(turb?900:250)+R()*(turb?3200:900),{qty:r1(3+R()*12),unit:'labor h',unitPrice:125});
    if(i%3===2)add(addDays(d1,4+Math.floor(R()*14)),'parts','Aircraft Spruce (demo)','Parts & consumables',(turb?400:120)+R()*(turb?2600:600));
    if(i%6===3)add(addDays(d1,12),'mx_sched','Prentice Aviation Services (demo)',turb?'Phase / progressive inspection':'Oil change & 50-h check',turb?18000+R()*16000:600+R()*500);
    if(i%12===5)add(addDays(d1,15),'mx_sched','Prentice Aviation Services (demo)',turb?'Annual-equivalent inspection':'Annual inspection',turb?24000+R()*12000:4800+R()*1800);
    if(i%12===7&&fa['Pilot training (recurrent)'])add(addDays(d1,6),'training','Demo Sim Center','Recurrent training',fa['Pilot training (recurrent)']);
    if(i%12===8)add(addDays(d1,2),'taxes','Tennessee DOR / FAA (demo)','Registration & property tax',turb?2400+R()*3000:350+R()*300,{paidBy:'Check'});
    if(R()<.15)add(addDays(d1,20),'other','Misc (demo)','Cleaning / detailing',150+R()*350);
    m=addMonths(d1,1);i++;
  }
  return X.filter(x=>x.date>=from&&x.date<=to);
};
VA.genBudgets=function(expenses,R){
  const by={};const cut=addDays(todayISO(),-365);
  expenses.forEach(x=>{if(x.date<cut)return;(by[x.ac]=by[x.ac]||{})[x.cat]=((by[x.ac]||{})[x.cat]||0)+x.amount});
  const b={};Object.entries(by).forEach(([ac,cats])=>{b[ac]={};Object.entries(cats).forEach(([c,v])=>b[ac][c]=Math.round(v*(.88+R()*.2)/100)*100)});
  return b;
};

/* standard demo history for the 3 seeded aircraft (13 months) */
VA.genStandardHistory=function(S){
  const R=rng(350612);const to=addDays(todayISO(),-1),from=addDays(addMonths(todayISO(),-13),0);
  const spec={ka350:{hrs:212,leg:1.6,crew:118000,depr:21000,reserve:190,tqMax:2230,kind:'turbine'},pc12:{hrs:268,leg:1.3,crew:96000,lease:16500,reserve:120,tqMax:44.3,kind:'turbine'},sr22:{hrs:154,leg:1.0,reserve:24,kind:'piston',chtDrift:22}};
  const pilots=S.people.filter(p=>p.role!=='mechanic');let flights=[],exp=[];
  S.aircraft.forEach(a=>{const sp=spec[a.id];Object.assign(a,{crewAnnual:sp.crew||0,deprMonthly:sp.depr||0,leaseMonthly:sp.lease||0,reserveHr:sp.reserve,tqMax:sp.tqMax,kind:sp.kind,chtDrift:sp.chtDrift||0});
    const f=VA.genFlights(a,from,to,sp.hrs,sp.leg,R,pilots,addMonths(todayISO(),-13));
    flights=flights.concat(f);exp=exp.concat(VA.genExpenses(a,f,from,to,R))});
  S.budgets=VA.genBudgets(exp,R);
  return {flights,expenses:exp};
};

/* ---------------- large dataset (~50 aircraft, 20+ years) ---------------- */
const CATALOG=[ // [tier, FAA make/model, short, engines, annual hrs, gph, fuel $, avg leg, kind, FAA ACFTREF code]
  ['heavyjet','Bombardier BD-100-1A10 (Challenger 350)','Challenger 350','2 × HTF7350',300,420,6.10,2.0,'turbine','1390044'],
  ['heavyjet','Textron Aviation 680A (Citation Latitude)','Citation Latitude','2 × PW306D1',260,330,6.10,1.9,'turbine','2076814'],
  ['heavyjet','Gulfstream GVII-G600','Gulfstream G600','2 × PW815GA',320,480,6.10,2.6,'turbine','05637SM'],
  ['heavyjet','Dassault Falcon 900 EX','Falcon 900EX','3 × TFE731-60',280,350,6.10,2.3,'turbine','2730009'],
  ['lightjet','Embraer EMB-505 (Phenom 300E)','Phenom 300E','2 × PW535E1',240,180,6.10,1.5,'turbine','326040C'],
  ['lightjet','Textron Aviation 525B (Citation CJ3+)','Citation CJ3+','2 × FJ44-3A',220,160,6.10,1.4,'turbine','2076619'],
  ['lightjet','Honda Aircraft HA-420 (HondaJet)','HondaJet','2 × HF120',200,110,6.10,1.3,'turbine','056297O'],
  ['turboprop','Textron Aviation B300 (King Air 350)','King Air 350','2 × PT6A-60A',230,100,6.10,1.5,'turbine','4220038'],
  ['turboprop','Textron Aviation B200CGT (King Air 250)','King Air 250','2 × PT6A-52',220,90,6.10,1.4,'turbine','4222079'],
  ['turboprop','Pilatus PC-12/47E (PC-12 NGX)','PC-12 NGX','1 × PT6E-67XP',280,62,6.10,1.3,'turbine','7090553'],
  ['turboprop','Daher TBM 700 (TBM 960)','TBM 960','1 × PT6E-66XT',240,55,6.10,1.3,'turbine','8682014'],
  ['turbineheli','Bell 505 (helicopter)','Bell 505','1 × Arrius 2R',180,30,6.10,.8,'turbine','1182166'],
  ['turbineheli','Airbus Helicopters AS350B3','AS350 B3','1 × Arriel 2D',200,45,6.10,.8,'turbine','1145005'],
  ['heavytwin','Textron Aviation G58 (Baron)','Baron G58','2 × IO-550-C',160,30,6.75,1.1,'piston','4220042'],
  ['heavytwin','Piper PA-31 (Navajo)','Navajo','2 × TIO-540',150,38,6.75,1.1,'piston','7103103'],
  ['pistonheli','Robinson R44 II (helicopter)','R44 II','1 × IO-540-AE1A5',170,15,6.75,.7,'piston','7640122'],
  ['lighttwin','Piper PA-34-220T (Seneca V)','Seneca V','2 × TSIO-360',170,24,6.75,1.0,'piston','7103223'],
  ['lighttwin','Diamond DA 42','DA42','2 × AE300',190,10,6.10,1.0,'piston','2990004'],
  ['single','Cirrus SR22T','SR22T','1 × TSIO-550-K',150,18,6.75,1.0,'piston','2130004'],
  ['single','Textron Aviation G36 (Bonanza)','Bonanza G36','1 × IO-550-B',130,15,6.75,1.0,'piston','4223554'],
  ['single','Textron Aviation 182T (Skylane)','182T','1 × IO-540-AB1A5',120,13,6.75,.9,'piston','2072723'],
  ['single','Textron Aviation 172S (Skyhawk)','172S','1 × IO-360-L2A',140,9,6.75,.9,'piston','2072449'],
  ['single','Mooney M20TN (Acclaim)','Mooney Acclaim','1 × TSIO-550-G',130,17,6.75,1.0,'piston','5870228'],
  ['experimental','Sling Aircraft Sling TSi (experimental)','Sling TSi','1 × Rotax 915 iS',120,6,6.10,.9,'piston','05643WM']
];
function itemTemplates(a,R){
  const t=a.kind==='turbine',tt=a.tt,mk=(cat,name,ref,intHrs,intMo,required=true,remFrac)=>{
    const f=remFrac??R();const it={id:uid('m'),ac:a.id,cat,name,ref,intHrs,intMo,required,lastHrs:null,lastDate:null,verified:R()<.92?{by:'Dale Prentice',cert:'A&P/IA #3412987 (demo)',date:addDays(todayISO(),-Math.floor(R()*200))}:null};
    if(intHrs)it.lastHrs=r1(tt-intHrs*(1-f));if(intMo)it.lastDate=addDays(todayISO(),-Math.floor(intMo*30.4*(1-f)));
    if(!intHrs&&!intMo){it.targetDate=addDays(todayISO(),30+Math.floor(R()*200));it.required=false;it.verified=null}
    return it};
  const g=R(),badAD=g<.07,soon=g>=.07&&g<.25;
  const L=t?[mk('Inspection','Phase / progressive inspection','Manufacturer inspection program',200,12,true,soon?.08:undefined),
    mk('Calendar','Pitot-static & transponder check','14 CFR 91.411 / 91.413',null,24),mk('Calendar','ELT battery','14 CFR 91.207',null,24),
    mk('Life-limited','Engine HSI / mid-life','Engine maintenance manual',1800,null),mk('Life-limited','Engine overhaul / TBO','Engine maintenance manual',3600,null),
    mk('Life-limited','Propeller / fan overhaul','Manufacturer limit',4000,72),mk('AD','Recurring structural inspection','AD 20XX-DEMO-'+String(Math.floor(R()*90)+10)+' (recurring)',400,null,true,badAD?-.02:undefined),
    mk('SB','Service bulletin compliance','SB DEMO-'+Math.floor(R()*900),null,null,false),mk('Life-limited','Fire bottle hydrostatic test','DOT 49 CFR 180',null,60),
    mk('Life-limited','Landing gear actuator overhaul','Component limit',6000,null)]
   :[mk('Inspection','Annual inspection','14 CFR 91.409(a)',null,12,true,soon?.05:undefined),mk('Inspection','Oil & filter change','Engine mfr. SIL',50,4,false),
    mk('Calendar','Pitot-static & transponder check','14 CFR 91.411 / 91.413',null,24),mk('Calendar','ELT battery','14 CFR 91.207',null,24),
    mk('Life-limited','Engine TBO','Engine mfr. SIL',2000,144),mk('Life-limited','Propeller overhaul','Prop mfr. limit',2400,72),
    mk('AD','Recurring AD inspection','AD 20XX-DEMO-'+String(Math.floor(R()*90)+10)+' (recurring 12 mo)',null,12,true,badAD?-.03:undefined),
    mk('Life-limited','Magneto inspection','Mfr. 500 h',500,null),mk('SB','Service bulletin compliance','SB DEMO-'+Math.floor(R()*900),null,null,false)];
  return L;
}
VA.buildLarge=async function(onProgress){
  const R=rng(777);const S=VA.state();const t0=performance.now();
  const people=[S.people[0],...['Jake Morrow','Sarah Lin','Marcus Webb','Ana Ruiz','Tom Becker','Priya Nair','Luis Ortega','Kim Tran','Owen Hale'].map((n,i)=>({id:i<2?['p_jake','p_sarah'][i]:'p_'+n.split(' ')[0].toLowerCase(),name:n,role:'pilot',title:i===0?'Chief Pilot · ATP':'Pilot (demo)',initials:n.split(' ').map(x=>x[0]).join('')})),S.people.find(p=>p.role==='mechanic')];
  const pilots=people.filter(p=>p.role!=='mechanic');
  const aircraft=[],items=[];let logCount=0,expCount=0;
  await DAL.clearAll();
  const today=todayISO(),expFrom=addMonths(today,-24),engFrom=addMonths(today,-24);
  const used=new Set();
  for(let i=0;i<50;i++){
    const c=i<3?CATALOG[[7,9,18][i]]:CATALOG[Math.floor(R()*CATALOG.length)];
    const STD=['N350VK','N612VK','N813ZK'],pool=((window.DEMO_TAILS&&window.DEMO_TAILS.pool)||[]).filter(t=>!STD.includes(t));const tail=i<3?STD[i]:(pool[i-3]||('NDEMO'+i));used.add(tail);
    const years=20+Math.floor(R()*6),startYear=new Date().getFullYear()-years;
    const a={id:'ac'+i,cls:c[0],faa:{code:c[9]},model:c[1],short:c[2],engines:c[3],tail,year:startYear,serial:'DEMO-'+(1000+i),color:`hsl(${Math.round(i*137.5%360)} 85% 62%)`,
      fuel:c[8]==='turbine'||c[1].includes('DA 42')?'Jet A':'100LL',gph:c[5],fuelPrice:c[6],kind:c[8],tt:0,hrs12:0,base:i%5===0?'KBNA':'KM02',
      fixedAnnual:{'Insurance':c[0]==='heavyjet'?72000:c[0]==='lightjet'?42000:c[0]==='turboprop'?30000:c[0]==='heavytwin'?9000:6000,'Hangar (KM02)':c[0]==='single'?4800:c[0].includes('jet')?21600:12000,'Pilot training (recurrent)':c[8]==='turbine'?14000:1500,'Nav data & subscriptions':c[8]==='turbine'?6500:1450,'Management & admin':c[8]==='turbine'?9000:0},
      crewAnnual:c[0]==='heavyjet'?240000:c[0]==='lightjet'?130000:c[0]==='turboprop'?100000:0,reserveHr:c[8]==='turbine'?150+Math.round(R()*250):22+Math.round(R()*15),tqMax:2230,
      baselineVerified:{by:'Dale Prentice',cert:'A&P/IA #3412987 (demo)',date:addDays(today,-Math.floor(R()*300))},demo:true};
    const fl=VA.genFlights(a,`${startYear}-0${1+Math.floor(R()*9)}-1${Math.floor(R()*9)}`,addDays(today,-1),c[4]*(.7+R()*.6),c[7],R,pilots,engFrom);
    a.tt=r1(fl.reduce((t,f)=>t+f.hrs,0));a.hrs12=r1(fl.filter(f=>f.date>=addDays(today,-365)).reduce((t,f)=>t+f.hrs,0));
    const ex=VA.genExpenses(a,fl.filter(f=>f.date>=expFrom),expFrom,addDays(today,-1),R);
    // maintenance logbook entries (annual/phase each year + repairs)
    const mx=[];for(let y=startYear+1;y<=new Date().getFullYear();y++){const d=`${y}-${String(1+Math.floor(R()*12)).padStart(2,'0')}-${String(1+Math.floor(R()*27)).padStart(2,'0')}`;if(d>=today)continue;
      mx.push({id:uid('l'),ac:a.id,date:d,type:'Inspection',text:(a.kind==='turbine'?'Phase inspection':'Annual inspection')+' completed. Returned to service.',by:'Dale Prentice, A&P/IA',demo:true});
      for(let k=0;k<4;k++){const d2=addDays(d,Math.floor(R()*330));if(d2<today)mx.push({id:uid('l'),ac:a.id,date:d2,type:'Maintenance',text:['Replaced brake linings','Serviced oxygen system','Replaced landing light','Repaired cowl fastener','Replaced starter-generator brushes','Tire replaced, main LH','Battery capacity check'][Math.floor(R()*7)]+' (demo).',by:'Dale Prentice, A&P/IA',demo:true})}}
    aircraft.push(a);items.push(...itemTemplates(a,R));
    await DAL.addLogs(fl.concat(mx),10000);await DAL.putExpenses(ex);
    logCount+=fl.length+mx.length;expCount+=ex.length;
    onProgress&&onProgress((i+1)/50,`${i+1}/50 aircraft · ${logCount.toLocaleString()} logbook entries · ${expCount.toLocaleString()} expenses`);
  }
  const squawks=[];aircraft.forEach(a=>{const n=Math.floor(R()*30);for(let k=0;k<n;k++){const d=addDays(today,-Math.floor(R()*2000));const open=R()<.04;
    squawks.push({id:uid('s'),ac:a.id,title:['Nav light inop','Fuel cap seal worn','Autopilot disconnect intermittent','Cabin door seal leak','Static wick missing','Brake squeal','Oil seep at rocker cover','Trim indicator sticky'][Math.floor(R()*8)],desc:'Demo squawk.',by:pilots[Math.floor(R()*pilots.length)].id,date:d,grounding:open&&R()<.15,status:open?'open':'resolved',...(open?{}:{fix:'Repaired and ops checked (demo).',signedBy:'Dale Prentice',cert:'A&P/IA #3412987 (demo)',fixDate:addDays(d,2)})})}});
  const docs=[];aircraft.forEach(a=>['Airworthiness Certificate','Registration','Insurance policy','Weight & balance','POH / AFM'].forEach((n,k)=>docs.push({id:uid('d'),ac:a.id,name:n,kind:'Demo document',exp:k===1?addMonths(today,Math.floor(R()*36)-2):k===2?addMonths(today,Math.floor(R()*12)-1):null})));
  const bookings=[];for(let k=0;k<30;k++){const a=aircraft[Math.floor(R()*aircraft.length)];bookings.push({id:uid('b'),ac:a.id,pilot:pilots[Math.floor(R()*pilots.length)].id,date:addDays(today,Math.floor(R()*7)-1),start:6+Math.floor(R()*10),dur:1+Math.floor(R()*5),purpose:['Trip','Owner flight','Training'][Math.floor(R()*3)],route:'KM02 → '+AIRPORTS[Math.floor(R()*AIRPORTS.length)]})}
  const allExp=await DAL.scanExpenses({from:addDays(today,-365),to:today});
  const st={v:2,seeded:today,role:S.role,large:true,people,aircraft,items,squawks,docs,bookings,pendingImports:[],weekOffset:0,mxSpend:{},budgets:VA.genBudgets(allExp,R),limits:{},avionics:aircraft.slice(0,3).map((a,i)=>({ac:a.id,systemId:'DEMO-'+a.tail,kind:'Garmin G1000 NXi'})),integrations:S.integrations};
  VA.setState(st);await VA.flush();
  return {ms:performance.now()-t0,aircraft:50,logs:logCount,expenses:expCount,items:items.length,squawks:squawks.length};
};
VA.toggleLarge=async function(){
  const S=VA.state();
  if(S.large){if(!confirm('Switch back to the standard 3-aircraft demo?'))return;await VA.seedStandard();VA.logCount=await DAL.countLogs();VA.syncLargeBtn();await VA.refreshAgg();VA.toast('Standard demo restored','ok');VA.route();return}
  if(!confirm('Generate the large DEMO dataset (~50 aircraft, 20+ years of logbook entries each)? This replaces current demo data and takes several seconds.'))return;
  VA.modal('Generating large demo dataset',`<p class="muted" style="margin-top:0">Writing to IndexedDB in batches… <span class="demo-n">DEMO</span></p><div class="prog"><i id="lgBar"></i></div><div class="small mono muted" id="lgTxt">Starting…</div>`,'');
  const r=await VA.buildLarge((p,txt)=>{const b=document.getElementById('lgBar');if(b)b.style.width=(p*100)+'%';const t=document.getElementById('lgTxt');if(t)t.textContent=txt});
  VA.logCount=await DAL.countLogs();VA.lastLarge=r;VA.closeModal();VA.syncLargeBtn();await VA.refreshAgg();
  VA.toast(`Large demo loaded: ${r.aircraft} aircraft · ${r.logs.toLocaleString()} logbook entries · ${r.expenses.toLocaleString()} expenses in ${(r.ms/1000).toFixed(1)} s`,'ok');
  VA.go('fleet');
};
VA.syncLargeBtn=()=>{const b=document.getElementById('largeBtn');if(!b)return;const on=!!VA.state().large;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)};
})();
