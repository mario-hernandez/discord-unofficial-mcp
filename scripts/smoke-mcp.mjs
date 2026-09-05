#!/usr/bin/env node
/**
 * MCP-level smoke test: spawns src/mcp.js over stdio and drives it as a client would.
 *   node scripts/smoke-mcp.mjs [channel_id]
 * Checks: tool list, concurrent tool calls are serialized (in-process mutex), invalid input comes
 * back as an error result (never a crash), and the tab auto-closes after DISCORD_MCP_IDLE_MS.
 * Prints metrics, never message content.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const IDLE_MS = 4000;
const [, , argChannel] = process.argv;
let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const text = (r) => (r?.content || []).map((c) => c.text || "").join("\n");
const callOrError = (client, name, args) =>
  client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ type: "text", text: String(e.message || e) }] }));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "..", "src", "mcp.js")],
  env: { ...process.env, DISCORD_MCP_IDLE_MS: String(IDLE_MS) },
  stderr: "pipe",
});
const client = new Client({ name: "smoke-mcp", version: "0.0.0" });

try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check(tools.length === 6 && tools.includes("discord_read_dm"), `6 tools listed (${tools.join(", ")})`);

  const status = JSON.parse(text(await client.callTool({ name: "discord_status", arguments: {} })));
  check(status.discord === "logged_in", `signed in (${status.discord}, user ${status.user})`);
  if (status.discord !== "logged_in") throw new Error("Not signed in: sign in in the dedicated Chrome and rerun.");

  const list = JSON.parse(text(await client.callTool({ name: "discord_list_dms", arguments: { format: "json" } })));
  check(list.dms?.length > 0 && list.complete, `list_dms: ${list.dms?.length} conversations, complete=${list.complete}`);
  const channelId = argChannel || list.dms[0].channelId;

  // Two calls at once: the SDK dispatches them concurrently; the server must serialize them.
  const t0 = Date.now();
  const done = {};
  const timed = (name, args) => callOrError(client, name, args).then((r) => ((done[name] = Date.now() - t0), r));
  const [a, b] = await Promise.all([timed("discord_list_dms", { format: "json" }), timed("discord_read_dm", { channel_id: channelId, limit: 5, format: "json" })]);
  check(!a.isError && !b.isError, `concurrent calls both succeed (list ${done.discord_list_dms} ms, read ${done.discord_read_dm} ms)`);
  if (!a.isError && !b.isError) {
    const ra = JSON.parse(text(a));
    const rb = JSON.parse(text(b));
    check(ra.dms?.length > 0 && rb.count > 0, `both results non-empty (${ra.dms?.length} dms, ${rb.count} messages)`);
    check(Math.abs(done.discord_list_dms - done.discord_read_dm) > 800, "calls were serialized (finish times differ by more than 0.8 s)");
  }

  const bad = await callOrError(client, "discord_read_dm", { channel_id: "nope" });
  check(bad.isError, `invalid channel_id rejected as an error result (${text(bad).slice(0, 70)})`);
  const both = await callOrError(client, "discord_read_dm", { channel_id: channelId, name: "x" });
  check(both.isError, "channel_id + name rejected");
  const md = text(await callOrError(client, "discord_read_dm", { channel_id: channelId, limit: 3 }));
  check(md.startsWith("## DM:") && md.includes("```text"), "markdown output has header and fenced block");

  await new Promise((r) => setTimeout(r, IDLE_MS + 3000));
  const closed = text(await callOrError(client, "discord_close_tab", {}));
  check(/no Discord tab open/i.test(closed), `tab auto-closed after ${IDLE_MS} ms idle (${closed})`);
} catch (e) {
  failures++;
  console.error("✗ error:", e.message);
} finally {
  await client.close().catch(() => {});
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll good.");
process.exitCode = failures ? 1 : 0;
