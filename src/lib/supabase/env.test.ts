import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabasePublicEnv } from "./env";
afterEach(() => vi.unstubAllEnvs());
describe("server Supabase configuration", () => {
  it("keeps the existing public environment pair as the default", () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("SUPABASE_ANON_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    expect(getSupabasePublicEnv()).toEqual({
      url: "https://public.example.test",
      anonKey: "public-test-key",
    });
  });
  it("uses a complete runtime server pair independently of public bundle values", () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:55486");
    vi.stubEnv("SUPABASE_ANON_KEY", "isolated-test-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    expect(getSupabasePublicEnv()).toEqual({
      url: "http://127.0.0.1:55486",
      anonKey: "isolated-test-key",
    });
  });
  it("rejects a partial runtime pair instead of mixing two projects", () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:55486");
    vi.stubEnv("SUPABASE_ANON_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    expect(() => getSupabasePublicEnv()).toThrow(/both/i);
  });
});
