# Skip the Critics

A Chrome extension that shows the Rotten Tomatoes **Popcornmeter** (audience score) instead of the **Tomatometer** (critics' score) in Google search results.

- Swaps the score, label and tomato icon in Google's movie/TV info panel
- Updates "Rating: XX%" on regular Rotten Tomatoes search results
- Full popcorn bucket for 60%+, spilled bucket below (Rotten Tomatoes' own convention)
- No tracking, no data collection. See the [privacy policy](store/PRIVACY.md)

## How it works
The content script finds links to Rotten Tomatoes on Google results pages. The background service worker loads each linked Rotten Tomatoes page, reads the audience score from the page's embedded scorecard JSON, and caches it locally for 12 hours.

## Install locally
1. Open `chrome://extensions` and turn on **Developer mode**
2. Click **Load unpacked** and select this folder

## Build for the Chrome Web Store
```sh
./build.sh
```
This creates `dist/skip-the-critics-<version>.zip`. Listing copy and permission justifications are in [store/LISTING.md](store/LISTING.md).

---
Not affiliated with, endorsed by, or sponsored by Rotten Tomatoes, Fandango, or Google. "Rotten Tomatoes", "Tomatometer" and "Popcornmeter" are trademarks of their respective owners.
