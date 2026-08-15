import { renderCast } from "./characters.js";
import { renderStructure } from "./config.js";
import { h } from "./models.js";
import { Store, downloadBackup, restoreBackup, setSaveFlag } from "./store.js";
import { renderBible, renderBoard } from "./workspace.js";

/* === router — routes + navigation === */
export const routes = { "/board":renderBoard, "/cast":renderCast, "/structure":renderStructure, "/bible":renderBible };
export function currentRoute(){ const r=location.hash.replace(/^#/,"")||"/board"; return routes[r]?r:"/board"; }
export function navigate(){ renderRail(); const app=document.getElementById("app"); app.innerHTML=""; routes[currentRoute()](app); }
window.addEventListener("hashchange",navigate);

/* === rail (nav) === */
export function renderRail(){
  const s = Store.state, route = currentRoute();
  const link = (href,label)=>h("a",{href:"#"+href, class: route===href?"active":""},label);
  const rail = h(".rail",null,
    h(".brand",null, h("span.mark",null,"Story Board"), h("span.sub",null,"plot")),
    h("input.proj-title",{value:s.project.title,"aria-label":"Book title",
      onchange:(e)=>Store.mutate(st=>st.project.title=e.target.value.trim()||"Untitled book")}),
    h("nav.nav",null, link("/bible","Bible"), link("/cast","Cast"), link("/structure","Structure"), link("/board","Board")),
    h(".spacer"),
  );
  if(route==="/board"){
    rail.append(
      h("button.tool"+ (s.ui.threadsVisible?" on":""),{onclick:()=>Store.mutate(st=>st.ui.threadsVisible=!st.ui.threadsVisible)}, "Threads"),
      h("button.tool"+ (s.ui.contourVisible?" on":""),{onclick:()=>Store.mutate(st=>st.ui.contourVisible=!st.ui.contourVisible)}, "Contour"),
      h("button.tool"+ (s.ui.biblePinned?" on":""),{onclick:()=>Store.mutate(st=>st.ui.biblePinned=!st.ui.biblePinned),title:"Pin thesis + tonal rules to the top of the board"}, "Pin bible")
    );
  }
  const sf = h("span.save-flag",null,"All changes saved"); setSaveFlag(sf);
  rail.append(
    sf,
    h("button.tool",{onclick:downloadBackup,title:"Download a .json backup"},"Back up"),
    h("button.tool",{onclick:restoreBackup,title:"Restore from a .json backup"},"Restore"),
  );
  const host = document.getElementById("rail"); host.innerHTML=""; host.append(rail);
}
