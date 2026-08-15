import { chainsOf, editAttribute, typeTag } from "./characters.js";
import { editScene, removeScene } from "./config.js";
import { M, STATUSES, STATUS_META, byOrder, deleteAttribute, deleteBeat, h, move, nextOrder, short, statusOf, uid } from "./models.js";
import { Store } from "./store.js";
import { completeLink, drawThreads, highlightFor, path, pin, startLink } from "./threads.js";
import { closeModal, openModal, toast, toolRow } from "./ui.js";

/* === board (workspace) === */
export const LINK = { from:null }; // {kind:'attribute'|'protagonist', id}
export let CURRENT = null;         // current board refs for thread redraws
export function scheduleDraw(){
  if(!CURRENT || CURRENT._raf) return;
  CURRENT._raf = requestAnimationFrame(()=>{ CURRENT._raf=null; drawThreads(CURRENT.svg,CURRENT.board); });
}

export function renderBoard(app){
  const s=Store.state;
  const view=h(".board-view");

  // board bar
  const bar=h(".board-bar");
  const seg=h(".seg",null,
    h("button"+(s.ui.chapterView==="all"?".on":""),{onclick:()=>Store.mutate(st=>st.ui.chapterView="all")},"All chapters"),
    h("button"+(s.ui.chapterView==="single"?".on":""),{onclick:()=>Store.mutate(st=>{st.ui.chapterView="single"; st.ui.activeChapterId ??= st.chapters.sort(byOrder)[0]?.id||null;})},"One chapter"));
  bar.append(h("span.hint",null,"View:"),seg);
  if(s.ui.chapterView==="single" && s.chapters.length){
    const sel=h("select.txt",{onchange:e=>Store.mutate(st=>st.ui.activeChapterId=e.target.value)},
      ...s.chapters.sort(byOrder).map(c=>h("option",{value:c.id,selected:s.ui.activeChapterId===c.id},c.title)));
    bar.append(sel);
  }
  bar.append(h("span.hint",{style:{marginLeft:"auto"}},
    LINK.from ? "Drawing a thread — click a "+(LINK.from.kind==="attribute"?"beat":"scene")+" to finish, Esc to cancel" :
    "Hover a card's dot to pull a thread"));
  view.append(bar);
  if(s.ui.biblePinned) view.append(bibleStrip());

  const board=h(".board");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("class","threads");
  board.append(svg);

  if(!s.chapters.length || !s.protagonists.length){
    board.append(h(".board-empty",null,
      h("h2",null,"Your board is empty"),
      h("p",null,"Add your ", el_link("Cast"), " and ", el_link("Structure"),
        " (chapters & scenes), then come back to pin beats and threads.")));
    view.append(board); app.append(view); return;
  }

  // which chapters are visible
  let chapters = s.chapters.sort(byOrder);
  if(s.ui.chapterView==="single") chapters = chapters.filter(c=>c.id===s.ui.activeChapterId);

  if(s.ui.contourVisible) view.append(contourPanel(chapters));

  // CAST PANE — scrolls vertically on its own
  const castPane=h(".cast-pane");
  const castIds = new Set(chapters.flatMap(c=>c.castIds||[]));
  const railPros = s.protagonists.sort(byOrder).filter(p=>castIds.has(p.id));
  const rail=h(".cast-rail",null,h(".rail-label",null,"Cast"));
  if(!railPros.length){
    rail.append(h(".rail-empty",null,"No cast in "+(s.ui.chapterView==="single"?"this chapter":"these chapters")+" yet. Assign them in ", el_link("Structure"),"."));
  }
  railPros.forEach(p=>rail.append(proCard(p)));
  castPane.append(rail);

  // GRID PANE — scrolls both axes, independent of the cast pane
  const gridPane=h(".grid-pane");
  const flow=h(".chapters-flow");
  chapters.forEach(ch=>{
    const band=h(".chapter-band",null,h("span.band-label",null,ch.title));
    const row=h(".scenes-row");
    M.scenesOf(ch.id).forEach(sc=>row.append(sceneCol(sc)));
    row.append(h("button.add-beat.add-scene-col",{onclick:()=>editScene(ch)},"+ Scene"));
    band.append(row); flow.append(band);
  });
  gridPane.append(flow);

  board.append(castPane, gridPane);
  view.append(board);
  app.append(view);

  // threads live in board space; redraw when either pane scrolls or things resize
  CURRENT = {svg,board,_raf:null};
  castPane.addEventListener("scroll",scheduleDraw);
  gridPane.addEventListener("scroll",scheduleDraw);
  new ResizeObserver(scheduleDraw).observe(gridPane);
  new ResizeObserver(scheduleDraw).observe(castPane);
  if(!window._threadResizeWired){ window._threadResizeWired=true; window.addEventListener("resize",scheduleDraw); }
  scheduleDraw();
}

