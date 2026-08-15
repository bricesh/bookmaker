/* === mobile.js — phone experience (≤768px) ===
   The desktop board is a spatial pinboard; on a phone it becomes a paged,
   one-scene-at-a-time view for review, capture, and quick edits. Threads are
   shown as tappable context on cards (not drawn), and created by tapping.
   Heavy structural work (drawing string, big reorders) stays on desktop. */
import { h, M, byOrder, uid, statusOf, STATUSES, STATUS_META, THREAD_RED, deleteBeat } from "./models.js";
import { openModal, closeModal, toast } from "./ui.js";
import { Store, downloadBackup, restoreBackup } from "./store.js";
import { editBeat } from "./workspace.js";
import { editScene } from "./config.js";

export function isMobile(){ return window.matchMedia("(max-width: 768px)").matches; }

let currentSceneId = null;   // preserved across re-renders so edits don't jump you back to scene 1

/* ---------- bottom tab bar ---------- */
export function renderTabbar(route){
  let bar = document.getElementById("tabbar");
  if(!isMobile()){ if(bar) bar.remove(); return; }
  const tab = (href,label)=>h("a.m-tab"+(route===href?".active":""),{href:"#"+href}, label);
  const el = h("nav.tabbar",null,
    tab("/bible","Bible"), tab("/cast","Cast"), tab("/structure","Structure"), tab("/board","Board"),
    h("button.m-tab",{onclick:openMoreSheet},"More"));
  el.id = "tabbar";
  if(bar) bar.replaceWith(el); else document.body.append(el);
}
function openMoreSheet(){
  const a = Store.auth;
  const body = h("div",null,
    h(".m-more-status",null, h("span.lab-inline",null,"Sync"), h("span",null, Store.status || "—")),
    a ? h(".m-more-status",null, h("span.lab-inline",null,"Account"), h("span",null, a.email)) : "",
    h("div",{style:{marginTop:"14px",display:"flex",flexDirection:"column",gap:"10px"}},
      Store.authActions
        ? (a ? h("button.btn",{onclick:()=>{ Store.authActions.signOut(); closeModal(); }},"Sign out")
             : h("button.btn.primary",{onclick:()=>{ Store.authActions.signIn(); closeModal(); }},"Sign in to sync"))
        : "",
      h("button.btn",{onclick:()=>{ downloadBackup(); }},"Back up (download JSON)"),
      h("button.btn",{onclick:()=>{ restoreBackup(); }},"Restore from backup")
    )
  );
  openModal({eyebrow:"Story Board",title:"More",body,saveLabel:"Done",onSave:()=>{}});
}

