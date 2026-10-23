/* Generates DEMO avionics/engine-data samples. All values synthetic; tails are verified-unassigned demo N-numbers. */
const fs=require('fs'),path=require('path');const {zipSync,strToU8}=require('/tmp/vtest/node_modules/fflate');
const OUT=path.join(__dirname,'..','samples');fs.mkdirSync(OUT,{recursive:true});
let seed=42;const R=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const AP={KM02:[36.1287,-87.4300],KMQY:[36.0090,-86.5201],KBNA:[36.1245,-86.6782]};
const pad=n=>String(n).padStart(2,'0');
function profile(from,to,startISO,cruiseMin,{exceed=false}={}){ // returns 1 Hz rows
  const rows=[];const [y,mo,d]=startISO.slice(0,10).split('-').map(Number);const [hh,mm]=startISO.slice(11,16).split(':').map(Number);
  let t=Date.UTC(y,mo-1,d,hh,mm,0);const A=AP[from],B=AP[to];
  const phases=[['preflight',120],['taxi',420],['runup',90],['takeoff',40],['climb',480],['cruise',cruiseMin*60],['descent',420],['landing',60],['taxi',240],['shutdown',30]];
  const total=phases.reduce((s,p)=>s+p[1],0);const airStart=120+420+90,airEnd=total-330;let i=0;
  for(const [ph,dur] of phases)for(let k=0;k<dur;k++,i++,t+=1000){
    const f=Math.max(0,Math.min(1,(i-airStart)/(airEnd-airStart)));const lat=A[0]+(B[0]-A[0])*f,lon=A[1]+(B[1]-A[1])*f;
    const P={preflight:[0,0,0,0,0],taxi:[0,8,1000,5.5,0],runup:[0,0,1800,8,0],takeoff:[70,70,2700,26,0],climb:[110,115,2600,24,3000],cruise:[155,170,2500,17,7500],descent:[150,165,2300,12,3000],landing:[70,60,1200,5,0],shutdown:[0,0,700,3,0]}[ph];
    const alt=ph==='climb'?600+(k/dur)*6900:ph==='cruise'?7500:ph==='descent'?7500-(k/dur)*6900:600;
    let cht=ph==='preflight'?80:ph==='taxi'?250+k/6:ph==='climb'?395+k/60:ph==='cruise'?378:ph==='descent'?340:300;
    const chts=[0,1,2,3,4,5].map(c=>Math.round(cht+(c-2)*6+R()*4));
    if(exceed&&ph==='climb'&&k>200&&k<240)chts[2]=466;
    const egts=[0,1,2,3,4,5].map(c=>ph==='preflight'?80:Math.round((ph==='cruise'?1420:ph==='climb'?1300:1150)+c*12+R()*8));
    const d=new Date(t);rows.push({date:`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,time:`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,lat,lon,alt,ias:P[0],gs:P[1]+(P[1]?R()*3:0),rpm:ph==='preflight'?0:P[2]+Math.round(R()*10),ff:P[3],oilT:ph==='preflight'?70:Math.round(180+Math.min(30,i/60)),oilP:ph==='preflight'?0:Math.round(58+R()*4),cht:chts,egt:egts,ph});
  }
  return rows;
}
const G_UNITS='#yyy-mm-dd, hh:mm:ss,   hh:mm,  ident,      degrees,      degrees, ft Baro,  inch,  ft msl, deg C,     kt,     kt,     fpm,    deg,    deg,      G,      G,   deg,   deg, volts,  gals,  gals,   gph,   psi,  deg F,   psi,     Hg,    rpm,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  deg F,  ft wgs,  kt';
const G_HDR='  Lcl Date, Lcl Time, UTCOfst, AtvWpt,     Latitude,    Longitude,    AltB, BaroA,  AltMSL,   OAT,    IAS, GndSpd,    VSpd,  Pitch,   Roll,  LatAc, NormAc,   HDG,   TRK, volt1,  FQtyL,  FQtyR, E1 FFlow, E1 FPres, E1 OilT, E1 OilP, E1 MAP, E1 RPM, E1 CHT1, E1 CHT2, E1 CHT3, E1 CHT4, E1 CHT5, E1 CHT6, E1 EGT1, E1 EGT2, E1 EGT3, E1 EGT4, E1 EGT5, E1 EGT6, AltGPS,    TAS';
function garmin(rows,meta,ofs='-05:00'){ // rows times are UTC; G1000 records local time + offset
  const o=parseInt(ofs);const L=[`#airframe_info, log_version="1.00", airframe_name="${meta.airframe}", unit_software_part_number="006-B0000-00", unit_software_version="0.00", system_software_part_number="006-B0000-00", system_id="${meta.systemId}", mode=NORMAL,`,G_UNITS,G_HDR];
  rows.forEach(r=>{const d=new Date(Date.parse(r.date+'T'+r.time+'Z')+o*3600e3);const ld=`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,lt=`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    L.push([ld,lt,ofs,r.ph==='cruise'?'KMQY':'',r.lat.toFixed(7),r.lon.toFixed(7),Math.round(r.alt),'30.02',Math.round(r.alt+40),'14.0',r.ias.toFixed(2),r.gs.toFixed(2),'0','0.0','0.0','0.00','1.00','90','90','28.1','40.0','40.0',r.ff.toFixed(2),'25.0',r.oilT.toFixed(2),r.oilP.toFixed(2),'25.0',r.rpm.toFixed(1),...r.cht.map(x=>x.toFixed(2)),...r.egt.map(x=>x.toFixed(2)),Math.round(r.alt+60),r.ias?(r.ias*1.1).toFixed(0):''].join(', '))});
  return L.join('\r\n')+'\r\n';
}
const W=(n,c)=>{fs.writeFileSync(path.join(OUT,n),c);console.log('wrote',n,c.length)};
const META={airframe:'Cirrus SR22',systemId:'DEMO-SR22-0001'};
const f1=profile('KM02','KMQY','2026-10-20T14:05',22,{exceed:true});
W('garmin-g1000-perspective-N813ZK-DEMO.csv',garmin(f1,META));
const f2=profile('KMQY','KM02','2026-10-21T19:10',24);
W('garmin-g1000-perspective-N813ZK-dup-DEMO.csv',garmin(f2,META));
// G3X (aircraft_ident + two header rows) — unknown device, tail-matched
const g3=profile('KM02','KBNA','2026-10-18T15:00',18);
const G3X_META=`#airframe_info log_version="1.00" log_content_version="1.02" product="GDU 460" aircraft_ident="N813ZK" unit_software_part_number="006-B0000-00" software_version="0.00" system_id="DEMO-G3X-7777" unit="PFD1" airframe_hours="812.4" engine_hours="812.4" engine_cycles="0"`;
const G3X_LAB='Date (yyyy-mm-dd),Time (hh:mm:ss),UTC Offset (hh:mm),Latitude (deg),Longitude (deg),GPS Altitude (ft),GPS Ground Speed (kt),Indicated Airspeed (kt),Oil Temp (deg F),Oil Press (PSI),RPM,Fuel Flow (gal/hour),CHT1 (deg F),CHT2 (deg F),CHT3 (deg F),CHT4 (deg F),EGT1 (deg F),EGT2 (deg F),EGT3 (deg F),EGT4 (deg F)';
const G3X_HDR='Lcl Date,Lcl Time,UTCOfst,Latitude,Longitude,AltGPS,GndSpd,IAS,E1 OilT,E1 OilP,E1 RPM,E1 FFlow,E1 CHT1,E1 CHT2,E1 CHT3,E1 CHT4,E1 EGT1,E1 EGT2,E1 EGT3,E1 EGT4';
W('garmin-g3x-N813ZK-DEMO.csv',[G3X_META,G3X_LAB,G3X_HDR,...g3.map(r=>[r.date,r.time,'+00:00',r.lat.toFixed(7),r.lon.toFixed(7),Math.round(r.alt),r.gs.toFixed(1),r.ias,r.oilT,r.oilP,r.rpm,r.ff,...r.cht.slice(0,4),...r.egt.slice(0,4)].join(','))].join('\r\n'));
// Dynon SkyView (tail in filename; first row headers "Name (Units)"; lat/lon/CHT names UNVERIFIED)
const dy=profile('KM02','KMQY','2026-10-19T16:00',20);
const toC=f=>((f-32)*5/9).toFixed(1);
W('2026-10-19-N813ZK-SN1492-16.4-DEMO-USER_LOG_DATA.csv',['Date,Time Recorded,Latitude (deg),Longitude (deg),GPS Altitude (ft),Ground Speed (kts),Indicated Airspeed (kts),RPM,Fuel Flow (gph),Oil Pressure (psi),Oil Temperature (degC),CHT 1 (degC),CHT 2 (degC),CHT 3 (degC),CHT 4 (degC),EGT 1 (degC),EGT 2 (degC)',
  ...dy.map(r=>{const [Y,M,D]=r.date.split('-');return [`${M}/${D}/${Y}`,r.time,r.lat.toFixed(6),r.lon.toFixed(6),Math.round(r.alt),r.gs.toFixed(1),r.ias,r.rpm,r.ff,r.oilP,toC(r.oilT),...r.cht.slice(0,4).map(toC),...r.egt.slice(0,2).map(toC)].join(',')})].join('\n'));