/* Story Bible — read-only strip on the board */
export function bibleStrip(){
  const s=Store.state, b=s.bible||{};
  const collapsed=s.ui.bibleCollapsed;
  const strip=h(".bible-strip");
  strip.append(h(".bible-head",null,
    h("button.bible-caret",{title:collapsed?"Expand":"Collapse",onclick:()=>Store.mutate(st=>st.ui.bibleCollapsed=!st.ui.bibleCollapsed)}, collapsed?"▸":"▾"),
    h("span.bible-label",null,"Story Bible"),
    h("a.bible-edit",{href:"#/bible"},"edit")));
  if(!collapsed){
    const cell=(label,val)=> h(".bible-cell",null,h("span.bl",null,label), h("span.bv",null, (val&&val.trim())? val : "—"));
    strip.append(h(".bible-body",null, cell("Thesis",b.thesis), cell("Tonal rules",b.tonalRules)));
  }
  return strip;
}

/* Emotional Contour — line chart of scene emotionalValue in story order */
export function contourPanel(chapters){
  const scenes=[]; chapters.forEach(ch=>M.scenesOf(ch.id).forEach(sc=>scenes.push(sc)));
  const pts=scenes.filter(sc=>Number.isFinite(sc.emotionalValue));
  const panel=h(".contour",null, h(".contour-head",null,
    h("span.bible-label",null,"Emotional contour"),
    h("span.contour-hint",null,"how the reader feels, scene by scene")));
  if(pts.length<2){
    panel.append(h(".contour-empty",null,"Set an emotional value (−5…+5) on at least two scenes to see the contour — it reveals emotional monotony a card list hides."));
    return panel;
  }
  const NS="http://www.w3.org/2000/svg";
  const H=136, PAD=28, SP=Math.max(60,Math.min(120, 820/(pts.length-1))), W=PAD*2+(pts.length-1)*SP;
  const yFor=v=> PAD + (5-v)/10*(H-2*PAD-14);
  const svg=document.createElementNS(NS,"svg"); svg.setAttribute("class","contour-svg");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.setAttribute("width",W); svg.setAttribute("height",H);
  const mk=(t,attrs)=>{ const e=document.createElementNS(NS,t); for(const k in attrs) e.setAttribute(k,attrs[k]); return e; };
  [[5,"+5"],[0,"0"],[-5,"−5"]].forEach(([v,lbl])=>{
    const y=yFor(v);
    svg.append(mk("line",{x1:PAD-6,x2:W-PAD+6,y1:y,y2:y,stroke:v===0?"#9aa89c":"#cdd6cc","stroke-dasharray":v===0?"":"3 4"}));
    const t=mk("text",{x:3,y:y+3,class:"contour-axis"}); t.textContent=lbl; svg.append(t);
  });
  let d=""; pts.forEach((sc,i)=>{ const x=PAD+i*SP,y=yFor(sc.emotionalValue); d+=(i?" L ":"M ")+x+" "+y; });
  svg.append(mk("path",{d,fill:"none",stroke:"#4f7d70","stroke-width":2.4,"stroke-linejoin":"round"}));
  pts.forEach((sc,i)=>{ const x=PAD+i*SP,y=yFor(sc.emotionalValue);
    const c=mk("circle",{cx:x,cy:y,r:4.5,fill:"#4f7d70",stroke:"#fff","stroke-width":1.5});
    const tt=document.createElementNS(NS,"title"); tt.textContent=sc.title+" ("+(sc.emotionalValue>0?"+":"")+sc.emotionalValue+")"; c.append(tt); svg.append(c);
    const lab=mk("text",{x,y:H-5,"text-anchor":"middle",class:"contour-lab"}); lab.textContent=short(sc.title,10); svg.append(lab);
  });
  panel.append(h(".contour-scroll",null,svg));
  return panel;
}

