import type { ShopData } from "@/lib/menu/domain";
import { checkoutSchema, type Checkout } from "@/lib/sales/domain";

// Separate from the retired offline till. Never delete another till's data.
const databaseName = "sip-snap-pos-offline-v1";
export const offlineChangeEvent = "pos-offline-changed";
export const offlineChangeKey = "sip-snap-pos-change";
const revocationCookie = "sip-snap-pos-revoked";

export type QueuedSale = {
  id: string;
  scope: string;
  checkout: Checkout;
  savedAt: string;
  error?: string;
};
type CatalogSnapshot = { key: string; data: ShopData; savedAt: string };

export class CatalogSessionChangedError extends Error {
  constructor() {
    super("POS access changed while the menu was loading. Sign in online to refresh this POS.");
    this.name = "CatalogSessionChangedError";
  }
}

function nextCatalogEpoch() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
}

function currentRevocation() {
  if (typeof document === "undefined") return "";
  try {
    return document.cookie.split(";").map(value => value.trim())
      .find(value => value.startsWith(`${revocationCookie}=`))?.slice(revocationCookie.length + 1) ?? "";
  } catch { return ""; }
}

/** This synchronous marker also works when IndexedDB cannot be opened. */
export function markOfflineSignedOut(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${revocationCookie}=${encodeURIComponent(nextCatalogEpoch())}; Path=/; SameSite=Strict; Max-Age=31536000`;
  } catch { /* The server signout and durable epoch revocation must still run. */ }
  announceChange();
}

type CatalogEpoch = { epoch: string; revocation: string };
function decodeCatalogEpoch(token: string): CatalogEpoch {
  try {
    const value: CatalogEpoch = JSON.parse(token);
    if (typeof value?.epoch === "string" && typeof value.revocation === "string") return value;
  } catch { /* A stale/invalid token cannot authorize offline access. */ }
  throw new CatalogSessionChangedError();
}

export function scopeFor(data: Pick<ShopData, "shop" | "user_id">) {
  return `${data.shop.id}:${data.user_id}`;
}

function storageError(cause?: unknown) {
  const detail = cause instanceof Error ? ` ${cause.message}` : "";
  return new Error(
    `POS storage is unavailable. Keep this browser's data and free device storage or allow site storage before taking another offline sale.${detail}`,
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(storageError());
      return;
    }
    let abandoned = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(databaseName, 1); }
    catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("catalog", { keyPath: "key" });
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("outbox", { keyPath: "id" }).createIndex("scope", "scope");
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => {
      abandoned = true;
      reject(storageError(new Error("Close other POS tabs and try again.")));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

/** Resolve only after commit: a request succeeding does not prove durability. */
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  schedule: (tx: IDBTransaction, result: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction | undefined;
    let value: T;
    let failure: Error | undefined;
    try {
      const current = db.transaction(stores, mode);
      tx = current;
      current.oncomplete = () => { db.close(); resolve(value); };
      current.onabort = () => { db.close(); reject(failure ?? storageError(current.error)); };
      current.onerror = () => { /* onabort owns rejection after rollback. */ };
      schedule(current, (next) => { value = next; }, (error) => { failure = error; current.abort(); });
    } catch (error) {
      tx?.abort();
      db.close();
      reject(storageError(error));
    }
  });
}

function announceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(offlineChangeEvent));
  try {
    window.localStorage.setItem(offlineChangeKey, `${Date.now()}:${Math.random()}`);
  } catch { /* Storage events are supplementary; IndexedDB remains authoritative. */ }
}

/** Capture before a network request, so its response cannot undo a later logout. */
export function readCatalogEpoch(): Promise<string> {
  return transaction(["meta"], "readonly", (tx, result) => {
    const epoch = tx.objectStore("meta").get("epoch");
    epoch.onsuccess = () => result(JSON.stringify({ epoch: epoch.result?.value ?? "0", revocation: currentRevocation() } satisfies CatalogEpoch));
  });
}

export async function saveCatalog(data: ShopData, expectedEpoch?: string): Promise<void> {
  const expected = expectedEpoch === undefined ? undefined : decodeCatalogEpoch(expectedEpoch);
  await transaction<void>(["catalog", "meta"], "readwrite", (tx, _result, fail) => {
    const key = scopeFor(data);
    const meta = tx.objectStore("meta");
    const epoch = meta.get("epoch");
    epoch.onsuccess = () => {
      if (expected && (expected.epoch !== (epoch.result?.value ?? "0") || expected.revocation !== currentRevocation())) {
        fail(new CatalogSessionChangedError());
        return;
      }
      const active = meta.get("active");
      active.onsuccess = () => {
        try {
          tx.objectStore("catalog").put({ key, data, savedAt: new Date().toISOString() } satisfies CatalogSnapshot);
          if (active.result?.value !== key) meta.put({ key: "epoch", value: nextCatalogEpoch() });
          meta.put({ key: "active", value: key });
        } catch (error) { fail(storageError(error)); }
      };
    };
  });
  if (expected) {
    // Logout may have happened while this transaction was committing.
    if (expected.revocation !== currentRevocation()) throw new CatalogSessionChangedError();
    if (expected.revocation && typeof document !== "undefined")
      document.cookie = `${revocationCookie}=; Path=/; SameSite=Strict; Max-Age=0`;
  }
  announceChange();
}

