import { M, THREAD_RED, h, uid } from "./models.js";
import { navigate, renderRail } from "./router.js";
import { Store } from "./store.js";
import { closeModal, openModal, toast } from "./ui.js";
import { LINK } from "./workspace.js";

/* === threads — linking, drawing, highlight === */
export function startLink(kind,id){
  LINK.from={kind,id};
  renderRail();
  document.querySelector(".board-bar .hint:last-child")?.replaceChildren("Drawing a thread — click a "+(kind==="attribute"?"beat":"scene")+" to finish, Esc to cancel");
  const onKey=(e)=>{ if(e.key==="Escape"){ cancelLink(); document.removeEventListener("keydown",onKey); } };
  document.addEventListener("keydown",onKey);
  toast(kind==="attribute"?"Click a beat to pin the thread":"Click a scene to pin the presence thread");
}
export function cancelLink(){ LINK.from=null; navigate(); }
export function completeLink(targetKind,targetId){
  const from=LINK.from; if(!from) return;
  const ok=(from.kind==="attribute"&&targetKind==="beat")||(from.kind==="protagonist"&&targetKind==="scene");
  if(!ok){ return; }
  LINK.from=null; // clear before mutate so the re-render is clean
  Store.mutate(s=>{
    if(from.kind==="attribute"){
      if(s.connections.some(c=>c.type==="attribute-beat"&&c.fromId===from.id&&c.toId===targetId)){ toast("Already threaded"); }
      else s.connections.push({id:uid("con"),type:"attribute-beat",fromId:from.id,toId:targetId,label:"",color:THREAD_RED});
    } else {
      const pro=M.pro(from.id);
      if(s.connections.some(c=>c.type==="protagonist-scene"&&c.fromId===from.id&&c.toId===targetId)){ toast("Already threaded"); }
      else s.connections.push({id:uid("con"),type:"protagonist-scene",fromId:from.id,toId:targetId,label:"",color:pro.color});
    }
  });
}

export function connEndpoints(c){
  if(c.type==="attribute-beat"){
    return [document.querySelector(`.att[data-att-id="${c.fromId}"]`), document.querySelector(`.beat[data-beat-id="${c.toId}"]`), "right","left"];
  } else {
    return [document.querySelector(`.pro-card[data-pro-id="${c.fromId}"]`), document.querySelector(`.scene-head[data-scene-id="${c.toId}"]`), "right","left"];
  }
}
export function anchorPoint(el,side,contentRect){
  const r=el.getBoundingClientRect();
  const x=r.left-contentRect.left + (side==="right"?r.width:side==="left"?0:r.width/2);
  const y=r.top-contentRect.top + (el.classList.contains("scene-head")?16:r.height/2);
  return {x,y};
}
export function drawThreads(svg,board){
  const s=Store.state;
  svg.setAttribute("width",board.clientWidth); svg.setAttribute("height",board.clientHeight);
  svg.innerHTML="";
  if(!s.ui.threadsVisible){ return; }
  const cRect=board.getBoundingClientRect();
  const gp=board.querySelector(".grid-pane");
  const gridLeft = gp ? gp.getBoundingClientRect().left - cRect.left : 0; // left edge of the scrolling grid (right of the Cast pane)
  for(const c of s.connections){
    const [a,b,sa,sb]=connEndpoints(c); if(!a||!b) continue;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    if((ra.width===0&&ra.height===0)||(rb.width===0&&rb.height===0)) continue; // endpoint hidden (e.g. collapsed attr)
    const p1=anchorPoint(a,sa,cRect), p2=anchorPoint(b,sb,cRect);
    if(p2.x < gridLeft) continue; // target scrolled off to the left, behind the Cast pane → hide (right overflow still shows, clipped at the edge)
    const d=`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`; // taut, straight string
    const col=c.type==="attribute-beat"?THREAD_RED:(M.pro(c.fromId)?.color||"#5b655d");
    // shadow — the string sits slightly off the board
    const sh=path(d,col); sh.setAttribute("stroke","rgba(0,0,0,.22)"); sh.setAttribute("stroke-width","3.4"); sh.setAttribute("transform","translate(1,2)"); svg.append(sh);
    const pth=path(d,col); pth.setAttribute("stroke-width","2.6"); pth.dataset.conn=c.id; pth.dataset.from=c.fromId; pth.dataset.to=c.toId;
    pth.addEventListener("click",(e)=>{e.stopPropagation();editConnection(c);});
    if(c.label){ const t=titleEl(c.label); pth.append(t); }
    svg.append(pth);
    // pins
    svg.append(pin(p1.x,p1.y,col), pin(p2.x,p2.y,col));
  }
}
export function path(d,col){
  const p=document.createElementNS("http://www.w3.org/2000/svg","path");
  p.setAttribute("d",d); p.setAttribute("fill","none"); p.setAttribute("stroke",col);
  p.setAttribute("stroke-width","2.2"); p.setAttribute("stroke-linecap","round"); return p;
}
export function pin(x,y,col){
  const g=document.createElementNS("http://www.w3.org/2000/svg","g");
  const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
  c.setAttribute("cx",x);c.setAttribute("cy",y);c.setAttribute("r","5");c.setAttribute("fill",col);
  c.setAttribute("stroke","#fff");c.setAttribute("stroke-width","1.5");
  const hl=document.createElementNS("http://www.w3.org/2000/svg","circle");
  hl.setAttribute("cx",x-1.5);hl.setAttribute("cy",y-1.5);hl.setAttribute("r","1.4");hl.setAttribute("fill","rgba(255,255,255,.7)");
  g.append(c,hl); return g;
}
export function titleEl(text){ const t=document.createElementNS("http://www.w3.org/2000/svg","title"); t.textContent=text; return t; }

export function highlightFor(kind,id,on){
  const svg=document.querySelector("svg.threads"); if(!svg) return;
  const paths=[...svg.querySelectorAll("path[data-conn]")]; if(!paths.length) return;
  if(!on){ svg.classList.remove("dim"); paths.forEach(p=>p.classList.remove("lit")); return; }
  svg.classList.add("dim");
  paths.forEach(p=>{
    const lit = (p.dataset.from===id)||(p.dataset.to===id);
    p.classList.toggle("lit",lit);
  });
}
export function editConnection(c){
  const label=h("input.txt",{value:c.label||"",placeholder:"Why are these connected? e.g. her fear drives the cut"});
  openModal({eyebrow:c.type==="attribute-beat"?"Payoff thread":"Presence thread",title:"Thread note",
    body:h("div",null,
      h("p",{style:{color:"var(--ink-soft)",fontSize:"14px",margin:"0 0 4px"}}, threadDesc(c)),
      h("label.field",null,h("span.lab",null,"Note (optional)"),label)),
    saveLabel:"Save note",
    extraFoot:h("button.btn.danger.sm",{style:{marginRight:"auto"},onclick:()=>{ Store.mutate(s=>s.connections=s.connections.filter(x=>x.id!==c.id)); closeModal(); }},"Delete thread"),
    onSave:()=>Store.mutate(s=>{const cc=s.connections.find(x=>x.id===c.id); if(cc)cc.label=label.value;})});
}
export function threadDesc(c){
  if(c.type==="attribute-beat"){ const a=M.attr(c.fromId),b=M.beat(c.toId); return `“${a?.label||"?"}” pays off in beat “${b?.title||"?"}”`; }
  const p=M.pro(c.fromId),sc=M.scene(c.toId); return `${p?.name||"?"} is present in scene “${sc?.title||"?"}”`;
}
