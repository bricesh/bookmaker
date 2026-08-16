import { renderCast } from "./characters.js";
import { renderStructure } from "./config.js";
import { h } from "./models.js";
import { Store, downloadBackup, restoreBackup, setSaveFlag } from "./store.js";
import { renderBible, renderBoard } from "./workspace.js";
import { isMobile, renderMobileBoard, renderTabbar } from "./mobile.js";

/* === router — routes + navigation === */
export const routes = { "/board":renderBoard, "/cast":renderCast, "/structure":renderStructure, "/bible":renderBible };
export function currentRoute(){ const r=location.hash.replace(/^#/,"")||"/board"; return routes[r]?r:"/board"; }
export function navigate(){
  const route = currentRoute();
  renderRail();
  renderTabbar(route);
  const app=document.getElementById("app"); app.innerHTML="";
  if(isMobile() && route==="/board") renderMobileBoard(app);
  else routes[route](app);
}
window.addEventListener("hashchange",navigate);
// re-render when crossing the phone/desktop breakpoint
let _wasMobile = isMobile();
window.addEventListener("resize",()=>{ const m=isMobile(); if(m!==_wasMobile){ _wasMobile=m; navigate(); } });

/* === rail (nav) === */
export function renderRail(){
  const s = Store.state, route = currentRoute();
  const host = document.getElementById("rail");

  // phone: a slim header (title + sync). Navigation lives in the bottom tab bar.
  if(isMobile()){
    const sf = h("span.save-flag",null,Store.status); setSaveFlag(sf);
    const bar = h(".rail.m-rail",null,
      h("input.proj-title",{value:s.project.title,"aria-label":"Book title",
        onchange:(e)=>Store.mutate(st=>st.project.title=e.target.value.trim()||"Untitled book")}),
      h(".spacer"),
      sf
    );
    host.innerHTML=""; host.append(bar); return;
  }

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
      h("button.tool"+ (s.ui.threadsFront?" on":""),{onclick:()=>Store.mutate(st=>st.ui.threadsFront=!st.ui.threadsFront),title:"Send string behind or in front of the cards"}, s.ui.threadsFront?"Threads: front":"Threads: back"),
      h("button.tool"+ (s.ui.contourVisible?" on":""),{onclick:()=>Store.mutate(st=>st.ui.contourVisible=!st.ui.contourVisible)}, "Contour"),
      h("button.tool"+ (s.ui.biblePinned?" on":""),{onclick:()=>Store.mutate(st=>st.ui.biblePinned=!st.ui.biblePinned),title:"Pin thesis + tonal rules to the top of the board"}, "Pin bible")
    );
  }
  const sf = h("span.save-flag",null,Store.status); setSaveFlag(sf);
  rail.append(
    sf,
    h("button.tool",{onclick:downloadBackup,title:"Download a .json backup"},"Back up"),
    h("button.tool",{onclick:restoreBackup,title:"Restore from a .json backup"},"Restore"),
  );
  // auth control — only shown once the sync layer has loaded (Store.authActions set)
  if(Store.authActions){
    if(Store.auth){
      rail.append(
        h("span.who",{title:Store.auth.email},Store.auth.email),
        h("button.tool",{onclick:()=>Store.authActions.signOut(),title:"Sign out"},"Sign out")
      );
    } else {
      rail.append(h("button.tool.on",{onclick:()=>Store.authActions.signIn(),title:"Sign in with Google to sync"},"Sign in"));
    }
  }
  host.innerHTML=""; host.append(rail);
}
