import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { ShopData } from "@/lib/menu/domain";
import type { Checkout } from "@/lib/sales/domain";
import { enqueueSale, listSales, readActiveCatalog, saveCatalog, scopeFor } from "./offline-store";
import { syncOfflineSales } from "./sync";

const catalog: ShopData = {
  shop: { id: "20000000-0000-4000-8000-000000000001", name: "Coffee" },
  user_id: "10000000-0000-4000-8000-000000000001", founder: true, products: [], categories: [],
};
const sale: Checkout = {
  id: "30000000-0000-4000-8000-000000000001", captured_at: "2026-11-13T10:00:00.000Z",
  method: "cash", tendered_cents: 15000,
  items: [{ product_id: "40000000-0000-4000-8000-000000000001", quantity: 1, price_cents: 15000 }],
};
const secondSale: Checkout = { ...sale, id: "30000000-0000-4000-8000-000000000002" };
const scope = scopeFor(catalog);
const json = (value: unknown, status = 200) => Response.json(value, { status });
const confirmation = (id = sale.id) => json({ data: { id, total_cents: 15000 } });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  await saveCatalog(catalog);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("offline sale synchronization", () => {
  it("verifies the cashier, sends the unchanged paid receipt, and deletes only after confirmation", async () => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(confirmation());
    expect(await syncOfflineSales(catalog)).toBe(1);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/pos", expect.objectContaining({ cache: "no-store" })]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      action: "checkout", shop_id: catalog.shop.id, user_id: catalog.user_id, data: sale,
    });
    expect(await listSales(scope)).toEqual([]);
  });

  it("retains a lost response and retries exactly the same UUID and capture time", async () => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockRejectedValueOnce(new TypeError("Response lost"));
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect((await listSales(scope))[0]).toMatchObject({ checkout: sale, error: "Response lost" });
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(confirmation());
    expect(await syncOfflineSales(catalog)).toBe(1);
    expect(fetchMock.mock.calls[3][1]?.body).toEqual(fetchMock.mock.calls[1][1]?.body);
    expect(await listSales(scope)).toEqual([]);
  });

  it("keeps a stale price rejection for review while synchronizing the next valid sale", async () => {
    await enqueueSale(catalog, sale);
    await enqueueSale(catalog, secondSale);
    fetchMock.mockResolvedValueOnce(json(catalog))
      .mockResolvedValueOnce(json({ error: "Product price changed" }, 422))
      .mockResolvedValueOnce(confirmation(secondSale.id));
    expect(await syncOfflineSales(catalog)).toBe(1);
    expect(await listSales(scope)).toEqual([expect.objectContaining({ checkout: sale, error: "Product price changed" })]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403])("revokes expired/forbidden GET access (%s) without posting or discarding receipts", async status => {
    await enqueueSale(catalog, sale);
    await enqueueSale(catalog, secondSale);
    fetchMock.mockResolvedValueOnce(json({ error: "Sign in" }, status));
    await expect(syncOfflineSales(catalog)).rejects.toThrow("original cashier account");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readActiveCatalog()).toBeUndefined();
    expect(await listSales(scope)).toHaveLength(2);
  });

  it("refuses to submit another cashier's saved sales after the server account changes", async () => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json({ ...catalog, user_id: "10000000-0000-4000-8000-000000000002" }));
    await expect(syncOfflineSales(catalog)).rejects.toThrow("signed-in account changed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readActiveCatalog()).toBeUndefined();
    expect((await listSales(scope))[0].checkout).toEqual(sale);
  });

  it("stops and revokes offline access if authentication expires during POST", async () => {
    await enqueueSale(catalog, sale);
    await enqueueSale(catalog, secondSale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(json({ error: "Sign in again" }, 401));
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await readActiveCatalog()).toBeUndefined();
    expect(await listSales(scope)).toHaveLength(2);
    expect((await listSales(scope))[0].error).toBe("Sign in again");
  });

  it.each([
    { data: {} },
    { data: { id: secondSale.id, total_cents: 15000 } },
    { data: { id: sale.id, total_cents: "15000" } },
    { data: { id: sale.id, total_cents: 14999 } },
    { data: { id: sale.id, total_cents: -15000 } },
  ])("retains the receipt after an unconfirmed success: %j", async result => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(json(result));
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect((await listSales(scope))[0]).toMatchObject({ checkout: sale, error: expect.stringContaining("did not confirm this receipt") });
  });

  it("does not erase a sale when a proxy returns an HTML success response", async () => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(new Response("<html>Sign in</html>"));
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect((await listSales(scope))[0].checkout).toEqual(sale);
  });

  it("makes no POST when a malformed GET success fails to confirm identity", async () => {
    await enqueueSale(catalog, sale);
    fetchMock.mockResolvedValueOnce(json({}));
    await expect(syncOfflineSales(catalog)).rejects.toThrow("did not confirm the signed-in cashier");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listSales(scope)).toHaveLength(1);
  });

  it.each([429, 503])("pauses after a temporary production failure (%s), preserving all receipts", async status => {
    await enqueueSale(catalog, sale);
    await enqueueSale(catalog, secondSale);
    fetchMock.mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(json({ error: "Try later" }, status));
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await listSales(scope)).toHaveLength(2);
  });

  it("needs no network request for an empty queue", async () => {
    expect(await syncOfflineSales(catalog)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
