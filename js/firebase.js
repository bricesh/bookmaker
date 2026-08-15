/* === firebase.js — Realtime Database + Google auth ===
   Loaded lazily (dynamic import) so the app still runs when the CDN or network
   is unavailable — e.g. opened as a plain file. SDK comes from the Google CDN. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCuQ3g7yfVkqP2Cy5dOO28qfMcz1YjNCZc",
  authDomain: "the-configuration-trap.firebaseapp.com",
  databaseURL: "https://the-configuration-trap-default-rtdb.firebaseio.com",
  projectId: "the-configuration-trap",
  storageBucket: "the-configuration-trap.firebasestorage.app",
  messagingSenderId: "380521629489",
  appId: "1:380521629489:web:59ae89e50614673250d210"
};

let auth, db, provider;

export function initFirebase(){
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  provider = new GoogleAuthProvider();
}
export function onAuth(cb){ return onAuthStateChanged(auth, cb); }
export function signIn(){ return signInWithPopup(auth, provider); }
export function signInRedirect(){ return signInWithRedirect(auth, provider); }
export function checkRedirect(){ return getRedirectResult(auth); }
export function signOutUser(){ return signOut(auth); }

/** subscribe to /books/{uid}; cb receives the parsed document or null. returns an unsubscribe fn */
export function subscribeRemote(uid, cb){
  return onValue(ref(db, "books/" + uid), snap => cb(snap.exists() ? snap.val() : null));
}
/** overwrite /books/{uid} with the whole document */
export function writeRemote(uid, doc){
  return set(ref(db, "books/" + uid), doc);
}
