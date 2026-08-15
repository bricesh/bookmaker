import { h } from "./models.js";

/* === ui — h(), modal, confirm, toast, controls === */
export function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"),1900);
}
export function closeModal(){ document.getElementById("modal-root").innerHTML=""; }
export function openModal({eyebrow,title,body,saveLabel="Save",onSave,extraFoot}){
  const root = document.getElementById("modal-root");
  const doSave = ()=>{ if(onSave && onSave()===false) return; closeModal(); };
  const scrim = h(".scrim",null,
    h(".modal",{role:"dialog","aria-modal":"true"},
      h(".modal-head",null, eyebrow&&h(".eyebrow",null,eyebrow), h("h2",null,title)),
      h(".modal-body",null,body),
      h(".modal-foot",null,
        extraFoot||"",
        h("button.btn.ghost",{onclick:closeModal},"Cancel"),
        h("button.btn.primary",{onclick:doSave},saveLabel)
      )
    )
  );
  root.innerHTML=""; root.append(scrim);
  // close on a genuine backdrop click only — the press must start AND end on the scrim,
  // so dragging a text selection out of an input never closes the modal
  let downOnScrim=false;
  scrim.addEventListener("mousedown",(e)=>{ downOnScrim = (e.target===scrim); });
  scrim.addEventListener("click",(e)=>{ if(e.target===scrim && downOnScrim) closeModal(); });
  document.addEventListener("keydown",function onKey(e){ if(e.key==="Escape"){closeModal();document.removeEventListener("keydown",onKey);} });
  const first = scrim.querySelector("input,textarea,select"); if(first) first.focus();
}
export function confirmDlg(title,msg,yes="Delete"){
  return new Promise(res=>{
    openModal({eyebrow:"Confirm",title,
      body:h("p",{style:{color:"var(--ink-soft)"}},msg),
      saveLabel:yes,
      onSave:()=>{res(true);},
    });
    // wire cancel/scrim to resolve false
    const root=document.getElementById("modal-root");
    const sc=root.querySelector(".scrim"); let downSc=false;
    sc.addEventListener("mousedown",e=>{ downSc=(e.target===sc); });
    sc.addEventListener("click",e=>{ if(e.target===sc && downSc) res(false); });
    root.querySelectorAll(".btn.ghost").forEach(b=>b.addEventListener("click",()=>res(false)));
    // make the primary button danger-styled
    const p=root.querySelector(".btn.primary"); if(p){p.classList.remove("primary");p.style.background="var(--thread)";p.style.color="#fff";p.style.borderColor="var(--thread)";}
  });
}
export function swatchPicker(colors, current, onPick){
  const wrap = h(".swatches");
  colors.forEach(c=>{
    const b = h("button",{type:"button","aria-label":c||"none",onclick:()=>{ wrap.querySelectorAll("button").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); onPick(c); }});
    b.style.background = c || "repeating-linear-gradient(45deg,#ddd,#ddd 4px,#fff 4px,#fff 8px)";
    if(c===current) b.classList.add("sel");
    wrap.append(b);
  });
  return wrap;
}
export function toolRow(items){ // [{label,on,cls}]
  return h(".row-tools", null, ...items.map(it=>h("button.btn.ghost.sm"+(it.cls?"."+it.cls:""),{onclick:it.on,title:it.title||it.label},it.label)));
}
