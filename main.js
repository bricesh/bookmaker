import { navigate } from "./router.js";
import { Store } from "./store.js";

/* === main — bootstrap (cloud-only: data comes from Firebase) === */
Store.init();               // empty book in memory until the cloud loads
Store.subscribe(navigate);
navigate();

// Firebase is the single source of truth. If it can't load, the app has no data.
import("./sync.js")
  .then(m => m.startSync())
  .catch(err => console.error("Firebase unavailable — cannot load or save your book.", err));
