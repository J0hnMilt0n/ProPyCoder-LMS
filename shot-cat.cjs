const puppeteer = require("puppeteer-core");
const os = require("os");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
(async () => {
  const browser = await puppeteer.launch({ executablePath: edge, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000/courses", { waitUntil: "networkidle2", timeout: 40000 });
  await new Promise(r => setTimeout(r, 1500));
  const imgs = await page.$$eval(".catalog-instructor-avatar", els => els.map(e => ({ tag: e.tagName, natural: e.naturalWidth, complete: e.complete, w: e.width, h: e.height })));
  console.log("AVATARS=" + JSON.stringify(imgs));
  const box = await page.$(".catalog-instructor");
  if (box) await box.screenshot({ path: os.join(os.tmpdir(), "cat-instr.png") });
  await page.screenshot({ path: os.join(os.tmpdir(), "cat-full.png"), fullPage: false });
  await browser.close();
})();
