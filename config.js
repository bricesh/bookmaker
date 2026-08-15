import { M, byOrder, deleteChapter, deleteScene, h, move, nextOrder, uid } from "./models.js";
import { Store } from "./store.js";
import { confirmDlg, openModal, toast, toolRow } from "./ui.js";

/* === structure view — chapters, scenes === */
export function renderStructure(app){
  const s=Store.state;
  const page=h(".page");
  page.append(h(".page-head",null,h("div",null,h(".eyebrow",null,"The spine of the book"),h("h1",null,"Structure")),
    h("button.btn.primary",{onclick:()=>editChapter()},"Add chapter")));
  page.append(h("p.page-intro",null,"Chapters hold scenes; scenes become the columns on your board. Set the shape here, fill it with beats on the board."));
  if(!s.chapters.length){
    page.append(h(".empty",null,h("p",null,"No chapters yet. Every board starts with one."),
      h("button.btn.primary",{onclick:()=>editChapter()},"Add your first chapter")));
  }
  s.chapters.sort(byOrder).forEach((ch,i)=>{
    const block=h(".chapter",null,
      h(".chapter-head",null, h("span.cnum",null,"Ch. "+(i+1)), h("h3",null,ch.title),
        toolRow([
          {label:"▲",on:()=>{move(s.chapters,ch.id,-1);Store.mutate(()=>{});}},
          {label:"▼",on:()=>{move(s.chapters,ch.id,1);Store.mutate(()=>{});}},
          {label:"Edit",on:()=>editChapter(ch)},
          {label:"Delete",cls:"danger",on:()=>removeChapter(ch)},
        ])));
    const body=h(".chapter-body");
    if(ch.description) body.append(h("p",{style:{fontStyle:"italic",color:"var(--ink-soft)",margin:"0 0 12px"}},ch.description));
    body.append(chapterCastRow(ch));
    const row=h(".scene-list");
    M.scenesOf(ch.id).forEach(sc=>row.append(sceneChip(sc,ch)));
    row.append(h("button.add-card",{style:{width:"230px",minHeight:"70px"},onclick:()=>editScene(ch)},"+ Scene"));
    body.append(row); block.append(body); page.append(block);
  });
  app.append(page);
}
export function sceneChip(sc,ch){
  const s=Store.state;
  return h(".scene-chip",null, h("h4",null,sc.title), sc.description&&h("p",null,sc.description),
    toolRow([
      {label:"◀",on:()=>{move(M.scenesOf(ch.id),sc.id,-1);Store.mutate(()=>{});}},
      {label:"▶",on:()=>{move(M.scenesOf(ch.id),sc.id,1);Store.mutate(()=>{});}},
      {label:"Edit",on:()=>editScene(ch,sc)},
      {label:"Delete",cls:"danger",on:()=>removeScene(sc)},
    ]));
}
export function chapterCastRow(ch){
  const wrap=h(".chapter-cast", null, h("span.lab-inline",null,"Cast:"));
  const pros=(ch.castIds||[]).map(id=>M.pro(id)).filter(Boolean);
  if(!pros.length) wrap.append(h("span",{style:{color:"var(--ink-faint)",fontStyle:"italic"}},"nobody yet"));
  pros.forEach(p=>{
    const sw=h("span.swatch",{style:{width:"11px",height:"11px"}}); sw.style.background=p.color;
    wrap.append(h(".cast-chip",null,sw,h("span",null,p.name)));
  });
  wrap.append(h("button.btn.ghost.sm",{onclick:()=>manageChapterCast(ch)},"Manage cast"));
  return wrap;
}
export function manageChapterCast(ch){
  const s=Store.state;
  if(!s.protagonists.length){ toast("Add characters in Cast first"); return; }
  const rows=s.protagonists.sort(byOrder).map(p=>{
    const cb=h("input",{type:"checkbox",checked:(ch.castIds||[]).includes(p.id)});
    const sw=h("span.swatch",{style:{width:"14px",height:"14px"}}); sw.style.background=p.color;
    const row=h("label.cast-pick",null,cb,sw,h("span",null,p.name)); row._id=p.id; row._cb=cb; return row;
  });
  openModal({eyebrow:"Chapter cast · "+ch.title,title:"Who appears in this chapter?",
    body:h("div",null,
      h("p",{style:{color:"var(--ink-soft)",fontSize:"14px",margin:"0 0 8px"}},"Only these characters show on the board while you're in this chapter."),
      ...rows),
    saveLabel:"Save cast",
    onSave:()=>Store.mutate(st=>{ const c=st.chapters.find(x=>x.id===ch.id); c.castIds=rows.filter(r=>r._cb.checked).map(r=>r._id); })});
}
export function editChapter(ch){
  const title=h("input.txt",{value:ch?.title||"",placeholder:"e.g. The launch slips"});
  const desc=h("textarea.txt",{placeholder:"What this chapter is about (optional)"}); desc.value=ch?.description||"";
  openModal({eyebrow:ch?"Edit chapter":"New chapter",title:ch?"Edit chapter":"Add chapter",
    body:h("div",null,h("label.field",null,h("span.lab",null,"Title"),title),h("label.field",null,h("span.lab",null,"Description"),desc)),
    onSave:()=>{const t=title.value.trim();if(!t){title.focus();return false;}
      Store.mutate(s=>{ if(ch){ch.title=t;ch.description=desc.value;} else s.chapters.push({id:uid("cha"),title:t,description:desc.value,order:nextOrder(s.chapters),castIds:[]}); });}});
}
export async function removeChapter(ch){
  if(await confirmDlg("Delete “"+ch.title+"”?","Its scenes, their beats, and all threads on them will be removed.","Delete chapter"))
    deleteChapter(ch.id);
}
export function editScene(ch,sc){
  const title=h("input.txt",{value:sc?.title||"",placeholder:"e.g. The war room"});
  const desc=h("textarea.txt",{placeholder:"Set the scene: place, time, mood (optional)"}); desc.value=sc?.description||"";
  const has=sc&&Number.isFinite(sc.emotionalValue);
  const evSel=h("select.txt",null, h("option",{value:"",selected:!has},"— unset —"),
    ...[5,4,3,2,1,0,-1,-2,-3,-4,-5].map(v=>h("option",{value:String(v),selected:has&&sc.emotionalValue===v}, (v>0?"+":"")+v+evLabel(v))));
  openModal({eyebrow:(sc?"Edit":"New")+" scene · "+ch.title,title:sc?"Edit scene":"Add scene",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Title"),title),
      h("label.field",null,h("span.lab",null,"Set the scene"),desc),
      h("label.field",null,h("span.lab",null,"Emotional value — how the reader feels leaving this scene"),evSel)),
    onSave:()=>{const t=title.value.trim();if(!t){title.focus();return false;}
      Store.mutate(s=>{
        let target;
        if(sc){ sc.title=t; sc.description=desc.value; target=sc; }
        else { target={id:uid("scn"),chapterId:ch.id,title:t,description:desc.value,order:nextOrder(M.scenesOf(ch.id))}; s.scenes.push(target); }
        if(evSel.value==="") delete target.emotionalValue; else target.emotionalValue=parseInt(evSel.value,10);
      });}});
}
export function evLabel(v){ return v===5?" (triumphant)":v===0?" (neutral)":v===-5?" (despairing)":""; }
export async function removeScene(sc){
  if(await confirmDlg("Delete “"+sc.title+"”?","Its beats and any threads on them or on the scene will be removed.","Delete scene"))
    deleteScene(sc.id);
}
