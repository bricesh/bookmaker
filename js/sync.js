/* === sync.js — orchestrates Firebase auth + live Realtime-Database sync ===
   Firebase is the single source of truth (no local storage). Loaded lazily by
   main.js; if Firebase can't load, the app has no data to show.

   Safety rule (learned the hard way): an EMPTY document must never overwrite a
   non-empty one — in either direction. First-connect reconciles by content:
     remote empty + local has content  -> seed/repair cloud from local
     remote has content + local empty   -> adopt cloud (the usual case)
     both have content                  -> cloud wins (shared source of truth)
     both empty                         -> do nothing
*/
import * as fb from "./firebase.js";
import { Store, setStatus } from "./store.js";

let uid = null;         // signed-in user id (null when signed out)
let firstSnap = true;   // first remote snapshot after sign-in needs reconciliation
let ready = false;      // don't push local edits until first snapshot is reconciled
let unsub = null;       // RTDB listener detach
let writeTimer = null;  // debounce remote writes

/** a document with no real authored content (a fresh seed, or a wiped/empty remote) */
function isEmpty(d){
  if(!d) return true;
  const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
  const b = d.bible || {};
  return n("protagonists")===0 && n("chapters")===0 && n("scenes")===0 &&
         n("beats")===0 && n("connections")===0 &&
         !(b.logline || b.thesis || b.theoryOfChange || b.tonalRules || b.openQuestions);
}

export function startSync(){
  fb.initFirebase();
  const onPhone = window.matchMedia("(max-width: 768px)").matches;

  Store.authActions = {
    signIn:  () => (onPhone ? fb.signInRedirect() : fb.signIn())
                     .catch(e => { console.warn(e); setStatus("Sign-in failed"); }),
    signOut: () => fb.signOutUser()
  };
  Store.setAuth(null);
  setStatus("Sign in to sync");

  // complete a redirect sign-in if we're coming back from one (phones)
  fb.checkRedirect().catch(e => console.warn("redirect result:", e));

  fb.onAuth(user => {
    if(unsub){ unsub(); unsub = null; }
    ready = false; firstSnap = true;
    if(user){
      uid = user.uid; Store.connected = true;
      Store.setAuth({ email: user.email || "signed in" });
      setStatus("Connecting…");
      unsub = fb.subscribeRemote(uid, onRemote);
    } else {
      uid = null; Store.connected = false;
      Store.setAuth(null);
      setStatus("Local only — sign in to sync");
    }
  });

  // push local edits up (debounced) once we're signed in AND reconciled
  Store.onLocalChange(state => { if(uid && ready) scheduleWrite(state); });
}

function onRemote(remote){
  if(firstSnap){
    firstSnap = false;
    const localEmpty  = isEmpty(Store.state);
    const remoteEmpty = isEmpty(remote);           // treats null and blank docs as empty
    if(remoteEmpty && !localEmpty){
      push();                                       // seed or repair the cloud from local
    } else if(!remoteEmpty && localEmpty){
      Store.applyRemote(remote);                    // new device → adopt the cloud
    } else if(!remoteEmpty && !localEmpty){
      Store.applyRemote(remote);                    // both real → cloud is the shared truth
    }
    // else: both empty → nothing to do
    ready = true;
    setStatus(uid ? "Synced" : "Local only");
    return;
  }
  // subsequent live updates from other devices/tabs — never let a blank wipe local
  if(!isEmpty(remote)) Store.applyRemote(remote);
  setStatus("Synced");
}

function scheduleWrite(state){
  if(!uid || !ready) return;
  setStatus("Syncing…");
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => push(state), 600);
}

function push(state){
  if(!uid) return;
  const doc = JSON.parse(JSON.stringify(state || Store.state)); // plain data, strips undefined
  fb.writeRemote(uid, doc)
    .then(() => setStatus("Synced"))
    .catch(e => { console.warn(e); setStatus("Sync error — will retry on next edit"); });
}
