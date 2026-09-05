// Message structure probe: element ids inside a message, timestamps, grouped messages, scroll containers.
// Read-only; ids are anonymized and no message text is printed.
import puppeteer from "puppeteer-core";

const BROWSER_URL = process.env.DISCORD_MCP_BROWSER_URL || "http://127.0.0.1:9222";
const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null, networkEnabled: false, logger: new Proxy(() => {}, { get: () => () => {}, apply: () => undefined }) });
try {
  const def = browser.defaultBrowserContext();
  const page = (await browser.pages()).find((p) => p.browserContext() === def && new URL(p.url()).origin === "https://discord.com");
  if (!page) throw new Error("No Discord tab open in the default context (run `read <channel_id>` first).");
  const info = await page.evaluate(() => {
    const cls = (el) => (typeof el?.className === "string" ? el.className.split(" ").slice(0, 2).join(" ") : "");
    const anon = (s) => (s || "").replace(/\d{10,}/g, (m) => "…" + m.slice(-6));
    const lis = [...document.querySelectorAll('ol[data-list-id="chat-messages"] > li[id^="chat-messages-"]')];
    const pick = (li) => {
      const id = li.id.match(/-(\d+)$/)?.[1];
      const art = li.querySelector('[role="article"]');
      return {
        id: anon(li.id),
        ids: [...li.querySelectorAll("[id]")].map((e) => anon(e.id)),
        hasOwnHeader: !!li.querySelector(`#message-username-${id}`),
        times: [...li.querySelectorAll("time")].map((t) => t.getAttribute("datetime")),
        articleClasses: cls(art),
        ariaLabelledby: anon(art?.getAttribute("aria-labelledby")),
      };
    };
    const out = { count: lis.length };
    if (lis.length) out.first = pick(lis[0]);
    if (lis.length > 1) out.last = pick(lis[lis.length - 1]);
    const grouped = lis.find((li) => !li.querySelector(`#message-username-${li.id.match(/-(\d+)$/)?.[1]}`));
    out.groupedSample = grouped ? pick(grouped) : "(none rendered)";
    let el = document.querySelector('ol[data-list-id="chat-messages"]');
    const chain = [];
    while (el && el !== document.body && chain.length < 6) {
      const cs = getComputedStyle(el);
      chain.push(`${el.tagName.toLowerCase()}[${cls(el)}] overflowY=${cs.overflowY} sh=${el.scrollHeight} ch=${el.clientHeight} st=${el.scrollTop}`);
      el = el.parentElement;
    }
    out.chatScrollChain = chain;
    const sc = document.querySelector('div[data-list-id^="private-channels-uid_"]');
    out.sidebar = sc ? { scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, overflowY: getComputedStyle(sc).overflowY } : null;
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.disconnect();
}
