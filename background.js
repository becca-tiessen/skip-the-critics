// Fetches Rotten Tomatoes pages and extracts the Popcornmeter (audience score).
const TTL_MS = 12 * 60 * 60 * 1000;
const inFlight = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "getPopcornmeter") return;
  getScore(msg.url).then(sendResponse, () => sendResponse(null));
  return true; // async response
});

async function getScore(url) {
  const key = "rt:" + url;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  if (!inFlight.has(url)) {
    inFlight.set(url, fetchScore(url).finally(() => inFlight.delete(url)));
  }
  const data = await inFlight.get(url);
  if (data) await chrome.storage.local.set({ [key]: { at: Date.now(), data } });
  return data;
}

async function fetchScore(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) return null;
  return parseScore(await res.text());
}

function parseScore(html) {
  // Preferred: the scorecard JSON RT embeds in the page.
  const json = html.match(/<script[^>]*id="media-scorecard-json"[^>]*>([\s\S]*?)<\/script>/);
  if (json) {
    try {
      const a = JSON.parse(json[1]).audienceScore;
      if (a) {
        return {
          score: a.score ? Number(a.score) : null,
          ratings: a.bandedRatingCount || null,
        };
      }
    } catch {}
  }
  // Fallback: the rendered audience score element.
  const m = html.match(/slot="audience-score"[^>]*>\s*(\d{1,3})%/);
  return m ? { score: Number(m[1]), ratings: null } : null;
}

if (typeof module !== "undefined") module.exports = { parseScore };
