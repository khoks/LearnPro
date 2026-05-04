import { describe, expect, it } from "vitest";
import { BREAKPOINTS, breakpointFor } from "./responsive";

describe("BREAKPOINTS", () => {
  it("matches the spec — mobile=768, tablet=1024", () => {
    expect(BREAKPOINTS.mobile).toBe(768);
    expect(BREAKPOINTS.tablet).toBe(1024);
  });
});

describe("breakpointFor", () => {
  it("returns 'mobile' below 768", () => {
    expect(breakpointFor(0)).toBe("mobile");
    expect(breakpointFor(320)).toBe("mobile");
    expect(breakpointFor(767)).toBe("mobile");
  });

  it("returns 'tablet' from 768 up to 1023", () => {
    expect(breakpointFor(768)).toBe("tablet");
    expect(breakpointFor(900)).toBe("tablet");
    expect(breakpointFor(1023)).toBe("tablet");
  });

  it("returns 'laptop' from 1024 onwards", () => {
    expect(breakpointFor(1024)).toBe("laptop");
    expect(breakpointFor(1366)).toBe("laptop");
    expect(breakpointFor(1920)).toBe("laptop");
    expect(breakpointFor(3840)).toBe("laptop");
  });
});
