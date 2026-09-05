#!/usr/bin/env node
/**
 * discord-unofficial-mcp CLI — the same logic as the MCP server, for the terminal or agents without MCP.
 *
 *   discord-unofficial-mcp status
 *   discord-unofficial-mcp login
 *   discord-unofficial-mcp dms [--unread] [--json]
 *   discord-unofficial-mcp read (<channel_id> | --name <name> | --channel-id <id>) [--limit N] [--before <id>] [--json]
 *   discord-unofficial-mcp catch-up [--json]
 *   discord-unofficial-mcp close
 *
 * The Discord tab stays open when the command ends (the CLI cannot watch for inactivity);
 * `close` closes it if no agent is using it.
 */
import { parseArgs } from "node:util";
import * as core from "./core.js";

const USAGE =
  "Usage: discord-unofficial-mcp status | login | dms [--unread] | read (<channel_id> | --name <name> | --channel-id <id>) [--limit N] [--before <id>] | catch-up | close   (--json for JSON output)";
const SNOWFLAKE = /^\d{15,22}$/;
const ALLOWED = {
  status: ["json"],
  login: ["json"],
  dms: ["json", "unread"],
  read: ["json", "limit", "before", "name", "channel-id"],
  "catch-up": ["json"],
  close: [],
};

let values;
let positionals;
try {
  ({ values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      unread: { type: "boolean" },
      json: { type: "boolean" },
      limit: { type: "string" },
      before: { type: "string" },
      name: { type: "string" },
      "channel-id": { type: "string" },
    },
  }));
} catch (e) {
  console.error(`❌ ${e.message}\n${USAGE}`);
  process.exitCode = 2;
  process.exit();
}

const [cmd, ...rest] = positionals;
const json = !!values.json;
const out = (v, render, toJson) => console.log(json ? (toJson ? toJson(v) : JSON.stringify(v, null, 2)) : render(v));

function intOption(name, fallback, min = 1) {
  const raw = values[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min) throw new Error(`--${name} must be an integer >= ${min} (received: ${raw})`);
  return Number(raw);
}

try {
  if (!cmd || !(cmd in ALLOWED)) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    const stray = Object.keys(values).filter((k) => values[k] !== undefined && !ALLOWED[cmd].includes(k));
    if (stray.length) throw new Error(`Option${stray.length > 1 ? "s" : ""} not applicable to "${cmd}": ${stray.map((k) => `--${k}`).join(", ")}`);
    const maxPositionals = cmd === "read" ? 1 : 0;
    if (rest.length > maxPositionals) throw new Error(`Unexpected arguments: ${rest.slice(maxPositionals).join(" ")}`);
    switch (cmd) {
      case "status":
        out(await core.status(), (s) => `Chrome: ${s.chrome ? "ok" : `down${s.error ? ` (${s.error})` : ""}`} · Discord: ${s.discord}${s.user ? ` · user: ${s.user}` : ""}${s.url ? ` · ${s.url}` : ""}`);
        break;
      case "login":
        out(await core.openLogin(), (r) => r.instructions);
        break;
      case "dms":
        out(await core.listDms({ unreadOnly: !!values.unread }), core.renderDms);
        break;
      case "read": {
        let channelId = values["channel-id"];
        let name = values.name;
        if (rest[0] !== undefined) {
          if (channelId || name) throw new Error("Pass the conversation either as a positional argument or with --name/--channel-id, not both.");
          if (SNOWFLAKE.test(rest[0])) channelId = rest[0];
          else name = rest[0];
        }
        if (!!channelId === !!name) throw new Error(`Pass exactly one of <channel_id> or --name <name>.\n${USAGE}`);
        if (channelId && !SNOWFLAKE.test(channelId)) throw new Error("channel_id must be a numeric Discord id (15-22 digits).");
        const limit = intOption("limit", 50);
        const before = values.before;
        if (before && !SNOWFLAKE.test(before)) throw new Error("--before must be a message id.");
        out(await core.readDm({ channelId, name, limit, before }), core.renderThread, core.threadJson);
        break;
      }
      case "catch-up":
        out(await core.catchUp(), core.renderCatchUp, core.catchUpJson);
        break;
      case "close": {
        const r = await core.closeTab();
        console.log(
          { closed: "Discord tab closed.", busy: "Another agent is reading Discord right now; not closing.", not_open: "There was no Discord tab open.", chrome_down: "The dedicated Chrome is not running." }[r] || r
        );
        break;
      }
    }
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
} finally {
  // Disconnect from the browser without closing the tab and let the process end naturally,
  // so stdout is fully flushed even when piped.
  await core.detach().catch(() => {});
}