/* ---------- paged-scenes board ---------- */
export function renderMobileBoard(app){
  const s = Store.state;
  const chapters = s.chapters.slice().sort(byOrder);
  const scenes = [];
  chapters.forEach(ch => M.scenesOf(ch.id).forEach(sc => scenes.push({sc,ch})));

  if(!scenes.length){
    app.append(h(".m-empty",null,
      h("h2",null,"No scenes yet"),
      h("p",null,"Add chapters and scenes in Structure, then swipe through them here."),
      h("button.btn.primary",{onclick:()=>location.hash="#/structure"},"Go to Structure")));
    return;
  }
  if(!scenes.some(x=>x.sc.id===currentSceneId)) currentSceneId = scenes[0].sc.id;
  const idx = scenes.findIndex(x=>x.sc.id===currentSceneId);

  const board = h(".m-board");

  // pager bar: prev / jump / next
  const jump = h("select.m-scene-jump", null,
    ...scenes.map((x,i)=>h("option",{value:x.sc.id, selected:x.sc.id===currentSceneId}, (i+1)+". "+x.sc.title)));
  jump.addEventListener("change",()=>scrollToScene(jump.value));
  const bar = h(".m-pager-bar",null,
    h("button.m-nav",{onclick:()=>scenes[idx-1]&&scrollToScene(scenes[idx-1].sc.id),disabled:idx<=0,"aria-label":"Previous scene"},"‹"),
    jump,
    h("span.m-count",null,(idx+1)+" / "+scenes.length),
    h("button.m-nav",{onclick:()=>scenes[idx+1]&&scrollToScene(scenes[idx+1].sc.id),disabled:idx>=scenes.length-1,"aria-label":"Next scene"},"›"));
  board.append(bar);

  // pages
  const pager = h(".m-pager");
  scenes.forEach(({sc,ch})=>pager.append(scenePage(sc,ch)));
  board.append(pager);
  app.append(board);

  // restore scroll position + track current scene
  requestAnimationFrame(()=>{
    const el = pager.querySelector(`.m-page[data-scene-id="${currentSceneId}"]`);
    if(el) pager.scrollLeft = el.offsetLeft;
  });
  let t=null;
  pager.addEventListener("scroll",()=>{
    clearTimeout(t);
    t=setTimeout(()=>{
      const mid = pager.scrollLeft + pager.clientWidth/2;
      let best=null, bestD=Infinity;
      pager.querySelectorAll(".m-page").forEach(pg=>{
        const c = pg.offsetLeft + pg.clientWidth/2, d=Math.abs(c-mid);
        if(d<bestD){ bestD=d; best=pg; }
      });
      if(best && best.dataset.sceneId!==currentSceneId){
        currentSceneId = best.dataset.sceneId;
        const i = scenes.findIndex(x=>x.sc.id===currentSceneId);
        jump.value = currentSceneId;
        board.querySelector(".m-count").textContent = (i+1)+" / "+scenes.length;
        board.querySelector('.m-nav[aria-label="Previous scene"]').disabled = i<=0;
        board.querySelector('.m-nav[aria-label="Next scene"]').disabled = i>=scenes.length-1;
      }
    },80);
  });

  function scrollToScene(id){
    const el = pager.querySelector(`.m-page[data-scene-id="${id}"]`);
    if(el) pager.scrollTo({left:el.offsetLeft, behavior:"smooth"});
  }
}

function scenePage(sc,ch){
  const s = Store.state;
  const page = h(".m-page"); page.dataset.sceneId = sc.id;
  const inner = h(".m-page-inner");

  // scene header
  inner.append(h(".m-scene-head",null,
    h(".m-crumb",null, ch.title),
    h(".m-title-row",null,
      h("h2",null, sc.title),
      h("button.btn.sm.ghost",{onclick:()=>editScene(ch,sc)},"Edit")),
    sc.description && h("p.m-desc",null, sc.description),
    h(".m-meta",null, statusSelect(sc,"scene"),
      Number.isFinite(sc.emotionalValue) ? h("span.ev-badge",null,(sc.emotionalValue>0?"+":"")+sc.emotionalValue) : "")
  ));

  // presence
  const pres = s.connections.filter(c=>c.type==="protagonist-scene"&&c.toId===sc.id)
    .map(c=>({c, p:M.pro(c.fromId)})).filter(x=>x.p);
  const presChips = h(".m-chips");
  pres.forEach(({c,p})=>presChips.append(chip(p.name,p.color,()=>removeConn(c.id))));
  presChips.append(h("button.m-add-chip",{onclick:()=>pickPresence(sc)},"+ character"));
  inner.append(h(".m-section-label",null,"Present in this scene"), presChips);

  // beats
  inner.append(h(".m-section-label",null,"Beats"));
  M.beatsOf(sc.id).forEach(b=>inner.append(mBeat(b,sc)));
  inner.append(h("button.m-add",{onclick:()=>editBeat(sc)},"+ Add beat"));

  page.append(inner);
  return page;
}

