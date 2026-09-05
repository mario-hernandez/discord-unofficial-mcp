#!/usr/bin/env node
/**
 * Detached helper spawned by shutdown() when the shared tab was used recently: waits for the idle
 * period and closes the tab if it is still idle, so the last process to exit never leaves the tab
 * (and the "online" presence) open forever. Exits quietly in every case.
 */
import { closeTab, IDLE_CLOSE_MS } from "./core.js";

const delay = Math.max(1_000, IDLE_CLOSE_MS) + 1_000;
setTimeout(async () => {
  try {
    const r = await closeTab({ wait: false, onlyIfIdle: true });
    if (r === "active") {
      // Someone used it again: try once more after another idle period, then give up.
      await new Promise((res) => setTimeout(res, delay));
      await closeTab({ wait: false, onlyIfIdle: true });
    }
  } catch {}
  process.exit(0);
}, delay);
