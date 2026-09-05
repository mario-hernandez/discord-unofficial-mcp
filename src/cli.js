#!/usr/bin/env node
/**
 * discord-unofficial-mcp CLI — the same logic as the MCP server, for the terminal or agents without MCP.
 *
 *   discord-unofficial-mcp status
 *   discord-unofficial-mcp login
 *   discord-unofficial-mcp dms [--unread] [--json]
 *   discord-unofficial-mcp read (<channel_id> | --name <name>) [--limit N] [--before <id>] [--json]
 *   discord-unofficial-mcp catch-up [--json]
 *   discord-unofficial-mcp close
 *
 * The Discord tab stays open when the command ends (the CLI cannot watch for inactivity);
 * `close` closes it if no agent is using it.
 */
import { parseArgs } from "node:util";
import * as core from "./core.js";

const USAGE =
  "Usage: discord-unofficial-mcp status | login | dms [--unread] | read (<channel_id> | --name <name>) [--limit N] [--before <id>] | catch-up | close   (--json for JSON output)";
const SNOWFLAKE = /^\d{15,22}$/;

let values;
let positionals;
try {
  ({ values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      unread: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
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
const out = (v, render) => console.log(values.json ? JSON.stringify(v, null, 2) : render(v));

function intOption(name, fallback) {
  const raw = values[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} must be a positive integer (received: ${raw})`);
  return Number(raw);
}

try {
  switch (cmd) {
    case "status":
      out(await core.status(), (s) => `Chrome: ${s.chrome ? "ok" : "down"} · Discord: ${s.discord}${s.user ? ` · user: ${s.user}` : ""}${s.url ? ` · ${s.url}` : ""}`);
      break;
    case "login":
      out(await core.openLogin(), (r) => r.instructions);
      break;
    case "dms":
      if (rest.length) throw new Error(`Unexpected arguments: ${rest.join(" ")}`);
      out(await core.listDms({ unreadOnly: values.unread }), core.renderDms);
      break;
    case "read": {
      if (rest.length > 1) throw new Error(`Unexpected arguments: ${rest.slice(1).join(" ")}`);
      let channelId = values["channel-id"];
      let name = values.name;
      if (rest[0] !== undefined) {
        if (SNOWFLAKE.test(rest[0])) channelId = rest[0];
        else name = rest[0];
      }
      if (!!channelId === !!name) throw new Error(`Pass exactly one of <channel_id> or --name <name>.\n${USAGE}`);
      if (channelId && !SNOWFLAKE.test(channelId)) throw new Error("channel_id must be a numeric Discord id (15-22 digits).");
      const limit = intOption("limit", 50);
      const before = values.before;
      if (before && !SNOWFLAKE.test(before)) throw new Error("--before must be a message id.");
      out(await core.readDm({ channelId, name, limit, before }), core.renderThread);
      break;
    }
    case "catch-up":
      out(await core.catchUp(), core.renderCatchUp);
      break;
    case "close": {
      const r = await core.closeTab();
      console.log(
        { closed: "Discord tab closed.", busy: "Another agent is reading Discord right now; not closing.", not_open: "There was no Discord tab open.", chrome_down: "The dedicated Chrome is not running." }[r] || r
      );
      break;
    }
    default:
      console.error(USAGE);
      process.exitCode = 2;
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
} finally {
  // Disconnect from the browser without closing the tab and let the process end naturally,
  // so stdout is fully flushed even when piped.
  await core.detach().catch(() => {});
}
