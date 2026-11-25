function m(){if(new URLSearchParams(window.location.search).get("debug")!=="1")return;if(document.getElementById("kalamalah-debug-overlay"))return;let e=document.createElement("aside");e.id="kalamalah-debug-overlay",e.style.cssText="position:fixed;top:12px;left:12px;z-index:10000;background:rgba(15,15,20,0.88);color:#e4e4e7;border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;backdrop-filter:blur(8px);min-width:210px;pointer-events:auto;",e.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <strong style="color:#34d399;">KALAMALAH DEBUG</strong>
      <button type="button" id="kalamalah-debug-close" style="background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:12px;">✕</button>
    </div>
    <div id="kalamalah-debug-stats">Initializing...</div>
  `,document.body.appendChild(e),e.querySelector("#kalamalah-debug-close")?.addEventListener("click",()=>e.remove());let n=0,o=performance.now(),r=60,i=(a)=>{if(n++,a-o>=1000)r=Math.round(n*1000/(a-o)),n=0,o=a;let t=document.querySelector("audio"),d=t?t.currentTime.toFixed(2):"—",s=t&&t.buffered.length>0?t.buffered.end(t.buffered.length-1).toFixed(2):"—",c="serviceWorker"in navigator&&navigator.serviceWorker.controller?"active":"none",u=navigator.onLine?"online":"offline",l=document.getElementById("kalamalah-debug-stats");if(l)l.innerHTML=`
        FPS: <b>${r}</b> | Net: <b>${u}</b><br/>
        Audio: <b>${d}s</b> (buf: ${s}s)<br/>
        SW: <b>${c}</b>
      `;if(document.getElementById("kalamalah-debug-overlay"))requestAnimationFrame(i)};requestAnimationFrame(i)}export{m as initDebugOverlay};
