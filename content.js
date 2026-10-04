// Replaces Rotten Tomatoes Tomatometer scores in Google results with the Popcornmeter.
const PERCENT = /^\s*(\d{1,3})%\s*$/;
const RATING = /(Rating:\s*)(\d{1,3})%/;
const REVIEW_COUNT = /\d[\d,]*\s+(reviews|votes)\b/i;

function rtUrl(href) {
  try {
    let u = new URL(href, location.href);
    // Google sometimes wraps outbound links: /url?q=<target>
    if (u.pathname === "/url") u = new URL(u.searchParams.get("q") || u.searchParams.get("url"));
    if (!/(^|\.)rottentomatoes\.com$/.test(u.hostname)) return null;
    const path = u.pathname.match(/^\/(m|tv)\/[^/]+(\/s\d+)?/);
    return path ? "https://www.rottentomatoes.com" + path[0] : null;
  } catch {
    return null;
  }
}

function textNodes(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}

function getPopcornmeter(url) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "getPopcornmeter", url }, (r) => {
        void chrome.runtime.lastError;
        resolve(r || null);
      });
    } catch {
      resolve(null);
    }
  });
}

const label = (data) => (data?.score != null ? data.score + "%" : "--");

// Knowledge panel / rating badge: <a href="rottentomatoes.com/..."><span>89%</span><span>Rotten Tomatoes</span></a>
async function swapBadge(a, url) {
  const nodes = textNodes(a);
  let pct = nodes.find((n) => PERCENT.test(n.data));
  // Some layouts put the percentage (or icon) next to the link instead of inside it.
  let box = a.parentElement?.parentElement;
  if (box?.querySelectorAll('a[href*="rottentomatoes.com"]').length !== 1) box = null;
  if (!pct && box) pct = textNodes(box).find((n) => PERCENT.test(n.data));
  if (!pct) return;

  const data = await getPopcornmeter(url);
  if (!data) return; // couldn't fetch; leave Google's original score
  pct.data = pct.data.replace(/\d{1,3}%/, label(data));
  for (const n of nodes) {
    if (/Rotten Tomatoes/i.test(n.data)) n.data = n.data.replace(/Rotten Tomatoes/i, "Popcornmeter");
  }
  for (const el of [a, ...a.querySelectorAll("[aria-label]")]) {
    const al = el.getAttribute("aria-label");
    if (al && /Rotten Tomatoes|\d%/.test(al)) el.setAttribute("aria-label", `${label(data)} Popcornmeter`);
  }
  a.title = `Rotten Tomatoes Popcornmeter${data.ratings ? " \u00b7 " + data.ratings : ""}`;
  swapIcons(a.querySelectorAll("img").length ? a : box, data);
}

// Replace the tomato logo with a popcorn bucket: full at 60%+, spilled below (RT's convention).
function swapIcons(root, data) {
  if (!root) return;
  const file = data.score != null && data.score < 60 ? "popcorn-spilled.svg" : "popcorn-full.svg";
  const src = chrome.runtime.getURL("icons/" + file);
  for (const img of root.querySelectorAll("img")) {
    const link = img.closest("a");
    if (link && !link.href.includes("rottentomatoes.com")) continue; // e.g. the IMDb row
    const set = () => {
      if (img.src === src) return;
      img.removeAttribute("srcset");
      img.removeAttribute("data-src");
      img.src = src;
      img.style.objectFit = "contain";
    };
    set();
    // Google lazy-loads images and may overwrite src after we've swapped it.
    new MutationObserver(set).observe(img, { attributes: true, attributeFilter: ["src", "srcset"] });
  }
}

// Organic RT result with a "Rating: 89%" rich snippet.
async function swapSnippet(a, url) {
  const result = a.closest("div.g, div.MjjYud, [data-hveid]");
  if (!result || result.dataset.popcorn) return;
  result.dataset.popcorn = "1";
  const node = textNodes(result).find((n) => RATING.test(n.data));
  if (!node) return;
  const data = await getPopcornmeter(url);
  if (!data) return;
  node.data = node.data.replace(RATING, `$1${label(data)} Popcornmeter`);
  // "· 147 reviews" next to the rating is the critics' count; show audience ratings instead.
  const count = textNodes(result).find((n) => REVIEW_COUNT.test(n.data));
  if (count) count.data = count.data.replace(REVIEW_COUNT, data.ratings ? data.ratings.toLowerCase() : "");
}

function scan() {
  for (const a of document.querySelectorAll('a[href*="rottentomatoes.com"]:not([data-popcorn])')) {
    a.dataset.popcorn = "pending";
    const url = rtUrl(a.href);
    if (!url) {
      a.dataset.popcorn = "skip";
      continue;
    }
    const work = a.querySelector("h3") ? swapSnippet(a, url) : swapBadge(a, url);
    work.finally(() => (a.dataset.popcorn = "done"));
  }
}

// Reveal as soon as we're done; CSS hides only links without data-popcorn,
// so mark pending ones hidden explicitly until their swap finishes.
const style = document.createElement("style");
style.textContent = 'a[data-popcorn="pending"]:not(:has(h3)) { visibility: hidden; }';
(document.head || document.documentElement).appendChild(style);

new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", scan);
scan();
