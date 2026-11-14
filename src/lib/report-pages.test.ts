import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/auth/require-member", () => ({ requireMember: mocks.member }));
import DashboardPage from "@/app/dashboard/page";
import SalesPage from "@/app/app/sales/page";
import ExpensesPage from "@/app/expenses/page";

const shopId = "00000000-0000-4000-8000-000000000001";
const range = { from: "2026-11-01", to: "2026-11-04" };
const pages = [{ name: "Sales", render: SalesPage }, { name: "Expenses", render: ExpensesPage }];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.member.mockResolvedValue({ supabase: { rpc: mocks.rpc }, shop: { id: shopId, name: "LOGO Coffee", timezone: "Asia/Manila" }, role: "founder" });
  mocks.rpc.mockImplementation(name => Promise.resolve({ data: name === "pos_inventory_cost_credits" ? 0 : [], error: null }));
});
async function renderReport(render: typeof SalesPage | typeof ExpensesPage) {
  const element = await render({ searchParams: Promise.resolve(range) });
  const content = element.props.children.props.children;
  return (await content.type(content.props)).props;
}

describe("server-rendered report refreshes", () => {
  for (const page of pages) {
    it(`${page.name} keeps its existing inclusive RPC contract`, async () => {
      const props = await renderReport(page.render);
      expect(props).toMatchObject({ shopId, from: range.from, to: range.to, founder: true });
      expect(props.loadError).toBeUndefined();
      for (const [, params] of mocks.rpc.mock.calls) expect(params).toEqual({ p_shop_id: shopId, p_from: range.from, p_to: range.to });
      expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(page.name === "Sales" ? ["pos_sales", "pos_expenses", "pos_inventory_cost_credits"] : ["pos_expenses"]);
    });
    it(`${page.name} returns load feedback without replacing the mounted report with an error page`, async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { message: "Network unavailable" } });
      expect((await renderReport(page.render)).loadError).toContain("could not be updated");
      mocks.rpc.mockRejectedValue(new Error("Connection interrupted"));
      expect((await renderReport(page.render)).loadError).toContain("choose a date again");
    });
    it(`${page.name} preserves the existing authentication boundary`, async () => {
      mocks.member.mockRejectedValue(new Error("Authentication redirect"));
      await expect(renderReport(page.render)).rejects.toThrow("Authentication redirect");
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
  it("never combines partial Sales results with failed expense data", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ total_cents: 14500 }], error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Expenses unavailable" } });
    const props = await renderReport(SalesPage);
    expect(props.loadError).toBeTruthy();
    expect(props.sales).toEqual([]);
    expect(props.expenses).toEqual([]);
  });
});


describe("Dashboard server authorization and report consistency", () => {
  async function renderDashboard(params = range) {
    const element = await DashboardPage({ searchParams: Promise.resolve(params) });
    const report = element.props.children.props.children;
    return (await report.type(report.props)).props;
  }
  it("requires authentication before any reporting requests", async () => {
    mocks.member.mockRejectedValue(new Error("Authentication redirect"));
    await expect(renderDashboard()).rejects.toThrow("Authentication redirect");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires Dashboard access before fetching confidential analytics", async () => {
    mocks.member.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(renderDashboard()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.member).toHaveBeenCalledWith("dashboard");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("shares Sales readers and sends only aggregate data plus five recent receipts", async () => {
    const props = await renderDashboard();
    expect(props.report.summary).toMatchObject({ total: 0, orders: 0 });
    expect(props.report.recent).toHaveLength(0);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["pos_sales", "pos_expenses", "pos_inventory_cost_credits", "pos_sales"]);
    expect(mocks.rpc.mock.calls[0][1]).toEqual({ p_shop_id: shopId, p_from: range.from, p_to: range.to });
    expect(mocks.rpc.mock.calls[3][1]).toEqual({ p_shop_id: shopId, p_from: "2026-10-28", p_to: "2026-10-31" });
  });
  it("keeps a valid current report when previous-period data fails", async () => {
    mocks.rpc.mockImplementation((name, params) => Promise.resolve(params.p_from === range.from ? { data: name === "pos_inventory_cost_credits" ? 0 : [], error: null } : { data: null, error: { message: "Unavailable" } }));
    const props = await renderDashboard();
    expect(props.loadError).toBeUndefined();
    expect(props.report.comparison).toBeNull();
  });
  it("never presents partial financial results after a current request fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    const props = await renderDashboard();
    expect(props.report).toBeNull();
    expect(props.loadError).toContain("could not be updated");
  });
  it("does not send invalid date ranges to the reporting backend", async () => {
    expect((await renderDashboard({ from: "2026-11-04", to: "2026-11-01" })).report).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
