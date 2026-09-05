// Grouped-message probe: how Discord references the author of messages without their own header.
// Read-only; ids are anonymized and no message text is printed.
import puppeteer from "puppeteer-core";

const BROWSER_URL = process.env.DISCORD_MCP_BROWSER_URL || "http://127.0.0.1:9222";
const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null, networkEnabled: false, logger: new Proxy(() => {}, { get: () => () => {}, apply: () => undefined }) });
try {
  const def = browser.defaultBrowserContext();
  const page = (await browser.pages()).find((p) => p.browserContext() === def && new URL(p.url()).origin === "https://discord.com");
  if (!page) throw new Error("No Discord tab open in the default context (run `read <channel_id>` first).");
  const info = await page.evaluate(() => {
    const lis = [...document.querySelectorAll('ol[data-list-id="chat-messages"] > li[id^="chat-messages-"]')];
    const idOf = (li) => li.id.match(/-(\d+)$/)?.[1];
    const out = { total: lis.length, samples: [] };
    let prevId = null;
    for (const li of lis) {
      const id = idOf(li);
      const art = li.querySelector('[role="article"]');
      const hasHeader = !!li.querySelector(`#message-username-${id}`);
      const lab = art?.getAttribute("aria-labelledby") || "";
      const labUser = lab.match(/message-username-(\d+)/)?.[1] || null;
      const cls = (art?.className || "")
        .split(" ")
        .filter((c) => /groupStart|cozyMessage|hasReply|systemMessage/.test(c))
        .map((c) => c.replace(/_+[0-9a-f]{5,}$/, ""))
        .join(",");
      if (!hasHeader && out.samples.length < 4) {
        out.samples.push({
          own: id.slice(-6),
          prev: prevId?.slice(-6),
          classes: cls,
          labelledbyUser: labUser ? labUser.slice(-6) : null,
          labelledbyUserRendered: labUser ? !!document.getElementById(`message-username-${labUser}`) : null,
          ownTimestampEl: !!li.querySelector(`#message-timestamp-${id}`),
        });
      }
      prevId = id;
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.disconnect();
}
