// DOM structure probe for the Discord web client (read-only; prints structure, counts and short samples).
// Use it when a selector stops matching after a Discord build change.
import puppeteer from "puppeteer-core";

const BROWSER_URL = process.env.DISCORD_MCP_BROWSER_URL || "http://127.0.0.1:9222";
const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null, networkEnabled: false, logger: new Proxy(() => {}, { get: () => () => {}, apply: () => undefined }) });
try {
  const def = browser.defaultBrowserContext();
  const page = (await browser.pages()).find((p) => p.browserContext() === def && new URL(p.url()).origin === "https://discord.com");
  if (!page) throw new Error("No Discord tab open in the default context (run `status` first).");
  console.log("url:", page.url());
  const info = await page.evaluate(() => {
    const short = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const cls = (el) => (el?.className && typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(" ") : "");
    const out = {};
    out.dataListIds = [...document.querySelectorAll("[data-list-id]")].map((e) => `${e.tagName.toLowerCase()}[data-list-id=${e.getAttribute("data-list-id")}] n=${e.children.length}`);
    out.navs = [...document.querySelectorAll("nav")].map((n) => `nav aria-label=${n.getAttribute("aria-label")} cls=${cls(n)}`);
    const links = [...document.querySelectorAll('a[href^="/channels/@me/"]')].filter((a) => /^\/channels\/@me\/\d+/.test(a.getAttribute("href")));
    out.dmLinks = links.length;
    out.dmLinkSamples = links.slice(0, 2).map((a) => {
      const chain = [];
      let el = a;
      for (let i = 0; i < 5 && el; i++) {
        chain.push(`${el.tagName.toLowerCase()}[${cls(el)}]${[...el.attributes].filter((x) => x.name.startsWith("data-") || x.name.startsWith("aria-")).map((x) => ` ${x.name}=${short(x.value)}`).join("")}`);
        el = el.parentElement;
      }
      return { href: a.getAttribute("href").replace(/\d{10,}/g, "N"), ariaLabel: short(a.getAttribute("aria-label")), chain };
    });
    const ol = document.querySelector('ol[data-list-id="chat-messages"]');
    out.chat = ol
      ? {
          items: ol.querySelectorAll('li[id^="chat-messages-"]').length,
          sample: (() => {
            const li = ol.querySelector('li[id^="chat-messages-"]');
            return li ? [...li.querySelectorAll("*")].slice(0, 30).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id.replace(/\d{10,}/g, "N") : ""}[${cls(e)}]${e.getAttribute("datetime") ? " datetime" : ""}`) : null;
          })(),
        }
      : null;
    const userArea = document.querySelector('section[class*="panels"], [class*="panels"]');
    out.userArea = userArea ? { tag: userArea.tagName.toLowerCase(), aria: userArea.getAttribute("aria-label"), titleEl: cls(userArea.querySelector('[class*="title"]')) } : null;
    out.title = (document.title || "").replace(/\|.*$/, "| …");
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.disconnect();
}
