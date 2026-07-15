import { describe, expect, test } from "bun:test";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed
} from "../apps/lush/src/lib/sidebar-preference";

function preferenceStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    }
  };
}

describe("app sidebar preference", () => {
  test("defaults to expanded", () => {
    expect(readSidebarCollapsed(preferenceStorage())).toBe(false);
  });

  test("persists collapsed and expanded states", () => {
    const storage = preferenceStorage();

    writeSidebarCollapsed(true, storage);
    expect(readSidebarCollapsed(storage)).toBe(true);

    writeSidebarCollapsed(false, storage);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  test("falls back to expanded when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      }
    };

    expect(readSidebarCollapsed(storage)).toBe(false);
    expect(() => writeSidebarCollapsed(true, storage)).not.toThrow();
  });
});
