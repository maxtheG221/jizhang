import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

function serviceWorker(): Plugin {
  return {
    name: "jizhang-sw",
    apply: "build",
    async closeBundle() {
      const dist = path.resolve("dist");
      const files: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.name !== "sw.js") {
            files.push(`./${path.relative(dist, full).split(path.sep).join("/")}`);
          }
        }
      };
      await walk(dist);
      files.sort();
      const hash = createHash("sha256");
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(path.join(dist, file.slice(2))));
      }
      const version = hash.digest("hex").slice(0, 12);
      const source = `const CACHE = "jizhang-${version}";
const ASSETS = ${JSON.stringify(files)};

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (asset) => {
      const response = await fetch(asset, { cache: "reload" });
      if (!response.ok) throw new Error("Precache failed: " + asset);
      await cache.put(asset, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(request)) || (await cache.match(request.url));
    if (request.mode === "navigate") {
      if (cached) return cached;
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    } else if (cached) {
      return cached;
    }
    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
`;
      await writeFile(path.join(dist, "sw.js"), source);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  test: { environment: "node" },
  build: { sourcemap: false },
  server: { host: "127.0.0.1", port: 47321, strictPort: true },
  preview: { host: "127.0.0.1", port: 47321, strictPort: true },
});
