// Fetches Rotten Tomatoes pages and extracts the Popcornmeter (audience score).
const TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000; // pages with no score: don't re-fetch for an hour
const TIMEOUT_MS = 8000;
const MAX_CONCURRENT = 3;
const BACKOFF_MS = 15 * 60 * 1000; // if RT rate-limits us, stop asking for a while

const inFlight = new Map();
const queue = [];
let active = 0;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "getPopcornmeter") return;
  getScore(msg.url).then(sendResponse, () => sendResponse(null));
  return true; // async response
});

chrome.runtime.onStartup.addListener(pruneCache);
chrome.runtime.onInstalled.addListener(pruneCache);

async function getScore(url) {
  const key = "rt:" + url;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && Date.now() - cached.at < (cached.data ? TTL_MS : MISS_TTL_MS)) return cached.data;

  const { backoffUntil = 0 } = await chrome.storage.local.get("backoffUntil");
  if (Date.now() < backoffUntil) return null;

  if (!inFlight.has(url)) {
    inFlight.set(url, limit(() => fetchScore(url)).finally(() => inFlight.delete(url)));
  }
  const result = await inFlight.get(url);
  if (result.cache) await chrome.storage.local.set({ [key]: { at: Date.now(), data: result.data } });
  return result.data;
}

// Run at most MAX_CONCURRENT fetches at once (e.g. a results page with many movies).
function limit(task) {
  return new Promise((resolve, reject) => {
    queue.push(() => task().then(resolve, reject));
    drain();
  });
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    active++;
    queue.shift()().finally(() => {
      active--;
      drain();
    });
  }
}

async function fetchScore(url) {
  let res;
  try {
    res = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { data: null, cache: false }; // network error or timeout; try again next time
  }
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    await chrome.storage.local.set({ backoffUntil: Date.now() + BACKOFF_MS });
    return { data: null, cache: false };
  }
  if (!res.ok) return { data: null, cache: true }; // e.g. 404: remember the miss
  return { data: parseScore(await res.text()), cache: true };
}

async function pruneCache() {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith("rt:") && Date.now() - all[k].at > TTL_MS);
  if (stale.length) await chrome.storage.local.remove(stale);
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
