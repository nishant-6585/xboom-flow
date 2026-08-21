import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * UI regression guard: the Inventory page must keep the same shell padding and
 * header spacing as the Procurement page. If someone changes one, this fails.
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8");

const MAIN_CLASS = /<main className="([^"]+)"/;
const HEADER_CLASS = /<div className="(mb-6 [^"]*)"/;
const CONTAINER_CLASS = /className="(min-h-\[100dvh\][^"]*)"/;

describe("Inventory / Procurement layout parity", () => {
  const inventory = read("Inventory.tsx");
  const procurement = read("Procurement.tsx");

  it("uses the same page shell wrapper classes", () => {
    const inv = inventory.match(CONTAINER_CLASS)?.[1];
    const proc = procurement.match(CONTAINER_CLASS)?.[1];
    expect(inv).toBeTruthy();
    expect(inv).toBe(proc);
  });

  it("uses the same <main> container padding", () => {
    const inv = inventory.match(MAIN_CLASS)?.[1];
    const proc = procurement.match(MAIN_CLASS)?.[1];
    expect(inv).toBe("container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden");
    expect(inv).toBe(proc);
  });

  it("uses the same page header spacing block", () => {
    const inv = inventory.match(HEADER_CLASS)?.[1];
    const proc = procurement.match(HEADER_CLASS)?.[1];
    expect(inv).toBe("mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4");
    expect(inv).toBe(proc);
  });

  it("uses the same horizontally scrollable TabsList on mobile", () => {
    const tabs = /<TabsList className="([^"]+)"/;
    const inv = inventory.match(tabs)?.[1];
    const proc = procurement.match(tabs)?.[1];
    expect(inv).toBe("flex w-full overflow-x-auto gap-1 h-auto flex-nowrap justify-start");
    expect(inv).toBe(proc);
  });

  it("does not double-wrap Inventory in a layout/ProtectedRoute shell", () => {
    expect(inventory).not.toContain("ProtectedRoute");
  });
});