export async function readActiveCatalog(): Promise<{ data: ShopData; savedAt: string } | undefined> {
  if (currentRevocation()) return undefined;
  const snapshot = await transaction<{ data: ShopData; savedAt: string } | undefined>(["catalog", "meta"], "readonly", (tx, result, fail) => {
    const active = tx.objectStore("meta").get("active");
    active.onsuccess = () => {
      if (!active.result) { result(undefined); return; }
      const catalog = tx.objectStore("catalog").get(active.result.value);
      catalog.onsuccess = () => {
        const snapshot = catalog.result as CatalogSnapshot | undefined;
        if (!snapshot) { result(undefined); return; }
        if (!snapshot.data?.shop?.id || !snapshot.data.user_id ||
          !Array.isArray(snapshot.data.products) || !Array.isArray(snapshot.data.categories) ||
          snapshot.key !== active.result.value || snapshot.key !== scopeFor(snapshot.data)) {
          fail(storageError(new Error("The saved catalog could not be read. Sign in online to refresh it.")));
          return;
        }
        result({ data: snapshot.data, savedAt: snapshot.savedAt });
      };
    };
  });
  return currentRevocation() ? undefined : snapshot;
}

/** Signing out revokes offline access; unsynced money records are preserved. */
export async function deactivateCatalog(expectedEpoch?: string): Promise<void> {
  const expected = expectedEpoch === undefined ? undefined : decodeCatalogEpoch(expectedEpoch);
  await transaction<void>(["meta"], "readwrite", (tx, _result, fail) => {
    const meta = tx.objectStore("meta");
    const revoke = () => {
      try {
        meta.delete("active");
        meta.put({ key: "epoch", value: nextCatalogEpoch() });
      } catch (error) { fail(storageError(error)); }
    };
    if (!expected) { revoke(); return; }
    const epoch = meta.get("epoch");
    epoch.onsuccess = () => {
      if (expected.epoch !== (epoch.result?.value ?? "0") || expected.revocation !== currentRevocation()) {
        fail(new CatalogSessionChangedError());
        return;
      }
      revoke();
    };
  });
  announceChange();
}

export async function enqueueSale(data: ShopData, checkout: Checkout): Promise<void> {
  const validated = checkoutSchema.parse(checkout);
  const scope = scopeFor(data);
  if (currentRevocation()) throw new CatalogSessionChangedError();
  await transaction<void>(["outbox", "meta"], "readwrite", (tx, _result, fail) => {
    const store = tx.objectStore("outbox");
    const active = tx.objectStore("meta").get("active");
    active.onsuccess = () => {
      if (active.result?.value !== scope || currentRevocation()) {
        fail(new Error("Sign in online with this account and shop before saving another sale. Offline access has changed."));
        return;
      }
      const existing = store.get(validated.id);
      existing.onsuccess = () => {
        const saved = existing.result as QueuedSale | undefined;
        try {
          if (saved) {
            if (saved.scope !== scope || JSON.stringify(checkoutSchema.parse(saved.checkout)) !== JSON.stringify(validated))
              fail(new Error("This sale ID already belongs to a different saved sale. Its original record has been preserved."));
            return;
          }
          store.add({ id: validated.id, scope, checkout: validated, savedAt: new Date().toISOString() } satisfies QueuedSale);
        } catch (error) {
          fail(storageError(error));
        }
      };
    };
  });
  announceChange();
}

export async function listSales(scope: string): Promise<QueuedSale[]> {
  return transaction<QueuedSale[]>(["outbox"], "readonly", (tx, result) => {
    const request = tx.objectStore("outbox").index("scope").getAll(scope);
    request.onsuccess = () => result((request.result as QueuedSale[]).sort(
      (a, b) => a.savedAt.localeCompare(b.savedAt) || a.id.localeCompare(b.id),
    ));
  });
}

async function changeSale(scope: string, id: string, change: (store: IDBObjectStore, sale: QueuedSale) => void) {
  await transaction<void>(["outbox"], "readwrite", (tx, _result, fail) => {
    const store = tx.objectStore("outbox");
    const request = store.get(id);
    request.onsuccess = () => {
      const sale = request.result as QueuedSale | undefined;
      if (!sale) return;
      if (sale.scope !== scope) {
        fail(new Error("This saved sale belongs to a different account or shop."));
        return;
      }
      try { change(store, sale); }
      catch (error) { fail(storageError(error)); }
    };
  });
  announceChange();
}

export function removeSale(scope: string, id: string): Promise<void> {
  return changeSale(scope, id, (store) => { store.delete(id); });
}

export function setSaleError(scope: string, id: string, message: string): Promise<void> {
  return changeSale(scope, id, (store, sale) => { store.put({ ...sale, error: message }); });
}
