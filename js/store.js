import { STATUSES, TYPE_COLORS, h, uid } from "./models.js";
import { confirmDlg, toast } from "./ui.js";

/* === store — state, localStorage autosave, export/import === */
export const KEY = "storyBoard:v1";
export const listeners = new Set();
export let saveTimer = null, saveFlagEl = null;
export function setSaveFlag(el){ saveFlagEl = el; }

export const Store = {
  state:null,
  load(){
    let raw=null; try{ raw = localStorage.getItem(KEY); }catch{}
    if(raw){ try{ this.state = migrate(JSON.parse(raw)); return; }catch{} }
    this.state = seed();
    this.persist();
  },
  persist(){
    try{ localStorage.setItem(KEY, JSON.stringify(this.state)); flagSaved(); }
    catch(e){ flagSaved("Storage full — download a backup"); }
  },
  /** every mutation goes through here → autosave + re-render */
  mutate(fn){
    fn(this.state);
    this.state.project.updatedAt = new Date().toISOString();
    if(saveFlagEl) saveFlagEl.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>this.persist(), 250);
    emit();
  },
  subscribe(fn){ listeners.add(fn); },
  replace(doc){ this.state = migrate(doc); this.persist(); emit(); }
};
export function emit(){ for(const fn of listeners) fn(Store.state); }
export function flagSaved(msg){ if(saveFlagEl) saveFlagEl.textContent = msg || "All changes saved"; }

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
    ui:{threadsVisible:true, chapterView:"all", activeChapterId:null, biblePinned:false, bibleCollapsed:false, contourVisible:false}
  };
}
export function migrate(doc){
  doc.schemaVersion = 2;
  doc.attributeTypes ??= []; doc.protagonists ??= []; doc.chapters ??= [];
  doc.scenes ??= []; doc.beats ??= []; doc.connections ??= [];
  doc.ui ??= {};
  doc.ui.threadsVisible ??= true; doc.ui.chapterView ??= "all"; doc.ui.activeChapterId ??= null;
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
