/* Valkyr Aero — DEMO DATA. All aircraft, N-numbers, serials, AD/SB numbers, people and costs are fictitious. */
(function(){
  function iso(d){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
  function dayOff(n){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return iso(d)}
  function monOff(m,extraDays){const d=new Date();d.setHours(12,0,0,0);d.setMonth(d.getMonth()+m);d.setDate(d.getDate()+(extraDays||0));return iso(d)}
  const IA={by:'Dale Prentice',cert:'A&P/IA #3412987 (demo)'};

  window.VALKYR_SEED=function(){
    const people=[
      {id:'p_trevor',name:'Trevor Hill',role:'owner',title:'Director of Operations',initials:'TH'},
      {id:'p_jake',name:'Jake Morrow',role:'pilot',title:'Chief Pilot · ATP',initials:'JM'},
      {id:'p_sarah',name:'Sarah Lin',role:'pilot',title:'Pilot · Commercial/CFII',initials:'SL'},
      {id:'p_dale',name:'Dale Prentice',role:'mechanic',title:'A&P / IA',initials:'DP'}
    ];
    const aircraft=[
      {id:'ka350',cls:'turboprop',faa:{code:'4220038',mfr:'TEXTRON AVIATION INC',model:'B300'},tail:'N350VK',model:'Beechcraft King Air 350',short:'King Air 350',year:2014,serial:'FL-9xx (demo)',engines:'2 × PT6A-60A',reg:{n:'N350VK',serial:'FL-0950',code:'4220038',engCode:'52044',year:'2014',status:'V',certIssue:'2021-03-15',expiration:'2030-03-31',registrantType:'3',certification:'1N',ownerHash:'demo-owner-a',modeSHex:'A0D3E1',src:'DEMO baseline (fictitious registration)'},color:'#00e1ff',
       tt:6412.3,fuel:'Jet A',gph:100,fuelPrice:6.10,hrs12:212,fixedAnnual:{'Insurance':38500,'Hangar (KM02)':14400,'Pilot training (recurrent)':16800,'Nav data & subscriptions':6200,'Management & admin':9000},
       baselineVerified:{...IA,date:dayOff(-41)}},
      {id:'pc12',cls:'turboprop',faa:{code:'7090553',mfr:'PILATUS AIRCRAFT LTD',model:'PC-12/47E'},tail:'N612VK',model:'Pilatus PC-12/47E NGX',short:'PC-12 NGX',year:2019,serial:'2xxx (demo)',engines:'1 × PT6E-67XP',reg:{n:'N612VK',serial:'2105',code:'7090553',engCode:'',year:'2019',status:'V',certIssue:'2019-11-02',expiration:'2029-06-30',registrantType:'7',certification:'1N',ownerHash:'demo-owner-b',modeSHex:'A80F2C',src:'DEMO baseline (fictitious registration)'},color:'#a78bfa',
       tt:3188.6,fuel:'Jet A',gph:62,fuelPrice:6.10,hrs12:268,fixedAnnual:{'Insurance':24800,'Hangar (KM02)':9600,'Pilot training (recurrent)':9800,'Nav data & subscriptions':4900,'Management & admin':6000},
       baselineVerified:{...IA,date:dayOff(-63)}},
      {id:'sr22',cls:'single',faa:{code:'2130001',mfr:'CIRRUS DESIGN CORP',model:'SR22'},tail:'N813ZK',model:'Cirrus SR22 G6',short:'SR22 G6',year:2021,serial:'6xxx (demo)',engines:'1 × IO-550-N',reg:{n:'N813ZK',serial:'6211',code:'2130001',engCode:'',year:'2021',status:'V',certIssue:'2021-05-20',expiration:'2028-05-31',registrantType:'1',certification:'1N',ownerHash:'demo-owner-c',modeSHex:'AB44C9',src:'DEMO baseline (fictitious registration)'},color:'#ffb020',
       tt:812.4,fuel:'100LL',gph:17,fuelPrice:6.75,hrs12:154,fixedAnnual:{'Insurance':6900,'Hangar (KM02)':4800,'Pilot training (recurrent)':1500,'Nav data & subscriptions':1450,'Management & admin':0},
       baselineVerified:{...IA,date:dayOff(-20)}}
    ];
    let n=0; const id=p=>p+'_'+(++n);
    const mx=(ac,cat,name,ref,intHrs,intMo,lastHrs,lastDate,required=true,verified=true)=>({id:id('m'),ac,cat,name,ref,intHrs,intMo,lastHrs,lastDate,required,verified:verified?{...IA,date:lastDate||dayOff(-41)}:null});
    const items=[
      // King Air 350 — Phase 3 coming due
      mx('ka350','Inspection','Phase 3 inspection','Beechcraft 4-phase program',200,12,6230.3,monOff(-5)),
      mx('ka350','Calendar','Pitot-static & transponder check','14 CFR 91.411 / 91.413',null,24,null,monOff(-24,22)),
      mx('ka350','Calendar','ELT battery','14 CFR 91.207',null,24,null,monOff(-9)),
      mx('ka350','Life-limited','Engine HSI — LH PT6A-60A','P&WC MM 72-00-00',1800,null,4824.3,monOff(-30)),
      mx('ka350','Life-limited','Engine HSI — RH PT6A-60A','P&WC MM 72-00-00',1800,null,4874.3,monOff(-29)),
      mx('ka350','Life-limited','Propeller overhaul (both)','Hartzell 4-blade, 4000 h / 72 mo',4000,72,4102.0,monOff(-38)),
      mx('ka350','AD','Elevator trim tab actuator inspection','AD 2023-DEMO-14 (recurring)',400,null,6112.3,monOff(-8)),
      mx('ka350','SB','Fuel nacelle drain valve replacement','SB 28-DEMO-031',null,null,null,null,false,false),
      mx('ka350','Life-limited','Fire extinguisher bottle hydrostatic test','DOT 49 CFR 180',null,60,null,monOff(-51)),
      // PC-12 — recurring AD overdue → grounded
      mx('pc12','Inspection','100-hour / Annual inspection','Pilatus AMM 05-20-00',100,12,3105.2,monOff(-4)),
      mx('pc12','AD','Flap actuator attach fitting inspection','AD 2025-DEMO-07 (recurring 100 h)',100,null,3085.2,monOff(-5)),
      mx('pc12','Calendar','Pitot-static & transponder check','14 CFR 91.411 / 91.413',null,24,null,monOff(-11)),
      mx('pc12','Calendar','ELT battery','14 CFR 91.207',null,24,null,monOff(-15)),
      mx('pc12','Life-limited','Engine TBO — PT6E-67XP','P&WC on-condition, 5000 h',5000,null,0,monOff(-84)),
      mx('pc12','SB','Cabin door seal improvement','SB 52-DEMO-012',null,null,null,null,false,false),
      mx('pc12','Life-limited','Oxygen bottle hydrostatic test','DOT 49 CFR 180',null,60,null,monOff(-33)),
      // SR22 — airworthy
      mx('sr22','Inspection','Annual inspection','14 CFR 91.409(a)',null,12,null,monOff(-9,-12)),
      mx('sr22','Inspection','Oil & filter change','Continental SIL — 50 h',50,4,785.4,monOff(-2),false),
      mx('sr22','Life-limited','CAPS parachute repack','Cirrus AMM, 10 yr',null,120,null,monOff(-115,-10)),
      mx('sr22','Life-limited','CAPS rocket motor','Cirrus AMM, 10 yr',null,120,null,monOff(-112)),
      mx('sr22','Calendar','Pitot-static & transponder check','14 CFR 91.411 / 91.413',null,24,null,monOff(-6)),
      mx('sr22','Calendar','ELT battery','14 CFR 91.207',null,24,null,monOff(-13)),
      mx('sr22','AD','Fuel cap adapter inspection','AD 2024-DEMO-22 (recurring 12 mo)',null,12,null,monOff(-9,-12))
    ];
    // SB "one-time, not complied" items get due dates as compliance target
    items.filter(i=>i.cat==='SB'&&!i.lastDate).forEach((i,k)=>{i.targetDate=dayOff(k?120:75);i.required=false});

    const squawks=[
      {id:id('s'),ac:'ka350',title:'Cabin reading light 3R inop',desc:'Bulb or switch — passenger side, row 3.',by:'p_jake',date:dayOff(-3),grounding:false,status:'open'},
      {id:id('s'),ac:'pc12',title:'LH landing light flickers on taxi',desc:'Intermittent, seems vibration related.',by:'p_sarah',date:dayOff(-6),grounding:false,status:'open'},
      {id:id('s'),ac:'pc12',title:'Copilot headset jack static',desc:'',by:'p_jake',date:dayOff(-24),grounding:false,status:'resolved',fix:'Replaced jack J2, ops check good.',signedBy:'Dale Prentice',cert:IA.cert,fixDate:dayOff(-22)},
      {id:id('s'),ac:'sr22',title:'Nose wheel fairing cracked',desc:'Hairline crack at lower mounting screw.',by:'p_trevor',date:dayOff(-17),grounding:false,status:'resolved',fix:'Stop-drilled crack and reinforced per AMM. Returned to service.',signedBy:'Dale Prentice',cert:IA.cert,fixDate:dayOff(-15)}
    ];

    const flights=[
      {id:id('f'),ac:'ka350',pilot:'p_jake',date:dayOff(-2),from:'KM02',to:'KPDK',hrs:1.6,src:'ForeFlight'},
      {id:id('f'),ac:'ka350',pilot:'p_jake',date:dayOff(-2),from:'KPDK',to:'KM02',hrs:1.7,src:'ForeFlight'},
      {id:id('f'),ac:'pc12',pilot:'p_sarah',date:dayOff(-5),from:'KM02',to:'KMEM',hrs:1.3,src:'Garmin Pilot'},
      {id:id('f'),ac:'pc12',pilot:'p_sarah',date:dayOff(-5),from:'KMEM',to:'KM02',hrs:1.4,src:'Garmin Pilot'},
      {id:id('f'),ac:'sr22',pilot:'p_trevor',date:dayOff(-4),from:'KM02',to:'KJWN',hrs:0.5,src:'Manual'},
      {id:id('f'),ac:'sr22',pilot:'p_trevor',date:dayOff(-4),from:'KJWN',to:'KM02',hrs:0.6,src:'Manual'}
    ];
    const pendingImports=[
      {id:id('i'),ac:'ka350',pilot:'p_jake',date:dayOff(-1),from:'KM02',to:'KTEB',hrs:2.1,src:'ForeFlight'},
      {id:id('i'),ac:'ka350',pilot:'p_jake',date:dayOff(-1),from:'KTEB',to:'KM02',hrs:2.3,src:'ForeFlight'},
      {id:id('i'),ac:'sr22',pilot:'p_sarah',date:dayOff(0),from:'KM02',to:'KMQY',hrs:0.6,src:'Garmin Pilot'}
    ];
    const logbook=[
      {id:id('l'),ac:'pc12',date:dayOff(-22),type:'Maintenance',text:'Replaced copilot headset jack J2. Ops check good.',by:'Dale Prentice, A&P/IA'},
      {id:id('l'),ac:'sr22',date:dayOff(-15),type:'Maintenance',text:'Stop-drilled nose wheel fairing crack, reinforced per AMM.',by:'Dale Prentice, A&P/IA'},
      {id:id('l'),ac:'ka350',date:monOff(-5),type:'Inspection',text:'Phase 2 inspection completed IAW Beechcraft program. Returned to service.',by:'Dale Prentice, A&P/IA'},
      {id:id('l'),ac:'pc12',date:monOff(-4),type:'Inspection',text:'100-hour / annual inspection completed. Aircraft airworthy.',by:'Dale Prentice, A&P/IA'},
      {id:id('l'),ac:'sr22',date:monOff(-2),type:'Maintenance',text:'Oil & filter change, 8 qt Phillips XC 20W-50. Filter cut — no metal.',by:'Dale Prentice, A&P/IA'}
    ];
    const docs=[];
    aircraft.forEach(a=>{
      docs.push({id:id('d'),ac:a.id,name:'Airworthiness Certificate',kind:'FAA 8100-2',exp:null});
      docs.push({id:id('d'),ac:a.id,name:'Registration',kind:'FAA 8050-3',exp:monOff(a.id==='sr22'?2:30)});
      docs.push({id:id('d'),ac:a.id,name:'Insurance policy',kind:'Hull & liability (demo carrier)',exp:monOff(a.id==='pc12'?1:7)});
      docs.push({id:id('d'),ac:a.id,name:'Weight & balance',kind:'Current W&B report',exp:null});
      docs.push({id:id('d'),ac:a.id,name:'POH / AFM',kind:'Rev. current',exp:null});
    });
    // maintenance spend, trailing 12 months
    const mxSpend={ka350:[['Phase 2 inspection',38400],['Phase 1 inspection',24100],['Engine trend monitoring & borescope',6800],['Engine/prop reserve (accrued)',59360],['Squawk repairs & parts',11900]],
                   pc12:[['100-hour / annual',27800],['AD 2025-DEMO-07 compliance',4200],['Engine reserve (accrued)',37520],['Squawk repairs & parts',8600]],
                   sr22:[['Annual inspection',5400],['Oil changes (3)',1150],['Engine reserve (accrued)',3850],['CAPS reserve (accrued)',1800],['Squawk repairs & parts',1300]]};
    // week bookings
    const bookings=[
      {id:id('b'),ac:'ka350',pilot:'p_jake',date:dayOff(1),start:8,dur:5,purpose:'Trip',route:'KM02 → KASE → KM02'},
      {id:id('b'),ac:'sr22',pilot:'p_trevor',date:dayOff(2),start:15,dur:2,purpose:'Owner flight',route:'KM02 local'},
      {id:id('b'),ac:'pc12',pilot:'p_dale',date:dayOff(0),start:9,dur:6,purpose:'Maintenance',route:'AD 2025-DEMO-07 inspection'},
      {id:id('b'),ac:'sr22',pilot:'p_sarah',date:dayOff(-1),start:10,dur:2,purpose:'Training',route:'IPC — KM02 / KBNA'}
    ];
    return {v:2,avionics:[{ac:'sr22',systemId:'DEMO-SR22-0001',kind:'Cirrus Perspective+ (Garmin)'},{ac:'ka350',systemId:'DEMO-B300-0350',kind:'Collins Pro Line Fusion (demo id)'}],deviceMap:{},limits:{},seeded:dayOff(0),role:'owner',people,aircraft,items,squawks,flights,pendingImports,logbook,docs,mxSpend,bookings,weekOffset:0};
  };
})();