/* Story Bible page */
export function renderBible(app){
  const b=Store.state.bible;
  const page=h(".page");
  page.append(h(".page-head",null,h("div",null,h(".eyebrow",null,"The argument the structure serves"),h("h1",null,"Story Bible"))));
  page.append(h("p.page-intro",null,"The constitution of the book — what it argues, how change happens, the rules you must not break. Kept in your eye-line while you arrange scenes."));
  const fld=(key,label,ph)=>{ const ta=h("textarea.txt",{placeholder:ph}); ta.value=b[key]||"";
    ta.addEventListener("change",()=>Store.mutate(s=>s.bible[key]=ta.value)); return h("label.field",null,h("span.lab",null,label),ta); };
  page.append(
    fld("logline","Logline","One or two sentences: whose story, what crisis, what's at stake."),
    fld("thesis","Thesis — what the book teaches","In prose, carried by the story — never a checklist."),
    fld("theoryOfChange","Theory of change","How change actually happens in this world. Governs whether the ending rings true."),
    fld("tonalRules","Tonal rules","Load-bearing constraints you must not violate."),
    fld("openQuestions","Open questions","Unresolved decisions — what you don't know yet.")
  );
  app.append(page);
}
export function el_link(label){ return h("a",{href:"#/"+label.toLowerCase()},label); }

