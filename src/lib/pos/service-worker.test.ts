import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";

const origin = "https://pos.example";
const source = readFileSync(new URL("../../../public/service-worker.js", import.meta.url), "utf8");
const html = (version = "one") => `<html><link href="/_next/static/${version}.css" rel="stylesheet"><script src="/_next/static/${version}.js"></script><a href="/api/pos">Private</a></html>`;
const key = (request: string | { url: string }) => typeof request === "string" ? request : request.url;

function worker() {
  const stores = new Map<string, Map<string, Response>>();
  const messages: unknown[] = [];
  let document = html();
  let offline = false;
  let signedOut = false;
  let missing = "";
  const fetch = vi.fn(async (request: string | { url: string }) => {
    if (offline) throw Error("offline");
    const url = key(request);
    if (url.includes(missing) && missing) return new Response("Missing", { status: 404 });
    if (new URL(url).pathname === "/pos") {
      const response = new Response(signedOut ? "<html>Sign in</html>" : document, { headers: { "Content-Type": "text/html" } });
      if (signedOut) {
        Object.defineProperty(response, "redirected", { value: true });
        const clone = response.clone.bind(response);
        response.clone = () => {
          const copy = clone();
          Object.defineProperty(copy, "redirected", { value: true });
          return copy;
        };
      }
      return response;
    }
    if (url.endsWith(".css")) return new Response("@font-face{src:url('./media/type.woff2')}", { headers: { "Content-Type": "text/css" } });
    return new Response("asset");
  });
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  runInNewContext(source, {
    URL, Request, Response, TextEncoder, Uint8Array, Set, crypto: webcrypto,
    AbortController, setTimeout, clearTimeout, fetch,
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          match: async (request: string | { url: string }) => store.get(key(request))?.clone(),
          put: async (request: string | { url: string }, response: Response) => { store.set(key(request), response.clone()); },
        };
      },
    },
    self: {
      location: new URL("/service-worker.js", origin),
      addEventListener: (type: string, handler: typeof handlers[string]) => { handlers[type] = handler; },
      skipWaiting: vi.fn(),
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (message: unknown) => messages.push(message) }] },
    },
  });
  return {
    stores, messages, fetch,
    setOffline: () => { offline = true; },
    signOut: () => { signedOut = true; },
    nextBuild: (body: string, missingAsset = "") => { document = body; missing = missingAsset; },
    async dispatch(type: string, data: Record<string, unknown> = {}) {
      const waits: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      handlers[type]({
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
        respondWith: (promise: Promise<Response>) => { response = promise; },
        ...data,
      });
      await Promise.all(waits);
      return response ? await response : undefined;
    },
  };
}

