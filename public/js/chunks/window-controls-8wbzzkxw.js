function l(){if(typeof window>"u")return;if(!window.kalamalahElectron)return;let{minimize:o,maximize:r,close:n,isMaximized:t,onMaximized:a,platform:d}=window.kalamalahElectron;if(d==="darwin")return;m()}function m(){if(document.getElementById("kalamalah-window-controls"))return;let o=document.createElement("div");o.id="kalamalah-window-controls",o.style.cssText=`
    position: fixed;
    top: 0;
    right: 0;
    z-index: 10000;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-elevated, #1a1f27);
    border-bottom-left-radius: 12px;
    border: 1px solid var(--border, rgba(214, 187, 138, 0.14));
    border-top: none;
    border-right: none;
    backdrop-filter: blur(12px);
    -webkit-app-region: drag;
  `;let r=`
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, background 0.15s ease;
    -webkit-app-region: no-drag;
  `,n=document.createElement("button");n.style.cssText=r+`
    background: #f5c542;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `,n.title="Minimize",n.innerHTML="−",n.addEventListener("click",()=>window.kalamalahElectron?.minimize());let t=document.createElement("button");t.id="kalamalah-maximize-btn",t.style.cssText=r+`
    background: #34c759;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `,t.title="Maximize",t.innerHTML="□",t.addEventListener("click",()=>window.kalamalahElectron?.maximize());let a=document.createElement("button");a.style.cssText=r+`
    background: #ff3b30;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `,a.title="Close",a.innerHTML="✕",a.addEventListener("click",()=>window.kalamalahElectron?.close()),[n,t,a].forEach((e)=>{e.addEventListener("mouseenter",()=>e.style.transform="scale(1.15)"),e.addEventListener("mouseleave",()=>e.style.transform="scale(1)"),e.addEventListener("mousedown",()=>e.style.transform="scale(0.9)"),e.addEventListener("mouseup",()=>e.style.transform="scale(1.15)")}),o.append(n,t,a),document.body.appendChild(o);let d=async()=>{let e=await window.kalamalahElectron?.isMaximized(),i=document.getElementById("kalamalah-maximize-btn");if(i)i.innerHTML=e?"❐":"□"};window.kalamalahElectron?.onMaximized((e)=>{let i=document.getElementById("kalamalah-maximize-btn");if(i)i.innerHTML=e?"❐":"□"}),d();let s=document.createElement("style");s.textContent=`
    @media (min-width: 1025px) {
      .site-header {
        padding-right: 60px !important;
      }
    }
    /* Ensure controls are above everything */
    #kalamalah-window-controls {
      pointer-events: auto;
    }
    #kalamalah-window-controls * {
      -webkit-app-region: no-drag !important;
    }
  `,document.head.appendChild(s)}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",l);else l();window.addEventListener("kalamalah:page-swapped",l);export{l as initWindowControls};
