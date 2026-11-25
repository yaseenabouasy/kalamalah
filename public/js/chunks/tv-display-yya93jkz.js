async function v(t,e){let n=await(await fetch(`https://api.aladhan.com/v1/timings?latitude=${t}&longitude=${e}&method=4`)).json(),r=n?.data?.timings||{};return{fajr:r.Fajr||"--:--",sunrise:r.Sunrise||"--:--",dhuhr:r.Dhuhr||"--:--",asr:r.Asr||"--:--",maghrib:r.Maghrib||"--:--",isha:r.Isha||"--:--",city:n?.data?.meta?.timezone||"Local Time"}}async function h(t){let n=(await(await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(t)}&country=&method=4`)).json())?.data?.timings||{};return{fajr:n.Fajr||"--:--",sunrise:n.Sunrise||"--:--",dhuhr:n.Dhuhr||"--:--",asr:n.Asr||"--:--",maghrib:n.Maghrib||"--:--",isha:n.Isha||"--:--",city:t}}function c(t){document.getElementById("kalamalah-salah-tv")?.remove();let e=document.createElement("div");e.id="kalamalah-salah-tv",e.style.cssText="position:fixed;inset:0;z-index:10000;background:#09090b;color:#fafafa;display:flex;flex-direction:column;justify-content:space-between;padding:48px 64px;font-family:system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;";let a=[{name:"Fajr",ar:"الفجر",time:t.fajr},{name:"Sunrise",ar:"الشروق",time:t.sunrise},{name:"Dhuhr",ar:"الظهر",time:t.dhuhr},{name:"Asr",ar:"العصر",time:t.asr},{name:"Maghrib",ar:"المغرب",time:t.maghrib},{name:"Isha",ar:"العشاء",time:t.isha}],n=()=>{let o=new Date,i=o.getHours()*60+o.getMinutes();for(let s of a){let[d,l]=s.time.split(":").map(Number);if(d!==void 0&&l!==void 0&&Number.isFinite(d)&&Number.isFinite(l)&&d*60+l>i){let y=d*60+l-i;return{name:s.name,ar:s.ar,diffMin:y}}}return{name:a[0].name,ar:a[0].ar,diffMin:null}},r=n();e.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:1.25rem;font-weight:600;letter-spacing:-0.01em;">${t.city||"Local Time"}</div>
        <div id="salah-tv-date" style="font-size:0.95rem;color:#a1a1aa;margin-top:4px;"></div>
      </div>
      <button id="salah-tv-close" style="background:transparent;border:1px solid #27272a;color:#a1a1aa;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:0.9rem;">Exit</button>
    </div>

    <div style="text-align:center;margin:auto 0;">
      <div id="salah-tv-clock" style="font-size:6.5rem;font-weight:700;letter-spacing:-0.04em;line-height:1;"></div>
      <div id="salah-tv-next" style="font-size:1.35rem;color:#10b981;margin-top:16px;font-weight:500;"></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid #27272a;padding-top:32px;gap:16px;">
      ${a.map((o)=>{let i=o.name===r.name;return`
        <div style="padding:12px 8px;text-align:center;${i?"border-top:2px solid #10b981;margin-top:-33px;padding-top:43px;":"opacity:0.7;"}">
          <div style="font-size:1.35rem;font-weight:600;margin-bottom:4px;">${o.ar}</div>
          <div style="font-size:0.85rem;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">${o.name}</div>
          <div style="font-size:2rem;font-weight:700;color:${i?"#10b981":"#fafafa"};">${o.time}</div>
        </div>`}).join("")}
    </div>
  `;let p=e.querySelector("#salah-tv-clock"),f=e.querySelector("#salah-tv-date"),m=e.querySelector("#salah-tv-next"),u=()=>{let o=new Date;p.textContent=o.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}),f.textContent=o.toLocaleDateString([],{weekday:"long",year:"numeric",month:"long",day:"numeric"});let i=n();if(i.diffMin!==null){let s=Math.floor(i.diffMin/60),d=i.diffMin%60;m.textContent=`${i.name} (${i.ar}) in ${s>0?`${s}h `:""}${d}m`}else m.textContent=`Next: ${i.name} (${i.ar})`};u();let g=setInterval(u,1000);e.querySelector("#salah-tv-close")?.addEventListener("click",()=>{if(clearInterval(g),document.fullscreenElement)document.exitFullscreen();e.remove()}),document.body.appendChild(e),e.requestFullscreen?.().catch(()=>{})}function x(t){if(t){c(t);return}document.getElementById("kalamalah-salah-consent")?.remove();let e=document.createElement("div");e.id="kalamalah-salah-consent",e.style.cssText="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);padding:16px;",e.innerHTML=`
    <div style="max-width:440px;width:100%;background:var(--bg-card,#18181b);color:var(--text-primary,#f4f4f5);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;">
      <h3 style="margin:0 0 10px;">Location for Salah Times</h3>
      <p style="margin:0 0 16px;font-size:0.95rem;opacity:0.85;line-height:1.5;">
        Kalamalah needs your location to calculate accurate Salah times for your area. You can say No and enter a city manually instead.
      </p>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="salah-no-btn" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;">No, enter city</button>
        <button id="salah-yes-btn" style="padding:8px 14px;border-radius:8px;border:none;background:var(--accent,#10b981);color:#fff;font-weight:600;cursor:pointer;">Allow Location</button>
      </div>
    </div>
  `,e.querySelector("#salah-yes-btn")?.addEventListener("click",()=>{e.remove(),navigator.geolocation.getCurrentPosition(async(a)=>{let n=await v(a.coords.latitude,a.coords.longitude);c(n)},async()=>{let a=window.prompt("Location unavailable. Enter your city name (e.g. Makkah, London):");if(a)c(await h(a))})}),e.querySelector("#salah-no-btn")?.addEventListener("click",async()=>{e.remove();let a=window.prompt("Enter your city name for Salah times (e.g. Makkah, Cairo, London):");if(a)c(await h(a))}),document.body.appendChild(e)}function b(){let t=new BroadcastChannel("kalamalah-dual-screen");window.__KALAMALAH_DUAL_SCREEN__={openTvWindow:(e=`${window.location.pathname}?tv=1`)=>{window.open(e,"kalamalah_tv","width=1280,height=720")},broadcastAyah:(e,a,n)=>{t.postMessage({type:"ayah",surah:e,ayah:a,text:n})},openSalahTvView:x}}export{b as initDualScreenMode};