export const EXPANDED_PROS = new Set(); // board-session UI state (not persisted → collapsed on reload)
export function isTied(a){
  if(a.createdInBeatId) return true;
  return Store.state.connections.some(c=>c.type==="attribute-beat"&&c.fromId===a.id);
}
export function proCard(p){
  const card=h(".pro-card"); card.style.setProperty("--pc",p.color);
  card.dataset.proId=p.id;
  const pin=h("span.pin.pin"); pin.style.setProperty("--pin",p.color);
  const sw=h("span.swatch"); sw.style.background=p.color;
  const anchor=h("button.btn.ghost.sm",{title:"Draw presence thread from "+p.name,
    onclick:()=>startLink("protagonist",p.id)},"⚲ scene");
  card.append(pin, h(".pro-head",null,sw,h("h3",null,p.name)));

  const wrap=h(".mini-attrs");
  const {info}=chainsOf(p);
  const expanded=EXPANDED_PROS.has(p.id);
  let untied=0;
  p.attributes.sort(byOrder).forEach(a=>{
    const node=miniAttr(a,p,info.get(a.id));
    const tied=isTied(a);
    node.dataset.tied = tied?"1":"0";
    if(!tied){ untied++; if(!expanded) node.classList.add("hidden-attr"); }
    wrap.append(node);
  });
  if(untied){
    const lbl=(exp)=> exp? "Hide "+untied+" untied" : "+ "+untied+" more attribute"+(untied>1?"s":"");
    const toggle=h("button.attr-toggle",null,lbl(expanded));
    toggle.addEventListener("click",()=>{
      const now=!EXPANDED_PROS.has(p.id);
      now? EXPANDED_PROS.add(p.id) : EXPANDED_PROS.delete(p.id);
      wrap.querySelectorAll('.att[data-tied="0"]').forEach(n=>n.classList.toggle("hidden-attr",!now));
      toggle.textContent=lbl(now);
      scheduleDraw(); // heights changed → re-lay threads
    });
    wrap.append(toggle);
  }
  wrap.append(h("button.add-beat",{style:{fontSize:"11px",padding:"6px"},onclick:()=>editAttribute(p)},"+ attribute"));
  card.append(wrap, h("div",{style:{marginTop:"8px"}},anchor));
  return card;
}
export function miniAttr(a,p,pos){
  const node=h(".att"); node.dataset.attId=a.id;
  const dot=h("button.anchor",{title:"Pull a payoff thread to a beat",onclick:(e)=>{e.stopPropagation();startLink("attribute",a.id);}});
  const arc = pos && pos.len>1 ? h("span.arc-mini",{title:"Arc stage"}, (pos.i+1)+"/"+pos.len) : null;
  node.append(typeTag(a.typeId), arc, h("h4",null,a.label||"(untitled)"), a.content&&h("p",null,a.content), dot,
    toolRow([{label:"Edit",on:()=>editAttribute(p,a)},{label:"✕",cls:"danger",on:()=>deleteAttribute(a.id)}]));
  node.addEventListener("mouseenter",()=>highlightFor("attribute",a.id,true));
  node.addEventListener("mouseleave",()=>highlightFor("attribute",a.id,false));
  return node;
}
export function sceneCol(sc){
  const col=h(".scene-col");
  const st=statusOf(sc);
  const head=h(".scene-head."+STATUS_META[st].cls); head.dataset.sceneId=sc.id;
  const anchor=h("span.anchor-scene",{title:"Finish a presence thread here"});
  const statusSel=h("select.status-pill",{title:"Scene status",
    onchange:e=>Store.mutate(s=>{ const x=M.scene(sc.id); x.status=e.target.value; })},
    ...STATUSES.map(v=>h("option",{value:v,selected:st===v},STATUS_META[v].label)));
  const ev = Number.isFinite(sc.emotionalValue)
    ? h("span.ev-badge",{title:"Emotional value"}, (sc.emotionalValue>0?"+":"")+sc.emotionalValue) : "";
  head.append(anchor,
    h(".scene-head-top",null, statusSel, ev),
    h("h4",null,sc.title), sc.description&&h("p",null,sc.description),
    toolRow([{label:"Edit",on:()=>editScene(chapterOf(sc),sc)},{label:"✕",cls:"danger",on:()=>removeScene(sc)}]));
  head.addEventListener("click",(e)=>{ if(e.target.closest("select,.row-tools"))return; if(LINK.from?.kind==="protagonist") completeLink("scene",sc.id); });
  head.addEventListener("mouseenter",()=>highlightFor("scene",sc.id,true));
  head.addEventListener("mouseleave",()=>highlightFor("scene",sc.id,false));
  col.append(head);
  M.beatsOf(sc.id).forEach(b=>col.append(beatCard(b,sc)));
  col.append(h("button.add-beat",{onclick:()=>editBeat(sc)},"+ Beat"));
  return col;
}
export function chapterOf(sc){ return Store.state.chapters.find(c=>c.id===sc.chapterId); }

