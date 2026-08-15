import { navigate } from "./router.js";
import { Store } from "./store.js";

/* === main — bootstrap === */
Store.load();
Store.subscribe(navigate);
navigate();
