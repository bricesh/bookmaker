import { M, PRO_COLORS, TYPE_COLORS, byOrder, deleteAttribute, deleteProtagonist, h, move, nextOrder, uid } from "./models.js";
import { Store } from "./store.js";
import { confirmDlg, openModal, swatchPicker, toast, toolRow } from "./ui.js";

/* === cast view — protagonists, attributes, types === */
export function typeTag(typeId){
  const t = M.type(typeId);
  const dot = h("span.type-dot"); if(t?.color) dot.style.background=t.color;
  return h("span.type-tag",null, dot, t? t.label : "Untyped");
}
export function renderCast(app){
  const s = Store.state;
  const page = h(".page");
  page.append(
    h(".page-head",null, h("div",null, h(".eyebrow",null,"Who the story happens to"), h("h1",null,"Cast")),
      h("button.btn.primary",{onclick:()=>editProtagonist()},"Add character"))
  );
  page.append(h("p.page-intro",null,"Everyone who carries the story, and the traits, quotes, and history you'll thread into scenes."));

  // attribute types manager
  const types = h(".types",null, h("h3",null,"Attribute types"));
  const list = h("div");
  s.attributeTypes.sort(byOrder).forEach((t,i,arr)=>{
    const dot=h("span.type-dot",{style:{width:"11px",height:"11px"}}); if(t.color) dot.style.background=t.color;
    list.append(h(".type-row",null, dot, h("span.tname",null,t.label),
      toolRow([
        {label:"▲",on:()=>{move(s.attributeTypes,t.id,-1);Store.mutate(()=>{});},title:"Move up"},
        {label:"▼",on:()=>{move(s.attributeTypes,t.id,1);Store.mutate(()=>{});},title:"Move down"},
        {label:"Edit",on:()=>editType(t)},
        {label:"Delete",cls:"danger",on:()=>removeType(t)},
      ])
    ));
  });
  types.append(list, h("button.btn.sm",{style:{marginTop:"12px"},onclick:()=>editType()},"+ Add type"));
  page.append(types);

  if(!s.protagonists.length){
    page.append(h(".empty",null, h("p",null,"No characters yet. The board needs someone to happen to."),
      h("button.btn.primary",{onclick:()=>editProtagonist()},"Add your first character")));
  }
  s.protagonists.sort(byOrder).forEach(p=>{
    const sw=h("span.swatch"); sw.style.background=p.color;
    const block = h(".char",null,
      h(".char-head",null, sw, h("h3",null,p.name),
        toolRow([
          {label:"▲",on:()=>{move(s.protagonists,p.id,-1);Store.mutate(()=>{});}},
          {label:"▼",on:()=>{move(s.protagonists,p.id,1);Store.mutate(()=>{});}},
          {label:"Edit",on:()=>editProtagonist(p)},
          {label:"Delete",cls:"danger",on:()=>removeProtagonist(p)},
        ])
      )
    );
    const grid = h(".attr-grid");
    const {chains,info} = chainsOf(p);
    chains.forEach(chain=>{
      const col = h(".arc-chain"+(chain.length>1?".is-arc":""));
      chain.forEach((a,i)=>{
        col.append(attrCard(a,p,info.get(a.id)));
        if(i<chain.length-1) col.append(h(".arc-link",null,"↓"));
      });
      grid.append(col);
    });
    grid.append(h("button.add-card",{onclick:()=>editAttribute(p)},"+ Attribute"));
    block.append(h(".char-body",null,grid));
    page.append(block);
  });
  app.append(page);
}
/** resolve a protagonist's attributes into linear supersedes-chains */
export function chainsOf(p){
  const attrs=p.attributes;
  const succOf=new Map(); for(const a of attrs) if(a.supersedes) succOf.set(a.supersedes,a);
  const info=new Map(); const chains=[]; const placed=new Set();
  attrs.filter(a=>!a.supersedes).sort(byOrder).forEach(root=>{
    const chain=[]; let cur=root; const seen=new Set();
    while(cur && !seen.has(cur.id)){ seen.add(cur.id); chain.push(cur); placed.add(cur.id); cur=succOf.get(cur.id); }
    chain.forEach((a,i)=>info.set(a.id,{i,len:chain.length}));
    chains.push(chain);
  });
  for(const a of attrs) if(!placed.has(a.id)){ info.set(a.id,{i:0,len:1}); chains.push([a]); } // defensive
  return {chains,info};
}
export function attrCard(a,p,pos){
  const beat = a.createdInBeatId ? M.beat(a.createdInBeatId) : null;
  const isArc = pos && pos.len>1;
  const tools=[];
  if(!a.supersedes){ tools.push(
    {label:"▲",on:()=>{move(p.attributes,a.id,-1);Store.mutate(()=>{});}},
    {label:"▼",on:()=>{move(p.attributes,a.id,1);Store.mutate(()=>{});}}); }
  tools.push({label:"Edit",on:()=>editAttribute(p,a)},{label:"Delete",cls:"danger",on:()=>deleteAttribute(a.id)});
  return h(".card",null,
    isArc && h(".arc-badge",null,"Stage "+(pos.i+1)+" of "+pos.len),
    typeTag(a.typeId),
    h("h4.card-title",null,a.label||"(untitled)"),
    a.content && h("div.card-body",null,a.content),
    beat && h(".meta",null,"↳ from beat: "+(beat.title||"untitled")),
    toolRow(tools)
  );
}
export function editProtagonist(p){
  const name=h("input.txt",{value:p?.name||"",placeholder:"Character name"});
  let color = p?.color || PRO_COLORS[Store.state.protagonists.length % PRO_COLORS.length];
  const pick = swatchPicker(PRO_COLORS,color,c=>color=c);
  openModal({eyebrow:p?"Edit character":"New character",title:p?"Edit character":"Add character",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Name"),name),
      h("label.field",null,h("span.lab",null,"Colour (rail + presence threads — red is reserved)"),pick)),
    onSave:()=>{
      const n=name.value.trim(); if(!n){name.focus();return false;}
      Store.mutate(s=>{
        if(p){ p.name=n; p.color=color; }
        else s.protagonists.push({id:uid("pro"),name:n,color,order:nextOrder(s.protagonists),attributes:[]});
      });
    }});
}
export async function removeProtagonist(p){
  if(await confirmDlg("Delete "+p.name+"?","Their attributes and every thread touching them will go too.","Delete character"))
    deleteProtagonist(p.id);
}
export function editAttribute(p, a, createdInBeatId=null){
  const s=Store.state;
  const typeSel=h("select.txt",null, h("option",{value:""},"— Untyped —"),
    ...s.attributeTypes.sort(byOrder).map(t=>h("option",{value:t.id,selected:a?.typeId===t.id},t.label)));
  const label=h("input.txt",{value:a?.label||"",placeholder:"e.g. Impostor syndrome"});
  const content=h("textarea.txt",{placeholder:"Describe the trait, quote, or backstory…"}); content.value=a?.content||"";

  // "Evolves from" — same protagonist, not self, predecessor free, no cycle
  const takenPred=new Set(p.attributes.filter(x=>x.supersedes && x.id!==a?.id).map(x=>x.supersedes));
  const wouldCycle=(candId)=>{ if(!a) return false; let cur=p.attributes.find(x=>x.id===candId); const seen=new Set();
    while(cur && cur.supersedes && !seen.has(cur.id)){ seen.add(cur.id); if(cur.supersedes===a.id) return true; cur=p.attributes.find(x=>x.id===cur.supersedes); } return false; };
  const opts=[h("option",{value:""},"— none (root trait) —")];
  p.attributes.sort(byOrder).forEach(x=>{
    if(a && x.id===a.id) return;
    if(takenPred.has(x.id) && !(a && a.supersedes===x.id)) return;
    if(wouldCycle(x.id)) return;
    opts.push(h("option",{value:x.id,selected:a?.supersedes===x.id}, x.label||"(untitled)"));
  });
  const supSel=h("select.txt",null,...opts);

  openModal({eyebrow:(a?"Edit":"New")+" attribute · "+p.name,title:a?"Edit attribute":"Add attribute",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Type"),typeSel),
      h("label.field",null,h("span.lab",null,"Label"),label),
      h("label.field",null,h("span.lab",null,"Detail"),content),
      h("label.field",null,h("span.lab",null,"Evolves from (arc) — an earlier trait this one grows out of"),supSel)),
    onSave:()=>{
      const l=label.value.trim(); if(!l){label.focus();return false;}
      const sup=supSel.value||null;
      if(sup){ const conflict=p.attributes.find(x=>x.supersedes===sup && x.id!==a?.id);
        if(conflict){ toast("That trait is already evolved by another card"); return false; } }
      Store.mutate(st=>{
        const pr=st.protagonists.find(x=>x.id===p.id);
        if(a){ a.typeId=typeSel.value||null; a.label=l; a.content=content.value; a.supersedes=sup; }
        else pr.attributes.push({id:uid("att"),protagonistId:p.id,typeId:typeSel.value||null,label:l,content:content.value,order:nextOrder(pr.attributes),createdInBeatId,supersedes:sup});
      });
    }});
}
export function editType(t){
  const label=h("input.txt",{value:t?.label||"",placeholder:"e.g. Motivation"});
  let color=t?.color??null; const pick=swatchPicker(TYPE_COLORS,color,c=>color=c);
  openModal({eyebrow:t?"Edit type":"New type",title:t?"Edit attribute type":"Add attribute type",
    body:h("div",null,
      h("label.field",null,h("span.lab",null,"Name"),label),
      h("label.field",null,h("span.lab",null,"Colour (optional card tint)"),pick)),
    onSave:()=>{
      const l=label.value.trim(); if(!l){label.focus();return false;}
      Store.mutate(s=>{ if(t){t.label=l;t.color=color;} else s.attributeTypes.push({id:uid("atype"),label:l,color,order:nextOrder(s.attributeTypes)}); });
    }});
}
export async function removeType(t){
  const s=Store.state;
  const used = s.protagonists.flatMap(p=>p.attributes).filter(a=>a.typeId===t.id);
  if(!used.length){
    if(await confirmDlg("Delete type "+t.label+"?","Nothing uses it, so this is safe.","Delete type"))
      Store.mutate(st=>st.attributeTypes=st.attributeTypes.filter(x=>x.id!==t.id));
    return;
  }
  // reassign flow
  const others = s.attributeTypes.filter(x=>x.id!==t.id);
  const sel=h("select.txt",null, h("option",{value:""},"Leave them untyped"),
    ...others.map(o=>h("option",{value:o.id},"Reassign to: "+o.label)));
  openModal({eyebrow:"Delete type",title:"“"+t.label+"” is in use",
    body:h("div",null,
      h("p",{style:{color:"var(--ink-soft)"}},used.length+" attribute"+(used.length>1?"s":"")+" use this type. Choose what happens to them."),
      h("label.field",null,h("span.lab",null,"Then"),sel)),
    saveLabel:"Delete type",
    onSave:()=>Store.mutate(st=>{
      const to=sel.value||null;
      for(const p of st.protagonists) for(const a of p.attributes) if(a.typeId===t.id) a.typeId=to;
      st.attributeTypes=st.attributeTypes.filter(x=>x.id!==t.id);
    })});
}