export function beatCard(b,sc){
  const st=statusOf(b);
  const node=h(".beat."+STATUS_META[st].cls,{draggable:"true"}); node.dataset.beatId=b.id;
  node.append(
    h("span.beat-status",{title:"Status: "+STATUS_META[st].label}),
    h("span.drag",{title:"Drag to reorder"},"⋮⋮"),
    h("h4",null,b.title||"(untitled)"), b.content&&h("p",null,b.content),
    toolRow([{label:"Edit",on:()=>editBeat(sc,b)},{label:"✕",cls:"danger",on:()=>deleteBeat(b.id)}]));
  node.addEventListener("click",(e)=>{ if(e.target.closest(".row-tools"))return; if(LINK.from?.kind==="attribute") completeLink("beat",b.id); });
  node.addEventListener("mouseenter",()=>highlightFor("beat",b.id,true));
  node.addEventListener("mouseleave",()=>highlightFor("beat",b.id,false));
  wireBeatDnD(node,b,sc);
  return node;
}
export function editBeat(sc,b){
  const title=h("input.txt",{value:b?.title||"",placeholder:"e.g. Maya cuts the feature"});
  const content=h("textarea.txt",{placeholder:"Dialogue, location, action, notes — all together, however you like."}); content.value=b?.content||"";
  const st=b?statusOf(b):"idea";
  const statusSel=h("select.txt",null,...STATUSES.map(v=>h("option",{value:v,selected:st===v},STATUS_META[v].label)));
  const foot = b ? h("button.btn.ghost.sm",{style:{marginRight:"auto"},onclick:()=>{ closeModal(); newAttrFromBeat(b); }},"+ New attribute from this beat") : "";
  openModal({eyebrow:(b?"Edit":"New")+" beat · "+sc.title,title:b?"Edit beat":"Add beat",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Title"),title),
      h("label.field",null,h("span.lab",null,"What happens"),content),
      h("label.field",null,h("span.lab",null,"Status"),statusSel)),
    extraFoot:foot,
    onSave:()=>{const t=title.value.trim();if(!t){title.focus();return false;}
      Store.mutate(s=>{ if(b){b.title=t;b.content=content.value;b.status=statusSel.value;}
        else s.beats.push({id:uid("bea"),sceneId:sc.id,title:t,content:content.value,order:nextOrder(M.beatsOf(sc.id)),status:statusSel.value}); });}});
}
/** create an attribute whose origin is this beat; pick which character */
export function newAttrFromBeat(beat){
  const s=Store.state;
  if(!s.protagonists.length) return toast("Add a character first");
  const sel=h("select.txt",null,...s.protagonists.sort(byOrder).map(p=>h("option",{value:p.id},p.name)));
  const typeSel=h("select.txt",null,h("option",{value:""},"— Untyped —"),...s.attributeTypes.sort(byOrder).map(t=>h("option",{value:t.id},t.label)));
  const label=h("input.txt",{placeholder:"e.g. Impostor syndrome"});
  const content=h("textarea.txt",{placeholder:"The trait this beat reveals…"});
  openModal({eyebrow:"New attribute · from beat “"+(beat.title||"untitled")+"”",title:"Attribute from this beat",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Character"),sel),
      h("label.field",null,h("span.lab",null,"Type"),typeSel),
      h("label.field",null,h("span.lab",null,"Label"),label),
      h("label.field",null,h("span.lab",null,"Detail"),content)),
    onSave:()=>{const l=label.value.trim();if(!l){label.focus();return false;}
      Store.mutate(st=>{const p=st.protagonists.find(x=>x.id===sel.value);
        p.attributes.push({id:uid("att"),protagonistId:p.id,typeId:typeSel.value||null,label:l,content:content.value,order:nextOrder(p.attributes),createdInBeatId:beat.id,supersedes:null});});
      toast("Attribute saved to "+M.pro(sel.value).name);}});
}

/* ---- beat drag-reorder (within a scene) ---- */
export let DRAG=null;
export function wireBeatDnD(node,b,sc){
  node.addEventListener("dragstart",e=>{ DRAG={id:b.id,sceneId:sc.id}; node.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
  node.addEventListener("dragend",()=>{ node.classList.remove("dragging"); document.querySelectorAll(".drop-before,.drop-after").forEach(x=>x.classList.remove("drop-before","drop-after")); DRAG=null; });
  node.addEventListener("dragover",e=>{ if(!DRAG||DRAG.sceneId!==sc.id||DRAG.id===b.id)return; e.preventDefault();
    const r=node.getBoundingClientRect(); const after=e.clientY> r.top+r.height/2;
    node.classList.toggle("drop-after",after); node.classList.toggle("drop-before",!after); });
  node.addEventListener("dragleave",()=>node.classList.remove("drop-before","drop-after"));
  node.addEventListener("drop",e=>{ if(!DRAG||DRAG.sceneId!==sc.id||DRAG.id===b.id)return; e.preventDefault();
    const after=node.classList.contains("drop-after");
    reorderBeat(DRAG.id, b.id, after, sc.id); });
}
export function reorderBeat(dragId,targetId,after,sceneId){
  Store.mutate(s=>{
    const list=s.beats.filter(x=>x.sceneId===sceneId).sort(byOrder);
    const dragged=list.find(x=>x.id===dragId); if(!dragged)return;
    const rest=list.filter(x=>x.id!==dragId);
    const ti=rest.findIndex(x=>x.id===targetId);
    rest.splice(after?ti+1:ti,0,dragged);
    rest.forEach((x,i)=>x.order=i);
  });
}
