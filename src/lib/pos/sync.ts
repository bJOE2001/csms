import type { ShopData } from "@/lib/menu/domain";
import { deactivateCatalog, listSales, readActiveCatalog, readCatalogEpoch, removeSale, scopeFor, setSaleError } from "./offline-store";

/** Server UUID replay protection also makes simultaneous tabs and lost responses safe. */
export async function syncOfflineSales(identity: ShopData): Promise<number> {
  const scope = scopeFor(identity);
  const queued = await listSales(scope);
  if (!queued.length) return 0;
  const active = await readActiveCatalog();
  if (!active || scopeFor(active.data) !== scope) throw Error("Sign in with the original cashier account to sync these sales.");
  const epoch = await readCatalogEpoch();
  const access = await fetch("/api/pos", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (access.status === 401 || access.status === 403) {
    await deactivateCatalog(epoch);
    throw Error("Sign in again with the original cashier account. Unsynced sales remain saved.");
  }
  if (!access.ok) throw Error("Production is unavailable. Unsynced sales remain saved.");
  const verified: ShopData = await access.json();
  if (!verified?.shop?.id || !verified.user_id)
    throw Error("Production did not confirm the signed-in cashier. Unsynced sales remain saved.");
  if (scopeFor(verified) !== scope) {
    await deactivateCatalog(epoch);
    throw Error("The signed-in account changed. Sign in with the original cashier to sync these sales.");
  }
  let synced = 0;
  for (const sale of queued) {
    const current = await readActiveCatalog();
    if (!current || scopeFor(current.data) !== scope) break;
    try {
      const response = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", shop_id: identity.shop.id, user_id: identity.user_id, data: sale.checkout }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error ?? "Production could not accept this sale. Ask the owner to review it.";
        await setSaleError(scope, sale.id, message);
        if (response.status === 401 || response.status === 403) {
          await deactivateCatalog(epoch);
          throw Error(message);
        }
        if (response.status >= 500 || response.status === 429) break;
        // Price, stock and validation conflicts retain the original paid sale.
        continue;
      }
      // A proxy/login HTML response or unrelated success must never erase money records.
      const expectedTotal = sale.checkout.items.reduce((total, item) => total + item.price_cents * item.quantity, 0);
      if (result.data?.id !== sale.id || !Number.isSafeInteger(result.data?.total_cents) || result.data.total_cents !== expectedTotal)
        throw Error("Production did not confirm this receipt. Its saved copy will be retried safely.");
      await removeSale(scope, sale.id);
      synced++;
    } catch (error) {
      await setSaleError(scope, sale.id, error instanceof Error ? error.message : "Connection interrupted. Sale remains saved.");
      break;
    }
  }
  return synced;
}
