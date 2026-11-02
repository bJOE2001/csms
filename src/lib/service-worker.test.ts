import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/service-worker.js", import.meta.url), "utf8");

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = { put: vi.fn().mockResolvedValue(undefined), addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined) };
  const caches = { match: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(["coffee-public-shell-v2", "another-app"]), delete: vi.fn().mockResolvedValue(true) };
  const response = { ok: true, type: "basic", clone: () => ({ body: "new module" }) };
  const fetch = vi.fn().mockResolvedValue(response);
  runInNewContext(source, { URL, Response, caches, fetch, self: { location: { origin: "http://localhost:3000" }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), skipWaiting: vi.fn(), clients: { claim: vi.fn() } } });
  return { handlers, cache, caches, fetch, response };
}

describe("service worker asset versions", () => {
  it.each(["/_next/static/chunks/app/app/page.js", "/_next/static/chunks/webpack.js?v=123", "/_next/static/css/app/layout.css?v=123", "/_next/static/webpack/abc.hot-update.js"])("leaves mutable development asset %s on the network", (path) => {
    const w = worker();
    const respondWith = vi.fn();
    w.handlers.get("fetch")!({ request: new Request(`http://localhost:3000${path}`), respondWith, waitUntil: vi.fn() });
    expect(respondWith).not.toHaveBeenCalled();
    expect(w.caches.match).not.toHaveBeenCalled();
  });

  it.each(["/_next/static/chunks/app/app/page-934de972a217b942.js", "/_next/static/css/934de972a217b942.css"])("retains immutable production asset %s for offline use", async (path) => {
    const w = worker();
    let result: Promise<unknown> | undefined;
    const writes: Promise<unknown>[] = [];
    const request = new Request(`http://localhost:3000${path}`);
    w.handlers.get("fetch")!({ request, respondWith: (value: Promise<unknown>) => { result = value; }, waitUntil: (value: Promise<unknown>) => writes.push(value) });
    expect(await result).toBe(w.response);
    await Promise.all(writes);
    expect(w.cache.put).toHaveBeenCalledWith(request, { body: "new module" });
  });

  it("retires the old application cache without touching other applications", async () => {
    const w = worker();
    let activation: Promise<unknown> | undefined;
    w.handlers.get("activate")!({ waitUntil: (value: Promise<unknown>) => { activation = value; } });
    await activation;
    expect(w.caches.delete).toHaveBeenCalledWith("coffee-public-shell-v2");
    expect(w.caches.delete).not.toHaveBeenCalledWith("another-app");
  });
});
