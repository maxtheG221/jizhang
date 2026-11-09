import { chromium, devices } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:47321/";
const out = process.argv[3] ?? "/tmp/jizhang-shots";
await mkdir(out, { recursive: true });

const categories = [
  ["exp-0", "expense", "餐飲", 0],
  ["exp-1", "expense", "超市", 1],
  ["exp-2", "expense", "交通", 2],
  ["exp-3", "expense", "住宿", 3],
  ["exp-4", "expense", "學業", 4],
  ["exp-5", "expense", "健身", 5],
  ["exp-6", "expense", "服裝", 6],
  ["exp-7", "expense", "交易/投資", 7],
  ["exp-8", "expense", "娛樂", 8],
  ["exp-sub", "expense", "訂閱", 9],
  ["exp-9", "expense", "其他", 10, true],
  ["inc-0", "income", "收入", 0],
  ["inc-1", "income", "其他收入", 1, true],
].map(([id, kind, name, sort, locked]) => ({ id, kind, name, sort, ...(locked ? { locked: true } : {}) }));

const rows = [
  ["t1", "expense", "exp-3", 45000, "2026-11-01", "十一月房租", 1],
  ["t2", "expense", "exp-2", 8640, "2026-11-01", "Navigo 月票", 2],
  ["t3", "income", "inc-0", 80000, "2026-11-01", "家裡生活費", 3],
  ["t4", "expense", "exp-6", 4500, "2026-11-02", "白襯衫", 4],
  ["t5", "expense", "exp-0", 1840, "2026-11-03", "早午餐", 5],
  ["t6", "expense", "exp-1", 3672, "2026-11-04", "超市採買", 6],
  ["t7", "expense", "exp-7", 2000, "2026-11-04", "零股", 7],
  ["t8", "expense", "exp-8", 1350, "2026-11-05", "電影", 8],
  ["t9", "expense", "exp-0", 480, "2026-11-05", "電影零食", 9],
  ["t10", "income", "inc-1", 18000, "2026-11-05", "實習津貼", 10],
  ["t11", "expense", "exp-5", 2999, "2026-11-06", "健身房月費", 11],
  ["t12", "expense", "exp-sub", 1349, "2026-11-06", "音樂", 12],
  ["t13", "expense", "exp-4", 2490, "2026-11-07", "教材", 13],
  ["t14", "expense", "exp-0", 3200, "2026-11-08", "同學晚餐", 14],
  ["t15", "expense", "exp-1", 845, "2026-11-08", "水果", 15],
  ["t16", "expense", "exp-0", 420, "2026-11-09", "校園咖啡", 16],
  ["t17", "expense", "exp-2", 215, "2026-11-09", "地鐵", 17],
];

