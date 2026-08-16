import { STATUSES, TYPE_COLORS, h, uid } from "./models.js";
import { confirmDlg, toast } from "./ui.js";

/* === store — state + cloud sync (Firebase is the single source of truth) === */
export const listeners = new Set();
let saveFlagEl = null, localChangeCb = null;
export function setSaveFlag(el){ saveFlagEl = el; if(saveFlagEl) saveFlagEl.textContent = Store.status; }
export function setStatus(text){ Store.status = text; if(saveFlagEl) saveFlagEl.textContent = text; }

export const Store = {
  state:null,
  status:"Sign in to save",   // shown in the rail
  connected:false,             // true when signed in + syncing
  auth:null,                   // {email} when signed in, else null
  authActions:null,            // {signIn, signOut} injected by the sync layer when Firebase is available
  /** start with an empty book in memory; the real book arrives from the cloud on sign-in */
  init(){ this.state = seed(); },
  /** every local edit → re-render + push to the cloud (no local storage) */
  mutate(fn){
    fn(this.state);
    this.state.project.updatedAt = new Date().toISOString();
    setStatus(this.connected ? "Syncing…" : "Not saved — sign in to save");
    emit();
    if(localChangeCb) localChangeCb(this.state);
  },
  subscribe(fn){ listeners.add(fn); },
  /** import a backup — replaces everything and pushes to the cloud */
  replace(doc){ this.state = migrate(doc); emit(); if(localChangeCb) localChangeCb(this.state); },
  /** adopt a cloud snapshot WITHOUT echoing it back (no localChangeCb) */
  applyRemote(doc){
    const inc = migrate(doc);
    if(JSON.stringify(inc) === JSON.stringify(this.state)) return; // echo of our own write → ignore
    this.state = inc;
    emit();
  },
  onLocalChange(cb){ localChangeCb = cb; },
  setAuth(user){ this.auth = user; emit(); }   // re-render rail on sign-in/out
};
export function emit(){ for(const fn of listeners) fn(Store.state); }

export function seed(){
  const now = new Date().toISOString();
  const types = ["Personality","Quote","Background","Want","Fear"]
    .map((label,i)=>({id:uid("atype"),label,order:i,color:TYPE_COLORS[i]??null}));
  return {
    schemaVersion:2,
    project:{id:uid("prj"),title:"Untitled book",createdAt:now,updatedAt:now},
    bible:{logline:"",thesis:"",theoryOfChange:"",tonalRules:"",openQuestions:""},
    attributeTypes:types,
    protagonists:[], chapters:[], scenes:[], beats:[], connections:[],
    ui:{threadsVisible:true, threadsFront:false, chapterView:"all", activeChapterId:null, biblePinned:false, bibleCollapsed:false, contourVisible:false}
  };
}
export function migrate(doc){
  doc.schemaVersion = 2;
  doc.attributeTypes ??= []; doc.protagonists ??= []; doc.chapters ??= [];
  doc.scenes ??= []; doc.beats ??= []; doc.connections ??= [];
  doc.ui ??= {};
  doc.ui.threadsVisible ??= true; doc.ui.threadsFront ??= false; doc.ui.chapterView ??= "all"; doc.ui.activeChapterId ??= null;
  doc.ui.biblePinned ??= false; doc.ui.bibleCollapsed ??= false; doc.ui.contourVisible ??= false;
  doc.bible ??= {logline:"",thesis:"",theoryOfChange:"",tonalRules:"",openQuestions:""};
  for(const ch of doc.chapters) ch.castIds ??= [];
  for(const p of doc.protagonists) for(const a of p.attributes) if(!("supersedes" in a)) a.supersedes = null;
  sanitize(doc);
  return doc;
}
/** enforce v2 field constraints (used on load and on import) */
export function sanitize(doc){
  for(const sc of doc.scenes){
    if(sc.status!=null && !STATUSES.includes(sc.status)) delete sc.status;
    if(sc.emotionalValue!=null){
      const v=Math.round(Number(sc.emotionalValue));
      if(!Number.isFinite(v)) delete sc.emotionalValue; else sc.emotionalValue=Math.max(-5,Math.min(5,v));
    }
  }
  for(const b of doc.beats){ if(b.status!=null && !STATUSES.includes(b.status)) delete b.status; }
  for(const p of doc.protagonists||[]){
    const ids=new Set(p.attributes.map(a=>a.id));
    const usedPred=new Set();
    for(const a of p.attributes){
      if(a.supersedes==null) continue;
      if(!ids.has(a.supersedes) || a.supersedes===a.id){ a.supersedes=null; continue; }  // same-protagonist, not self
      if(usedPred.has(a.supersedes)){ a.supersedes=null; continue; }                       // one-to-one predecessor
      usedPred.add(a.supersedes);
    }
    for(const a of p.attributes){ // break any cycles
      const seen=new Set(); let cur=a;
      while(cur && cur.supersedes){ if(seen.has(cur.id)){ cur.supersedes=null; break; } seen.add(cur.id); cur=p.attributes.find(x=>x.id===cur.supersedes); }
    }
  }
}

/* export / import */
export function downloadBackup(){
  const s = Store.state;
  const name = (s.project.title||"story").replace(/[^\w -]/g,"").trim().replace(/\s+/g,"-").toLowerCase();
  const stamp = new Date().toISOString().slice(0,10);
  const blob = new Blob([JSON.stringify(s,null,2)],{type:"application/json"});
  const a = h("a",{href:URL.createObjectURL(blob),download:`${name||"story"}-backup-${stamp}.json`});
  document.body.append(a); a.click(); a.remove();
  toast("Backup downloaded");
}
export function restoreBackup(){
  const inp = h("input",{type:"file",accept:"application/json",style:{display:"none"}});
  inp.addEventListener("change",()=>{
    const f = inp.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = async ()=>{
      let doc; try{ doc = JSON.parse(r.result); }catch{ return toast("That file isn't valid JSON"); }
      if(!doc || !doc.project){ return toast("That doesn't look like a Story Board backup"); }
      if(await confirmDlg("Restore this backup?","This replaces everything currently on your board. Download a backup first if you're unsure.","Restore")){
        Store.replace(doc); toast("Backup restored");
      }
    };
    r.readAsText(f);
  });
  document.body.append(inp); inp.click(); inp.remove();
}
