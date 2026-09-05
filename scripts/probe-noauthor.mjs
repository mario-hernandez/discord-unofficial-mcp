// Probe: structure of messages whose author cannot be resolved (no own header, no aria-labelledby reference).
// Read-only; scrolls the open conversation up a few screens. Prints structure and names only, never message text.
import puppeteer from "puppeteer-core";

const BROWSER_URL = process.env.DISCORD_MCP_BROWSER_URL || "http://127.0.0.1:9222";
const targets = new Set(process.argv.slice(2)); // optional: message id suffixes (last 6 digits) to focus on
const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null, networkEnabled: false, logger: new Proxy(() => {}, { get: () => () => {}, apply: () => undefined }) });
try {
  const def = browser.defaultBrowserContext();
  const page = (await browser.pages()).find((p) => p.browserContext() === def && new URL(p.url()).origin === "https://discord.com");
  if (!page) throw new Error("No Discord tab open (run `read <channel_id>` first).");
  const seen = new Map();
  for (let step = 0; step < 12; step++) {
    const found = await page.evaluate((targets) => {
      const strip = (c) => (c || "").split(" ").map((x) => x.replace(/_+[0-9a-f]{5,}$/, "")).filter(Boolean).join(",");
      const anon = (s) => (s || "").replace(/\d{10,}/g, (m) => "…" + m.slice(-6));
      const out = [];
      for (const li of document.querySelectorAll('ol[data-list-id="chat-messages"] > li[id^="chat-messages-"]')) {
        const id = li.id.match(/-(\d+)$/)?.[1];
        const art = li.querySelector('[role="article"]') || li;
        const own = li.querySelector(`#message-username-${id}`);
        const lab = art.getAttribute("aria-labelledby") || "";
        const ref = lab.match(/message-username-(\d+)/)?.[1];
        const focus = targets.length ? targets.includes(id.slice(-6)) : !own && !ref;
        if (!focus) continue;
        out.push({
          id: "…" + id.slice(-6),
          articleClasses: strip(art.className),
          ariaLabelledby: anon(lab),
          ariaLabel: anon(art.getAttribute("aria-label")).slice(0, 80),
          ids: [...li.querySelectorAll("[id]")].map((e) => anon(e.id)),
          headerLike: [...li.querySelectorAll('h3, [class*="username"], [class*="header"]')].map((e) => `${e.tagName.toLowerCase()}[${strip(e.className)}]=${(e.textContent || "").trim().slice(0, 30)}`).slice(0, 5),
          firstChildren: [...(art.children || [])].map((e) => `${e.tagName.toLowerCase()}[${strip(e.className)}]`).slice(0, 6),
          prevLi: (() => { const p = li.previousElementSibling; return p ? `${p.tagName.toLowerCase()}#${anon(p.id)}[${strip(p.className)}]` : null; })(),
        });
      }
      return out;
    }, [...targets]);
    for (const f of found) if (!seen.has(f.id)) seen.set(f.id, f);
    if (targets.size && [...targets].every((t) => seen.has("…" + t))) break;
    await page.evaluate(() => {
      let el = document.querySelector('ol[data-list-id="chat-messages"]');
      while (el && el !== document.body) { const cs = getComputedStyle(el); if (el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(cs.overflowY)) { el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 0.7); break; } el = el.parentElement; }
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(JSON.stringify([...seen.values()].slice(0, 6), null, 1));
} finally {
  await browser.disconnect();
}