describe("POS public shell service worker", () => {
  it("prewarms initial document, scripts, styles, CSS fonts and brand assets before readiness", async () => {
    const sw = worker();
    await sw.dispatch("install");
    expect(sw.fetch).toHaveBeenCalledWith(origin + "/pos", { cache: "reload", credentials: "same-origin" });
    const saved = [...sw.stores.values()][0];
    for (const path of ["/pos", "/_next/static/one.js", "/_next/static/one.css", "/_next/static/media/type.woff2", "/brand/text-icon.svg", "/brand/text-icon-512.png"])
      expect(saved.has(origin + path)).toBe(true);
    expect(sw.fetch.mock.calls.map(([request]) => key(request))).not.toContain(origin + "/images/Logo.png");
    expect(saved.has(origin + "/api/pos")).toBe(false);
    expect(sw.messages).toContainEqual({ type: "POS_SHELL_READY" });
  });

  it("serves the committed shell and its static dependencies after a network failure", async () => {
    const sw = worker();
    await sw.dispatch("install");
    sw.setOffline();
    const response = await sw.dispatch("fetch", { request: { url: origin + "/pos", method: "GET", mode: "navigate" } });
    expect(await response?.text()).toBe(html());
    const asset = await sw.dispatch("fetch", { request: { url: origin + "/_next/static/one.js", method: "GET", mode: "cors" } });
    expect(await asset?.text()).toBe("asset");
  });

  it("returns the login redirect instead of a cached workspace after sign-out", async () => {
    const sw = worker();
    await sw.dispatch("install");
    const original = [...sw.stores.keys()];
    sw.signOut();
    const response = await sw.dispatch("fetch", { request: { url: origin + "/pos", method: "GET", mode: "navigate" } });
    expect(response?.redirected).toBe(true);
    expect(await response?.text()).toBe("<html>Sign in</html>");
    expect([...sw.stores.keys()]).toEqual(original);
  });

  it("never handles APIs, auth, private reports, RSC requests, cross-origin requests or mutations", async () => {
    const sw = worker();
    for (const [path, method, mode] of [
      ["/api/pos", "GET", "cors"], ["/api/pos", "POST", "cors"],
      ["/auth/sign-out", "POST", "navigate"], ["/app/sales", "GET", "navigate"],
      ["/dashboard", "GET", "navigate"], ["/pos?_rsc=abc", "GET", "cors"],
      ["/pos", "GET", "cors"],
    ]) expect(await sw.dispatch("fetch", { request: { url: origin + path, method, mode } })).toBeUndefined();
    expect(await sw.dispatch("fetch", { request: { url: "https://other.example/_next/static/file.js", method: "GET", mode: "cors" } })).toBeUndefined();
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("keeps the complete old generation and retired till storage when a build is incomplete", async () => {
    const sw = worker();
    sw.stores.set("retired-till", new Map());
    await sw.dispatch("install");
    const original = [...sw.stores.keys()];
    sw.nextBuild(html("two"), "two.js");
    await sw.dispatch("message", { data: { type: "POS_PREPARE_SHELL" } });
    expect([...sw.stores.keys()]).toEqual(original);
    sw.setOffline();
    const response = await sw.dispatch("fetch", { request: { url: origin + "/pos", method: "GET", mode: "navigate" } });
    expect(await response?.text()).toBe(html());
  });

  it("commits a new build separately and retains old chunks for live tabs", async () => {
    const sw = worker();
    await sw.dispatch("install");
    sw.nextBuild(html("two"));
    await sw.dispatch("message", { data: { type: "POS_PREPARE_SHELL" } });
    expect([...sw.stores.keys()].filter(name => name.startsWith("sip-snap-pos-shell-v1-")).length).toBe(2);
    sw.setOffline();
    const response = await sw.dispatch("fetch", { request: { url: origin + "/pos", method: "GET", mode: "navigate" } });
    expect(await response?.text()).toBe(html("two"));
    const asset = await sw.dispatch("fetch", { request: { url: origin + "/_next/static/one.js", method: "GET", mode: "cors" } });
    expect(await asset?.text()).toBe("asset");
  });

  it("selects a verified rollback without mixing or removing either build's assets", async () => {
    const sw = worker();
    await sw.dispatch("install");
    sw.nextBuild(html("two"));
    await sw.dispatch("message", { data: { type: "POS_PREPARE_SHELL" } });
    sw.nextBuild(html("one"));
    await sw.dispatch("message", { data: { type: "POS_PREPARE_SHELL" } });
    sw.setOffline();
    const response = await sw.dispatch("fetch", { request: { url: origin + "/pos", method: "GET", mode: "navigate" } });
    expect(await response?.text()).toBe(html("one"));
    const asset = await sw.dispatch("fetch", { request: { url: origin + "/_next/static/two.js", method: "GET", mode: "cors" } });
    expect(await asset?.text()).toBe("asset");
  });
});

it("installs as the POS with text-only icons at both required sizes", () => {
  expect(manifest()).toMatchObject({ start_url: "/pos", scope: "/", display: "standalone", short_name: "Sip&Snap" });
  for (const icon of manifest().icons ?? []) {
    expect(readFileSync(new URL(`../../../public${icon.src}`, import.meta.url)).length).toBeGreaterThan(0);
  }
  expect(manifest().icons?.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  const svg = readFileSync(new URL("../../../public/brand/text-icon.svg", import.meta.url), "utf8");
  expect(svg).toContain(">Sip&amp;Snap</text>");
  expect(svg).not.toMatch(/<image|<path/);
  for (const [file, size] of [["text-icon-192.png", 192], ["text-icon-512.png", 512], ["text-apple-touch-icon.png", 180]] as const) {
    const png = readFileSync(new URL(`../../../public/brand/${file}`, import.meta.url));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
});
