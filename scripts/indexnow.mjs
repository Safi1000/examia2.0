// Tells Bing (and other IndexNow search engines) about every page in the live
// sitemap, so new pages are crawled within days instead of weeks.
// Run after a deploy:  node scripts/indexnow.mjs
const HOST = "www.hamzateaches.com";
const KEY = "1e4ad7c24c1c1a1563cf6e1a9017ae16"; // public/<KEY>.txt proves the site is ours

const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${res.status} for ${urlList.length} pages`);
