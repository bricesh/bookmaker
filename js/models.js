import { Store } from "./store.js";

/* === utils — ids, dom helpers, palettes, status === */
export const uid = (p) => p + "_" + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
export const nextOrder = (arr) => arr.length ? Math.max(...arr.map(x=>x.order??0)) + 1 : 0;
export const byOrder = (a,b) => (a.order??0)-(b.order??0);
export const esc = (s) => (s??"").toString();

/** tiny hyperscript: h('div.cls#id', {attr}, ...children) */
export function h(sel, props, ...kids){
  const m = sel.match(/^([a-z0-9]+)?/i)[1] || "div";
  const el = document.createElement(m);
  const idm = sel.match(/#([\w-]+)/); if(idm) el.id = idm[1];
  const cls = [...sel.matchAll(/\.([\w-]+)/g)].map(x=>x[1]); if(cls.length) el.className = cls.join(" ");
  if(props) for(const [k,v] of Object.entries(props)){
    if(v==null||v===false) continue;
    if(k==="class") el.className += " "+v;
    else if(k==="style" && typeof v==="object") Object.assign(el.style,v);
    else if(k.startsWith("on") && typeof v==="function") el.addEventListener(k.slice(2).toLowerCase(),v);
    else if(k==="html") el.innerHTML = v;
    else if(k in el && k!=="list") { try{ el[k]=v; }catch{ el.setAttribute(k,v); } }
    else el.setAttribute(k,v);
  }
  for(const kid of kids.flat()){ if(kid==null||kid===false) continue; el.append(kid.nodeType?kid:document.createTextNode(kid)); }
  return el;
}

/* palettes — muted editorial; protagonist colours reserve red */
export const THREAD_RED = "#963a31";
export const PRO_COLORS = ["#4f7d70","#4a6076","#8a7b4a","#6d5f7a","#5e7350","#54707a","#9a6f52","#707a54","#5b6b6f","#836a6a"];
export const TYPE_COLORS = ["#7c847a","#4f7d70","#4a6076","#8a7b4a","#6d5f7a","#5e7350","#9a6f52",null];

/* v2: scene/beat status */
export const STATUSES = ["idea","drafting","drafted","cut-candidate"];
export const STATUS_META = {
  idea:{label:"Idea",cls:"st-idea"}, drafting:{label:"Drafting",cls:"st-drafting"},
  drafted:{label:"Drafted",cls:"st-drafted"}, "cut-candidate":{label:"Cut?",cls:"st-cut"}
};
export function statusOf(o){ return STATUSES.includes(o?.status)? o.status : "idea"; }
export function short(str,n){ str=str||""; return str.length>n? str.slice(0,n-1)+"…" : str; }

/* === models — accessors, cascade deletes, chains === */
export const M = {
  type:(id)=>Store.state.attributeTypes.find(t=>t.id===id),
  pro:(id)=>Store.state.protagonists.find(p=>p.id===id),
  attr:(id)=>{ for(const p of Store.state.protagonists){ const a=p.attributes.find(x=>x.id===id); if(a) return a; } },
  scene:(id)=>Store.state.scenes.find(s=>s.id===id),
  beat:(id)=>Store.state.beats.find(b=>b.id===id),
  scenesOf:(chId)=>Store.state.scenes.filter(s=>s.chapterId===chId).sort(byOrder),
  beatsOf:(scId)=>Store.state.beats.filter(b=>b.sceneId===scId).sort(byOrder),
};

export function deleteProtagonist(id){
  Store.mutate(s=>{
    const p = s.protagonists.find(x=>x.id===id); if(!p) return;
    const attrIds = new Set(p.attributes.map(a=>a.id));
    s.connections = s.connections.filter(c=>!(c.type==="attribute-beat"&&attrIds.has(c.fromId)) && !(c.type==="protagonist-scene"&&c.fromId===id));
    for(const ch of s.chapters) ch.castIds = (ch.castIds||[]).filter(x=>x!==id);
    s.protagonists = s.protagonists.filter(x=>x.id!==id);
  });
}
export function deleteAttribute(id){
  Store.mutate(s=>{
    for(const p of s.protagonists){
      p.attributes = p.attributes.filter(a=>a.id!==id);
      for(const a of p.attributes) if(a.supersedes===id) a.supersedes=null; // successor becomes a root
    }
    s.connections = s.connections.filter(c=>!(c.type==="attribute-beat"&&c.fromId===id));
  });
}
export function deleteChapter(id){
  Store.mutate(s=>{
    const scIds = s.scenes.filter(x=>x.chapterId===id).map(x=>x.id);
    const beatIds = new Set(s.beats.filter(b=>scIds.includes(b.sceneId)).map(b=>b.id));
    s.connections = s.connections.filter(c=>!(c.type==="protagonist-scene"&&scIds.includes(c.toId)) && !(c.type==="attribute-beat"&&beatIds.has(c.toId)));
    for(const p of s.protagonists) for(const a of p.attributes) if(beatIds.has(a.createdInBeatId)) a.createdInBeatId=null;
    s.beats = s.beats.filter(b=>!scIds.includes(b.sceneId));
    s.scenes = s.scenes.filter(x=>x.chapterId!==id);
    s.chapters = s.chapters.filter(x=>x.id!==id);
    if(s.ui.activeChapterId===id) s.ui.activeChapterId = s.chapters[0]?.id||null;
  });
}
export function deleteScene(id){
  Store.mutate(s=>{
    const beatIds = new Set(s.beats.filter(b=>b.sceneId===id).map(b=>b.id));
    s.connections = s.connections.filter(c=>!(c.type==="protagonist-scene"&&c.toId===id) && !(c.type==="attribute-beat"&&beatIds.has(c.toId)));
    for(const p of s.protagonists) for(const a of p.attributes) if(beatIds.has(a.createdInBeatId)) a.createdInBeatId=null;
    s.beats = s.beats.filter(b=>b.sceneId!==id);
    s.scenes = s.scenes.filter(x=>x.id!==id);
  });
}
export function deleteBeat(id){
  Store.mutate(s=>{
    s.connections = s.connections.filter(c=>!(c.type==="attribute-beat"&&c.toId===id));
    for(const p of s.protagonists) for(const a of p.attributes) if(a.createdInBeatId===id) a.createdInBeatId=null; // soft ref
    s.beats = s.beats.filter(b=>b.id!==id);
  });
}
/** generic move within a sibling list (by order) */
export function move(list, id, dir){
  const arr = [...list].sort(byOrder);
  const i = arr.findIndex(x=>x.id===id); const j=i+dir;
  if(i<0||j<0||j>=arr.length) return;
  const a=arr[i].order, b=arr[j].order; arr[i].order=b; arr[j].order=a;
}
