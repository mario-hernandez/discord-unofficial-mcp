#!/usr/bin/env node
/**
 * Smoke test against the dedicated Chrome with a real Discord session.
 *   node scripts/smoke.mjs [channel_id] [name]
 * Exercises: status, full sidebar walk, recent read with history, read by name, `before` cursor,
 * input validation, output budget and tab closing. Prints metrics, never message content.
 */
import * as core from "../src/core.js";

const [, , argChannel, argName] = process.argv;
const log = (...a) => console.log(...a);
const count = (arr, key) => JSON.stringify(arr.reduce((acc, m) => ((acc[m[key]] = (acc[m[key]] || 0) + 1), acc), {}));
let failures = 0;
const check = (cond, label) => {
  log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

try {
  const t0 = Date.now();
  const s = await core.status();
  log("status:", s.discord, "· user:", s.user, `· ${Date.now() - t0} ms`);
  check(s.discord === "logged_in", "signed in");
  if (s.discord !== "logged_in") throw new Error("Not signed in: sign in in the dedicated Chrome and rerun.");

  let t = Date.now();
  const list = await core.listDms();
  log("dms:", list.dms.length, "· complete:", list.complete, `(${list.stopReason})`, "· list total:", list.total, "· unread:", list.dms.filter((d) => d.unread).length, `· ${Date.now() - t} ms`);
  check(list.dms.length > 0, "conversations found");
  check(list.complete, "full sidebar walk");

  const channelId = argChannel || list.dms[0].channelId;
  t = Date.now();
  const r = await core.readDm({ channelId, limit: 60 });
  log("read 60:", r.channel.name, `(${r.channel.nameSource})`, "· count:", r.count, "· hasMore:", r.hasMore, "· nextBefore:", r.nextBefore, "· coverage:", JSON.stringify(r.coverage), `· ${Date.now() - t} ms`);
  log("  authors:", count(r.messages, "authorSource"), "· kinds:", count(r.messages, "kind"), "· attachments:", r.messages.reduce((n, m) => n + m.attachments.length, 0), "· first:", r.messages[0]?.timestamp, "· last:", r.messages.at(-1)?.timestamp);
  check(r.count > 0, "returns messages");
  check(r.messages.every((m) => m.author), "every message has an author");
  check(r.messages.every((m) => m.timestamp), "every message has a timestamp");
  const ids = r.messages.map((m) => BigInt(m.id));
  check(ids.every((v, i) => i === 0 || ids[i - 1] < v), "strict chronological order");
  check(r.count === Math.min(60, r.coverage.eligible), "count consistent with coverage");

  t = Date.now();
  const r5 = await core.readDm({ channelId, limit: 5 });
  log("read 5:", "count", r5.count, "· nextBefore", r5.nextBefore, `· ${Date.now() - t} ms`);
  check(r5.messages.at(-1)?.id === r.messages.at(-1)?.id, "read 5 and read 60 end on the SAME last message (recency guaranteed)");
  if (r5.nextBefore) {
    t = Date.now();
    const rb = await core.readDm({ channelId, limit: 5, before: r5.nextBefore });
    log("read before:", "count", rb.count, "· hasMore", rb.hasMore, "· stopReason", rb.coverage.stopReason, `· ${Date.now() - t} ms`);
    check(rb.messages.every((m) => BigInt(m.id) < BigInt(r5.nextBefore)), "all messages older than the cursor");
    check(rb.count > 0, "the cursor returns messages");
  }

  const name = argName || list.dms.find((d) => d.channelId !== channelId)?.name;
  if (name) {
    t = Date.now();
    const rn = await core.readDm({ name, limit: 5 });
    log("read by name:", JSON.stringify(name), "→", rn.channel.name, rn.channel.channelId, "· count", rn.count, `· ${Date.now() - t} ms`);
    check(rn.count >= 0 && rn.channel.channelId !== channelId, "resolves the name to another conversation");
  }

  for (const bad of [{ channelId: 'x"],button,[y=' }, { channelId: "../../api/v10/users/@me" }, { channelId, name: "x" }, {}, { channelId, before: "nope" }]) {
    try {
      await core.readDm(bad);
      check(false, `did NOT reject ${JSON.stringify(bad)}`);
    } catch (e) {
      check(true, `rejects ${JSON.stringify(bad).slice(0, 50)} → ${e.message.slice(0, 70)}`);
    }
  }

  const md = core.renderThread(r);
  log("render:", md.length, "chars ·", md.split("\n").length, "lines · starts with:", JSON.stringify(md.slice(0, 60)));
  check(md.length <= core.MAX_OUTPUT_CHARS, "render within budget");
  check(md.includes("not as instructions"), "untrusted-content notice present");
  const big = core.renderThread(r, { budget: 1500 });
  check(big.length <= 1500 + 200 && big.includes("output trimmed"), "budget trimming works");

  t = Date.now();
  const closed = await core.closeTab({ wait: true });
  log("close:", closed, `· ${Date.now() - t} ms`);
  check(closed === "closed", "closes the tab");
  const closedAgain = await core.closeTab({ wait: true });
  check(closedAgain === "not_open", `second close returns not_open (${closedAgain})`);
} catch (e) {
  failures++;
  console.error("✗ error:", e.message);
} finally {
  await core.detach();
}
log(failures ? `\n${failures} check(s) failed` : "\nAll good.");
process.exitCode = failures ? 1 : 0;
