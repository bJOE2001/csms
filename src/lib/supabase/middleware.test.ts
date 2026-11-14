import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { workspaceModules } from "@/lib/workspace";

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), member: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("./env", () => ({ getSupabasePublicEnv: () => ({ url: "https://auth.example.test", anonKey: "test-key" }) }));
import { config, middleware } from "@/middleware";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser }, from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: mocks.member }; return query;
  } });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.member.mockResolvedValue({ data: { role: "founder", permissions: null }, error: null });
});

describe("private workspace authentication", () => {
  it.each([...workspaceModules.map(module => module.href), "/app", "/app/setup", "/pos/nested"])(
    "redirects signed-out %s before rendering the workspace",
    async path => {
      expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(true);
      const response = await middleware(new NextRequest(`https://coffee.example${path}?from=2026-11-01`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://coffee.example/login");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).not.toContain("workspace-sidebar");
      expect(mocks.getUser).toHaveBeenCalledOnce();
    },
  );

  it.each(["/", "/menu", "/visit", "/login", "/sign-in", "/forgot-password", "/reset-password", "/auth/callback", "/auth/sign-out", "/api/pos", "/api/public-menu", "/service-worker.js", "/_next/static/app.js", "/pos-public", "/application"])(
    "leaves %s outside the workspace guard",
    url => expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false),
  );

  it("allows a verified user and preserves refreshed session cookies", async () => {
    const request = new NextRequest("https://coffee.example/pos");
    mocks.getUser.mockImplementationOnce(async () => {
      mocks.create.mock.calls[0][2].cookies.setAll([
        { name: "sb-session", value: "refreshed", options: { path: "/", httpOnly: true } },
      ]);
      return { data: { user: { id: "cashier" } } };
    });
    const response = await middleware(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(request.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-session")).toMatchObject({ value: "refreshed", httpOnly: true });
  });

  it("keeps expired-session cookie cleanup on the login redirect", async () => {
    mocks.getUser.mockImplementationOnce(async () => {
      mocks.create.mock.calls[0][2].cookies.setAll([
        { name: "sb-session", value: "", options: { path: "/", maxAge: 0 } },
      ]);
      return { data: { user: null }, error: { message: "Session expired" } };
    });
    const response = await middleware(new NextRequest("https://coffee.example/pos"));
    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-session")).toMatchObject({ value: "", maxAge: 0 });
  });
  it("blocks a direct module URL when staff lack View, including User Management", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "staff" } } });
    mocks.member.mockResolvedValue({ data: { role: "staff", permissions: { pos: ["view", "checkout"] } }, error: null });
    for (const path of ["/dashboard", "/app/users", "/app/menu", "/expenses"]) {
      const response = await middleware(new NextRequest(`https://coffee.example${path}`));
      expect(response.headers.get("location")).toBe("https://coffee.example/app");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect((await middleware(new NextRequest("https://coffee.example/pos"))).headers.get("x-middleware-next")).toBe("1");
  });
  it("allows explicitly granted staff Dashboard access", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "staff" } } });
    mocks.member.mockResolvedValue({ data: { role: "staff", permissions: { dashboard: ["view"] } }, error: null });
    expect((await middleware(new NextRequest("https://coffee.example/dashboard"))).headers.get("x-middleware-next")).toBe("1");
  });
  it("fails closed when membership cannot be checked", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "staff" } } });
    mocks.member.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    expect((await middleware(new NextRequest("https://coffee.example/pos"))).status).toBe(503);
  });
});
