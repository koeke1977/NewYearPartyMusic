import { describe, expect, it } from "vitest";
import { createLatestRequestController } from "../../apps/web/modules/dj-request-guard.js";

describe("latest request controller", () => {
  it("prevents overlapping requests and releases the active request on completion", () => {
    const guard = createLatestRequestController();
    const first = guard.begin();
    expect(first).not.toBeNull();
    expect(guard.begin()).toBeNull();
    expect(guard.isCurrent(first)).toBe(true);
    expect(guard.complete(first)).toBe(true);
    const second = guard.begin();
    expect(second).not.toBe(first);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("invalidates an in-flight response on logout or session replacement", () => {
    const guard = createLatestRequestController();
    const oldRequest = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(oldRequest)).toBe(false);
    const newRequest = guard.begin();
    expect(newRequest).not.toBeNull();
    expect(guard.isCurrent(newRequest)).toBe(true);
    expect(guard.complete(oldRequest)).toBe(false);
    expect(guard.isCurrent(newRequest)).toBe(true);
    expect(guard.complete(newRequest)).toBe(true);
  });

  it("allows a fresh request after invalidation even if an older request has not settled", () => {
    const guard = createLatestRequestController();
    const oldRequest = guard.begin();
    guard.invalidate();
    const newRequest = guard.begin();
    expect(newRequest).not.toBeNull();
    expect(guard.complete(oldRequest)).toBe(false);
    expect(guard.begin()).toBeNull();
    expect(guard.isCurrent(newRequest)).toBe(true);
  });
});