function mBeat(b,sc){
  const s = Store.state;
  const st = statusOf(b);
  const card = h(".m-beat."+STATUS_META[st].cls);
  card.append(h(".m-beat-top",null,
    h("h3",null, b.title||"(untitled)"),
    h("span.m-status-dot",{title:STATUS_META[st].label})));
  if(b.content) card.append(h("p.m-beat-body",null, b.content));

  const links = s.connections.filter(c=>c.type==="attribute-beat"&&c.toId===b.id);
  if(links.length){
    const chips = h(".m-chips");
    links.forEach(c=>{
      const a = M.attr(c.fromId);
      const p = a ? s.protagonists.find(x=>x.attributes.some(y=>y.id===a.id)) : null;
      chips.append(chip((a?.label||"?")+(p?" · "+p.name:""), THREAD_RED, ()=>removeConn(c.id)));
    });
    card.append(h(".m-section-label.sm",null,"Pays off"), chips);
  }

  card.append(h(".m-beat-actions",null,
    h("button.btn.sm",{onclick:()=>editBeat(sc,b)},"Edit"),
    h("button.btn.sm",{onclick:()=>pickAttr(b)},"+ Link"),
    h("button.btn.sm.danger",{onclick:()=>deleteBeat(b.id)},"Delete")));
  return card;
}

/* ---------- controls & pickers ---------- */
function statusSelect(o, kind){
  const st = statusOf(o);
  return h("select.m-status-sel",{onchange:e=>Store.mutate(s=>{
      const x = kind==="scene" ? M.scene(o.id) : M.beat(o.id); if(x) x.status=e.target.value; })},
    ...STATUSES.map(v=>h("option",{value:v,selected:st===v},STATUS_META[v].label)));
}
function chip(label,color,onRemove){
  const c = h(".m-chip");
  if(color){ const d=h("span.m-dot"); d.style.background=color; c.append(d); }
  c.append(h("span.m-chip-label",null,label));
  if(onRemove) c.append(h("button.m-chip-x",{onclick:onRemove,"aria-label":"Remove"},"✕"));
  return c;
}
function pickAttr(beat){
  const s = Store.state;
  const linked = new Set(s.connections.filter(c=>c.type==="attribute-beat"&&c.toId===beat.id).map(c=>c.fromId));
  const body = h("div.m-picklist");
  s.protagonists.slice().sort(byOrder).forEach(p=>{
    const rows = p.attributes.slice().sort(byOrder).filter(a=>!linked.has(a.id));
    if(!rows.length) return;
    const sw=h("span.swatch",{style:{width:"12px",height:"12px"}}); sw.style.background=p.color;
    body.append(h(".m-pick-group",null, sw, h("span",null,p.name)));
    rows.forEach(a=>body.append(h("button.m-pick-row",{onclick:()=>{ addConn("attribute-beat",a.id,beat.id,THREAD_RED); closeModal(); }},
      a.label||"(untitled)")));
  });
  if(!body.children.length) body.append(h("p",{style:{color:"var(--ink-soft)",padding:"10px 2px"}},"No more attributes to link. Add attributes in the Cast tab."));
  openModal({eyebrow:"Link a payoff",title:"Which trait pays off here?",body,saveLabel:"Done",onSave:()=>{}});
}
function pickPresence(sc){
  const s = Store.state;
  const present = new Set(s.connections.filter(c=>c.type==="protagonist-scene"&&c.toId===sc.id).map(c=>c.fromId));
  const body = h("div.m-picklist");
  s.protagonists.slice().sort(byOrder).forEach(p=>{
    if(present.has(p.id)) return;
    const sw=h("span.swatch",{style:{width:"12px",height:"12px"}}); sw.style.background=p.color;
    body.append(h("button.m-pick-row",{onclick:()=>{ addConn("protagonist-scene",p.id,sc.id,p.color); closeModal(); }}, sw, h("span",null,p.name)));
  });
  if(!body.children.length) body.append(h("p",{style:{color:"var(--ink-soft)",padding:"10px 2px"}},"Everyone's already here (or add characters in the Cast tab)."));
  openModal({eyebrow:"Mark presence",title:"Who's in this scene?",body,saveLabel:"Done",onSave:()=>{}});
}
function addConn(type,fromId,toId,color){
  Store.mutate(s=>{
    if(!s.connections.some(c=>c.type===type&&c.fromId===fromId&&c.toId===toId))
      s.connections.push({id:uid("con"),type,fromId,toId,label:"",color});
  });
  toast("Linked");
}
function removeConn(id){ Store.mutate(s=>s.connections=s.connections.filter(c=>c.id!==id)); }