// Avidyne R9 (file names verified; column names UNVERIFIED — keyword-mapped)
const av=profile('KBNA','KM02','2026-10-17T13:30',15);
fs.mkdirSync(path.join(OUT,'avidyne-r9-DEMO'),{recursive:true});
fs.writeFileSync(path.join(OUT,'avidyne-r9-DEMO','C_ENGINE.CSV'),['Date,Time,RPM,Fuel Flow,Oil Temp,Oil Press,CHT1,CHT2,CHT3,CHT4,CHT5,CHT6,EGT1,EGT2,EGT3,EGT4,EGT5,EGT6',...av.map(r=>[r.date,r.time,r.rpm,r.ff,r.oilT,r.oilP,...r.cht,...r.egt].join(','))].join('\r\n'));
fs.writeFileSync(path.join(OUT,'avidyne-r9-DEMO','C_FLIGHT.CSV'),['Date,Time,Latitude,Longitude,Indicated Airspeed,Ground Speed',...av.map(r=>[r.date,r.time,r.lat.toFixed(6),r.lon.toFixed(6),r.ias,r.gs.toFixed(1)].join(','))].join('\r\n'));
// GPX + KML tracks
const tr=profile('KM02','KBNA','2026-10-16T12:00',14).filter((r,i)=>i%5===0);
W('foreflight-track-DEMO.gpx',`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Valkyr DEMO" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>DEMO KM02-KBNA</name><trkseg>\n${tr.map(r=>`<trkpt lat="${r.lat.toFixed(6)}" lon="${r.lon.toFixed(6)}"><ele>${(r.alt*.3048).toFixed(0)}</ele><time>${r.date}T${r.time}Z</time></trkpt>`).join('\n')}\n</trkseg></trk></gpx>\n`);
const tk=profile('KBNA','KM02','2026-10-16T17:00',13).filter((r,i)=>i%5===0);
W('track-DEMO.kml',`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>DEMO track</name><Placemark><gx:Track>\n${tk.map(r=>`<when>${r.date}T${r.time}Z</when>`).join('\n')}\n${tk.map(r=>`<gx:coord>${r.lon.toFixed(6)} ${r.lat.toFixed(6)} ${(r.alt*.3048).toFixed(0)}</gx:coord>`).join('\n')}\n</gx:Track></Placemark></Document></kml>\n`);
// JPI header-only demo (real files are binary after the $-header)
W('U261015-DEMO.JPI','$U,N813ZK*00\r\n$A,305,230,500,415,60,1650,230,90*00\r\n$C,900,0,0,0,0*00\r\n$T,10,15,26,9,30,0*00\r\n$L,49*00\r\n'+Buffer.from([0,1,2,3,250,251,252]).toString('latin1')+'(DEMO: binary flight records omitted)');
W('unknown-avionics-DEMO.csv','Timestamp;Param_A;Param_B\n2026-10-10 10:00:00;1;2\n');
// Valkyr CSVs
const tails=['N350VK','N612VK','N813ZK'];let fc='tail,date,from,to,hours,pilot\n';for(let i=0;i<1000;i++){const t=tails[i%3];const d=new Date(Date.UTC(2015,0,1)+i*3.5*864e5);fc+=`${t},${d.toISOString().slice(0,10)},KM02,${['KBNA','KMQY','KJWN','KCHA'][i%4]},${(0.5+R()*2).toFixed(1)},Jake Morrow\n`}
W('flights-1000-DEMO.csv',fc);
W('due-items-DEMO.csv','tail,item,type,ref,interval_hours,interval_months,last_done_hours,last_done_date,required\nN813ZK,Alternator belt inspection,Inspection,Mfr SIL (demo),100,,790.0,,yes\nN350VK,Oxygen mask inspection,Calendar,Operator program (demo),,12,,2026-01-15,yes\nN612VK,Wing bolt inspection,AD,AD 20XX-DEMO-99,,24,,2025-05-01,yes\n');
W('expenses-DEMO.csv','date,tail,category,vendor,description,quantity,unit,unit_price,amount,paid_by,notes\n2026-10-01,N350VK,Fuel & oil,KM02 FBO (demo),Jet A uplift,120,gal,6.10,732.00,Company card,\n2026-10-03,N612VK,Catering,Skyline Catering (demo),Pax lunch,1,ea,240,240.00,Company card,\n2026-10-05,N813ZK,Hangar / tiedown,Dickson Co. Airport Authority (demo),Hangar rent Oct,1,mo,400,400.00,ACH,\n');
// full demo SD card: G1000 data_log with two flights in one file + MFD duplicate of the first, plus database/chart junk
const dayA=profile('KM02','KMQY','2026-10-22T13:00',20,{exceed:false}),dayB=profile('KMQY','KM02','2026-10-22T16:30',21);
const card={
 'data_log/log_261022_080000_KM02.csv':strToU8(garmin(dayA.concat(dayB),META)),
 'data_log/log_261022_080002_MFD.csv':strToU8(garmin(dayA,META)),
 'ldr_sys/system.bin':new Uint8Array([1,2,3,4]),'Garmin/GarminDevice.xml':strToU8('<Device>demo</Device>'),
 'navdata/nav_2610.bin':new Uint8Array(64),'charts/KM02_apt.tif':new Uint8Array(32),'terrain/terrain_na.img':new Uint8Array(32),'README-DEMO.txt':strToU8('DEMO SD card for Valkyr360. Synthetic data.')};
fs.writeFileSync(path.join(OUT,'demo-sd-card.zip'),zipSync(card));console.log('wrote demo-sd-card.zip');
