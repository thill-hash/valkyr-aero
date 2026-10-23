/* Valkyr360 — DEMO platform (Hill Systems staff) accounts. Separate from operator accounts (va.accounts).
   Only a salt + PBKDF2-SHA-256 hash is kept; credentials are held privately by Hill Systems.
   Change with tools/set-admin-password.js (not deployed). Production: ARCHITECTURE.md §17. */
window.VA_STAFF={
  SES:'va.admin.session',TTL_H:8,
  accounts:[{id:'platform-admin',email:'admin@hillsystems.com',name:'Hill Systems Admin',org:'Hill Systems',role:'platform',alg:'PBKDF2-SHA-256',iter:600000,salt:'CiQIY5ewrECHQeacsQ+4xw==',hash:'cgowPfe/fGJY8HBcXuLI740auHDHp5KbPQ5Rmf0e/LY='}],
  find(email){email=String(email||'').trim().toLowerCase();return this.accounts.find(a=>a.email===email)||null},
  session(){try{const s=JSON.parse(localStorage.getItem(this.SES)||'null');if(!s||!s.platform||!(s.exp>Date.now())){if(s)localStorage.removeItem(this.SES);return null}return s}catch(e){return null}},
  start(a){const s={uid:a.id,email:a.email,name:a.name,org:a.org,role:'platform',platform:true,initials:'HS',at:new Date().toISOString(),exp:Date.now()+this.TTL_H*3600e3};localStorage.setItem(this.SES,JSON.stringify(s));return s},
  end(){localStorage.removeItem(this.SES)},
  async verify(email,pw){const a=this.find(email);const enc=new TextEncoder();
    const salt=a?Uint8Array.from(atob(a.salt),c=>c.charCodeAt(0)):new Uint8Array(16);
    const key=await crypto.subtle.importKey('raw',enc.encode(String(pw||'')),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:a?a.iter:600000},key,256);
    const h=btoa(String.fromCharCode(...new Uint8Array(bits)));return a&&h===a.hash?a:null}
};
