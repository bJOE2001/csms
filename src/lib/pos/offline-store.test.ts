import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import type { ShopData } from "@/lib/menu/domain";
import type { Checkout } from "@/lib/sales/domain";
import {
  CatalogSessionChangedError, deactivateCatalog, enqueueSale, listSales, readActiveCatalog,
  markOfflineSignedOut, readCatalogEpoch, removeSale, saveCatalog, scopeFor, setSaleError,
} from "./offline-store";

const owner = "10000000-0000-4000-8000-000000000001";
const shopId = "20000000-0000-4000-8000-000000000001";
const catalog: ShopData = {
  shop: { id: shopId, name: "Coffee" }, user_id: owner, founder: true,
  products: [], categories: [],
};
const sale: Checkout = {
  id: "30000000-0000-4000-8000-000000000001", method: "cash", tendered_cents: 15000,
  items: [{ product_id: "40000000-0000-4000-8000-000000000001", quantity: 1, price_cents: 15000 }],
};

function stubCookieDocument() {
  const cookies = new Map<string, string>();
  vi.stubGlobal("document", {
    get cookie() { return Array.from(cookies, ([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(raw: string) {
      const [pair] = raw.split(";");
      const separator = pair.indexOf("=");
      const key = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (/Max-Age=0(?:;|$)/i.test(raw)) cookies.delete(key);
      else cookies.set(key, value);
    },
  });
}

beforeEach(async () => { vi.stubGlobal("indexedDB", new IDBFactory()); await saveCatalog(catalog); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("offline POS durability and isolation", () => {
  it("commits catalog plus active identity, then revokes offline access without losing sales", async () => {
    await saveCatalog(catalog);
    await enqueueSale(catalog, sale);
    expect((await readActiveCatalog())?.data).toEqual(catalog);
    await deactivateCatalog();
    expect(await readActiveCatalog()).toBeUndefined();
    expect((await listSales(scopeFor(catalog))).map(row => row.checkout)).toEqual([sale]);
    await saveCatalog(catalog);
    expect((await readActiveCatalog())?.data).toEqual(catalog);
    expect(await listSales(scopeFor(catalog))).toHaveLength(1);
  });

  it("serializes simultaneous inserts and refuses to overwrite a UUID's money or identity", async () => {
    await Promise.all([enqueueSale(catalog, sale), enqueueSale(catalog, sale)]);
    expect(await listSales(scopeFor(catalog))).toHaveLength(1);
    await expect(enqueueSale(catalog, { ...sale, tendered_cents: 16000 })).rejects.toThrow("original record has been preserved");
    const other = { ...catalog, user_id: "another-user" };
    await saveCatalog(other);
    await expect(enqueueSale(other, sale)).rejects.toThrow("different saved sale");
    expect((await listSales(scopeFor(catalog)))[0].checkout).toEqual(sale);
  });

  it("keeps another account's queue inaccessible to active identity and scoped mutations", async () => {
    await enqueueSale(catalog, sale);
    const other = { ...catalog, user_id: "another-user" };
    await saveCatalog(other);
    expect((await readActiveCatalog())?.data.user_id).toBe("another-user");
    expect(await listSales(scopeFor(other))).toEqual([]);
    await expect(removeSale(scopeFor(other), sale.id)).rejects.toThrow("different account or shop");
    await expect(setSaleError(scopeFor(other), sale.id, "Oops")).rejects.toThrow("different account or shop");
    expect(await listSales(scopeFor(catalog))).toHaveLength(1);
  });

  it("retains rejected sales unchanged and removes only an explicitly acknowledged UUID", async () => {
    const second = { ...sale, id: "30000000-0000-4000-8000-000000000002" };
    await enqueueSale(catalog, second);
    await enqueueSale(catalog, sale);
    await setSaleError(scopeFor(catalog), sale.id, "Not enough tracked stock");
    const queued = await listSales(scopeFor(catalog));
    expect(queued.find(row => row.id === sale.id)).toMatchObject({ checkout: sale, error: "Not enough tracked stock" });
    await removeSale(scopeFor(catalog), second.id);
    expect((await listSales(scopeFor(catalog))).map(row => row.id)).toEqual([sale.id]);
  });

  it("rejects unavailable storage instead of claiming the offline sale was saved", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(enqueueSale(catalog, sale)).rejects.toThrow("POS storage is unavailable");
  });

  it("rejects a stale tab after signout or account change without accepting another sale", async () => {
    await deactivateCatalog();
    await expect(enqueueSale(catalog, sale)).rejects.toThrow("Offline access has changed");
    await saveCatalog({ ...catalog, user_id: "another-user" });
    await expect(enqueueSale(catalog, sale)).rejects.toThrow("Offline access has changed");
    expect(await listSales(scopeFor(catalog))).toEqual([]);
  });

  it("rejects a late network response after logout without reviving offline access or losing money records", async () => {
    await enqueueSale(catalog, sale);
    const requestedEpoch = await readCatalogEpoch();
    await deactivateCatalog();
    await expect(saveCatalog(catalog, requestedEpoch)).rejects.toBeInstanceOf(CatalogSessionChangedError);
    expect(await readActiveCatalog()).toBeUndefined();
    expect((await listSales(scopeFor(catalog)))[0].checkout).toEqual(sale);
    const freshEpoch = await readCatalogEpoch();
    expect(freshEpoch).not.toBe(requestedEpoch);
    await saveCatalog(catalog, freshEpoch);
    expect((await readActiveCatalog())?.data).toEqual(catalog);
  });

  it("serializes competing account responses from the same initial epoch", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const initialEpoch = await readCatalogEpoch();
    const other = { ...catalog, user_id: "another-user" };
    const outcomes = await Promise.allSettled([
      saveCatalog(catalog, initialEpoch), saveCatalog(other, initialEpoch),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(CatalogSessionChangedError);
    expect(await readCatalogEpoch()).not.toBe(initialEpoch);
  });

  it("keeps the epoch for same-account refreshes and advances it for every revocation or account switch", async () => {
    const first = await readCatalogEpoch();
    await saveCatalog({ ...catalog, products: [] }, first);
    expect(await readCatalogEpoch()).toBe(first);
    await saveCatalog({ ...catalog, user_id: "another-user" }, first);
    const switched = await readCatalogEpoch();
    expect(switched).not.toBe(first);
    await deactivateCatalog();
    const revoked = await readCatalogEpoch();
    expect(revoked).not.toBe(switched);
    await deactivateCatalog();
    expect(await readCatalogEpoch()).not.toBe(revoked);
  });

  it("does not let an old unauthorized response revoke a newer account's offline session", async () => {
    await enqueueSale(catalog, sale);
    const oldRequest = await readCatalogEpoch();
    const other = { ...catalog, user_id: "another-user" };
    await saveCatalog(other, oldRequest);
    const newSession = await readCatalogEpoch();
    await expect(deactivateCatalog(oldRequest)).rejects.toBeInstanceOf(CatalogSessionChangedError);
    expect(await readCatalogEpoch()).toBe(newSession);
    expect((await readActiveCatalog())?.data).toEqual(other);
    expect((await listSales(scopeFor(catalog)))[0].checkout).toEqual(sale);
    await deactivateCatalog(newSession);
    expect(await readActiveCatalog()).toBeUndefined();
    expect(await readCatalogEpoch()).not.toBe(newSession);
  });

  it("does not let a stale cookie token conditionally revoke newer access", async () => {
    stubCookieDocument();
    const request = await readCatalogEpoch();
    markOfflineSignedOut();
    const revoked = await readCatalogEpoch();
    await expect(deactivateCatalog(request)).rejects.toBeInstanceOf(CatalogSessionChangedError);
    expect(await readCatalogEpoch()).toBe(revoked);
    await deactivateCatalog(revoked);
    expect(await readCatalogEpoch()).not.toBe(revoked);
  });

  it("revokes cached access synchronously when IndexedDB logout fails and rejects its late GET", async () => {
    stubCookieDocument();
    await enqueueSale(catalog, sale);
    const beforeLogout = await readCatalogEpoch();
    const database = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    markOfflineSignedOut();
    await expect(deactivateCatalog()).rejects.toThrow("storage is unavailable");
    expect(await readActiveCatalog()).toBeUndefined();
    vi.stubGlobal("indexedDB", database);
    await expect(saveCatalog(catalog, beforeLogout)).rejects.toBeInstanceOf(CatalogSessionChangedError);
    await expect(enqueueSale(catalog, { ...sale, id: "30000000-0000-4000-8000-000000000002" })).rejects.toBeInstanceOf(CatalogSessionChangedError);
    expect(await readActiveCatalog()).toBeUndefined();
    expect((await listSales(scopeFor(catalog)))[0].checkout).toEqual(sale);
    // Only a verified request started after the revocation can reactivate it.
    const newRequest = await readCatalogEpoch();
    await saveCatalog(catalog, newRequest);
    expect((await readActiveCatalog())?.data).toEqual(catalog);
    expect(document.cookie).not.toContain("sip-snap-pos-revoked=");
  });

  it("does not clear a newer signout marker or let an unguarded save bypass it", async () => {
    stubCookieDocument();
    markOfflineSignedOut();
    const request = await readCatalogEpoch();
    markOfflineSignedOut();
    const newerCookie = document.cookie;
    await expect(saveCatalog(catalog, request)).rejects.toBeInstanceOf(CatalogSessionChangedError);
    expect(document.cookie).toBe(newerCookie);
    await saveCatalog(catalog);
    expect(document.cookie).toBe(newerCookie);
    expect(await readActiveCatalog()).toBeUndefined();
  });

  it("aborts a failed write before accepting a sale", async () => {
    const write = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementationOnce(() => {
      throw new DOMException("Device full", "QuotaExceededError");
    });
    await expect(enqueueSale(catalog, sale)).rejects.toThrow("Device full");
    write.mockRestore();
    expect(await listSales(scopeFor(catalog))).toEqual([]);
    await enqueueSale(catalog, sale);
    expect(await listSales(scopeFor(catalog))).toHaveLength(1);
  });

  it("rolls back the catalog write if the active identity write fails", async () => {
    await saveCatalog(catalog);
    const other = { ...catalog, user_id: "another-user" };
    const original = IDBObjectStore.prototype.put;
    const write = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "meta") throw new DOMException("Device full", "QuotaExceededError");
      return original.call(this, value, key);
    });
    await expect(saveCatalog(other)).rejects.toThrow("Device full");
    write.mockRestore();
    expect((await readActiveCatalog())?.data).toEqual(catalog);
  });
});