const snapshot = {
  categories,
  transactions: rows.map(([id, kind, categoryId, amountCents, date, note, createdAt]) => ({
    id,
    kind,
    categoryId,
    amountCents,
    date,
    note,
    createdAt,
    updatedAt: createdAt,
  })),
  budgets: { "2026-11": 90000 },
  defaultBudgetCents: 90000,
  lastExportAt: Date.parse("2026-11-08T18:30:00Z"),
};

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function seed(page) {
  await page.evaluate(async (value) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("jizhang", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("kv")) request.result.createObjectStore("kv", { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key: "snapshot", value });
        tx.oncomplete = () => {
          db.close();
          resolve(null);
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, snapshot);
}

const browser = await chromium.launch();
const failures = [];
const iphone = {
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  locale: "zh-TW",
  timezoneId: "Europe/Paris",
};

async function newPage() {
  const context = await browser.newContext(iphone);
  await context.clock.install({ time: new Date("2026-11-09T12:00:00Z") });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return { context, page };
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

const empty = await newPage();
await empty.page.goto(base);
await empty.page.waitForSelector("[data-ready]");
const fontOk = await empty.page.evaluate(() => document.fonts.check('500 40px "Cormorant Garamond"'));
if (!fontOk) failures.push("Cormorant Garamond did not load");
await empty.page.waitForTimeout(150);
await shot(empty.page, "empty");
const emptyText = await empty.page.locator("body").innerText();
if (!emptyText.includes("這個月還沒有紀錄")) failures.push("empty state copy missing");
if (!emptyText.includes("十一月")) failures.push("Paris month label missing");

await seed(empty.page);
await empty.page.reload();
await empty.page.waitForSelector("[data-ready]");
await empty.page.waitForTimeout(200);
await shot(empty.page, "month");
const monthText = await empty.page.locator("body").innerText();
if (!monthText.includes("今天")) failures.push("today tag missing for Paris date");
if (!monthText.includes("總支出")) failures.push("summary missing");

await empty.page.getByRole("button", { name: "記一筆" }).click();
await empty.page.locator("[data-field=amount]").fill("14,50");
await empty.page.getByRole("button", { name: "餐飲", exact: true }).click();
await empty.page.locator("[data-field=note]").fill("可麗露");
await empty.page.waitForTimeout(520);
await shot(empty.page, "add");
await empty.page.getByRole("button", { name: "關閉" }).click();

await empty.page.getByRole("button", { name: /同學晚餐/ }).click();
await empty.page.waitForTimeout(520);
await shot(empty.page, "edit");
await empty.page.getByRole("button", { name: "刪除這筆紀錄" }).click();
await empty.page.waitForTimeout(180);
await shot(empty.page, "delete");
await empty.page.getByRole("button", { name: "取消" }).click();
await empty.page.getByRole("button", { name: "關閉" }).click();

await empty.page.getByRole("button", { name: "分類" }).click();
await empty.page.waitForTimeout(80);
await shot(empty.page, "categories");

await empty.page.getByRole("button", { name: "設定" }).click();
await empty.page.waitForTimeout(80);
await shot(empty.page, "settings");
const settingsText = await empty.page.locator("body").innerText();
if (!settingsText.includes("Safari")) failures.push("iOS warning missing");
if (!settingsText.includes("2026年11月8日")) failures.push(`last export stamp missing: ${settingsText}`);

const [download] = await Promise.all([
  empty.page.waitForEvent("download"),
  empty.page.getByRole("button", { name: "匯出 JSON" }).click(),
]);
const exportedPath = path.join(out, "backup.json");
await download.saveAs(exportedPath);
const exported = JSON.parse(await readFile(exportedPath, "utf8"));
if (exported.app !== "記帳" || exported.transactions.length !== snapshot.transactions.length) {
  failures.push("export JSON did not round-trip the seeded ledger");
}

await empty.page.getByRole("button", { name: "記一筆" }).click();
await empty.page.locator("[data-field=amount]").fill("1,00");
await empty.page.locator("[data-field=note]").fill("臨時");
await empty.page.getByRole("button", { name: "儲存" }).click();
await empty.page.getByRole("button", { name: "設定" }).click();
await empty.page.locator("#import-file").setInputFiles(exportedPath);
await empty.page.getByRole("button", { name: "取代" }).click();
await empty.page.getByRole("button", { name: "本月" }).click();
if (await empty.page.getByText("臨時").count()) failures.push("replace import kept a local-only entry");
if (!(await empty.page.getByText("同學晚餐").count())) failures.push("replace import dropped original entries");

await empty.page.getByRole("button", { name: "記一筆" }).click();
await empty.page.locator("[data-field=amount]").fill("2,00");
await empty.page.locator("[data-field=note]").fill("只在本機");
await empty.page.getByRole("button", { name: "儲存" }).click();
await empty.page.getByRole("button", { name: "設定" }).click();
await empty.page.locator("#import-file").setInputFiles(exportedPath);
await empty.page.getByRole("button", { name: "合併" }).click();
await empty.page.getByRole("button", { name: "本月" }).click();
if (!(await empty.page.getByText("只在本機").count())) failures.push("merge dropped the local entry");
if (!(await empty.page.getByText("同學晚餐").count())) failures.push("merge dropped backup entries");

await empty.context.close();

const offline = await newPage();
await offline.page.goto(base);
await offline.page.waitForSelector("[data-ready]");
await offline.page.waitForFunction(() => navigator.serviceWorker?.controller);
await offline.context.setOffline(true);
await offline.page.reload();
await offline.page.waitForSelector("[data-ready]", { timeout: 8000 });
const offlineText = await offline.page.locator("body").innerText();
if (!offlineText.includes("這個月還沒有紀錄")) failures.push(`offline reload failed: ${offlineText.slice(0, 180)}`);
await offline.context.close();

const manifestRes = await fetch(new URL("manifest.webmanifest", base));
if (!manifestRes.ok) failures.push("manifest request failed");
const manifestType = manifestRes.headers.get("content-type") ?? "";
if (!manifestType.includes("manifest+json") && !manifestType.includes("json")) failures.push(`manifest mime ${manifestType}`);
const manifest = await manifestRes.json();
for (const key of ["name", "short_name", "start_url", "scope", "display"]) {
  if (manifest[key] == null) failures.push(`manifest missing ${key}`);
}
if (manifest.name !== "記帳" || manifest.short_name !== "記帳" || manifest.display !== "standalone") {
  failures.push("manifest identity mismatch");
}
if (manifest.start_url !== "./" || manifest.scope !== "./") failures.push("manifest paths are not relative");
const purposes = new Set(manifest.icons.map((icon) => icon.purpose));
if (!purposes.has("any") || !purposes.has("maskable")) failures.push("manifest icon purposes incomplete");
for (const icon of manifest.icons) {
  if (icon.src.startsWith("/") || icon.src.includes("://")) failures.push(`icon path not relative: ${icon.src}`);
  const response = await fetch(new URL(icon.src, new URL("manifest.webmanifest", base)));
  const bytes = Buffer.from(await response.arrayBuffer());
  const size = pngSize(bytes);
  const expected = Number(icon.sizes.split("x")[0]);
  if (size.width !== expected || size.height !== expected) failures.push(`${icon.src} is ${size.width}x${size.height}`);
}
const apple = await fetch(new URL("icons/apple-touch-icon.png", base));
const appleSize = pngSize(Buffer.from(await apple.arrayBuffer()));
if (appleSize.width !== 180 || appleSize.height !== 180) failures.push("apple touch icon size");

await writeFile(path.join(out, "report.json"), JSON.stringify({ failures, fontOk, manifest }, null, 2));
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`ok ${out}`);
