import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effect: undefined as (() => void | (() => void)) | undefined,
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
}));
import { PosPwaRegistration } from "./pwa-registration";

let cleanup: (() => void) | undefined;
let dataset: Record<string, string>;
let browserWindow: EventTarget & { isSecureContext: boolean };
let worker: EventTarget;
let register: ReturnType<typeof vi.fn>;
let postMessage: ReturnType<typeof vi.fn>;
let registration: { active: { postMessage: ReturnType<typeof vi.fn> }; update: ReturnType<typeof vi.fn> };
let statuses: string[];

function mount() {
  expect(PosPwaRegistration()).toBeNull();
  if (!hooks.effect) throw Error("The registration effect was not captured.");
  const dispose = hooks.effect();
  cleanup = typeof dispose === "function" ? dispose : undefined;
}
function unmount() { cleanup?.(); cleanup = undefined; }
function shellReady() {
  worker.dispatchEvent(new MessageEvent("message", { data: { type: "POS_SHELL_READY" } }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  hooks.effect = undefined;
  cleanup = undefined;
  dataset = {};
  statuses = [];
  browserWindow = Object.assign(new EventTarget(), {
    isSecureContext: true, setTimeout, clearTimeout, location: { protocol: "https:" },
  });
  browserWindow.addEventListener("pos-offline-status", () => { statuses.push(dataset.posOfflineStatus); });
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("document", { documentElement: { dataset } });
  postMessage = vi.fn();
  registration = { active: { postMessage }, update: vi.fn().mockResolvedValue(undefined) };
  register = vi.fn().mockResolvedValue(registration);
  worker = Object.assign(new EventTarget(), { register, ready: Promise.resolve(registration) });
  vi.stubGlobal("navigator", { serviceWorker: worker });
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POS offline preparation status", () => {
  it("reports development immediately without trying to register a production worker", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dataset.posOfflineStatus).toBe("development");
    expect(statuses).toContain("development");
    expect(dataset.posOfflineReady).not.toBe("true");
    expect(register).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser instead of leaving preparation pending", () => {
    vi.stubGlobal("navigator", {});
    mount();
    expect(dataset.posOfflineStatus).toBe("unsupported");
    expect(statuses).toContain("unsupported");
    expect(register).not.toHaveBeenCalled();
  });

  it("reports insecure hosting without trying service worker registration", () => {
    browserWindow.isSecureContext = false;
    vi.stubGlobal("isSecureContext", false);
    mount();
    expect(dataset.posOfflineStatus).toBe("insecure");
    expect(statuses).toContain("insecure");
    expect(register).not.toHaveBeenCalled();
  });

  it("reports a registration failure instead of preparing forever", async () => {
    register.mockRejectedValue(new Error("Storage permission denied"));
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(dataset.posOfflineStatus).toBe("error");
    expect(statuses.at(-1)).toBe("error");
    expect(dataset.posOfflineReady).not.toBe("true");
  });

  it("expires preparation after 30 seconds and accepts a later real readiness confirmation", async () => {
    const readyEvent = vi.fn();
    browserWindow.addEventListener("pos-offline-ready", readyEvent);
    mount();
    expect(dataset.posOfflineStatus).toBe("preparing");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(dataset.posOfflineStatus).toBe("preparing");
    expect(postMessage).toHaveBeenCalledWith({ type: "POS_PREPARE_SHELL" });
    await vi.advanceTimersByTimeAsync(1);
    expect(dataset.posOfflineStatus).toBe("error");
    shellReady();
    expect(dataset.posOfflineStatus).toBe("ready");
    expect(dataset.posOfflineReady).toBe("true");
    expect(statuses).toEqual(["preparing", "error", "ready"]);
    expect(readyEvent).toHaveBeenCalledOnce();
  });

  it("requires the worker's readiness message and cancels the timeout once it arrives", async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(dataset.posOfflineStatus).toBe("preparing");
    worker.dispatchEvent(new MessageEvent("message", { data: { type: "UNRELATED_EVENT" } }));
    expect(dataset.posOfflineStatus).toBe("preparing");
    shellReady();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dataset.posOfflineStatus).toBe("ready");
    expect(statuses).not.toContain("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes listeners and the pending timer on unmount", async () => {
    const removeWorkerListener = vi.spyOn(worker, "removeEventListener");
    const removeWindowListener = vi.spyOn(browserWindow, "removeEventListener");
    mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeWorkerListener).toHaveBeenCalledWith("message", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("online", expect.any(Function));
    shellReady();
    browserWindow.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dataset.posOfflineStatus).toBe("preparing");
    expect(dataset.posOfflineReady).not.toBe("true");
  });

  it("does not prepare the shell after an in-flight registration resolves following unmount", async () => {
    let finishRegistration: ((value: typeof registration) => void) | undefined;
    register.mockReturnValue(new Promise(resolve => { finishRegistration = resolve; }));
    mount();
    unmount();
    finishRegistration?.(registration);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(postMessage).not.toHaveBeenCalled();
    expect(dataset.posOfflineStatus).toBe("preparing");
    expect(vi.getTimerCount()).toBe(0);
  });
});
