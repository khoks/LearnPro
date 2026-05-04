import { describe, expect, it } from "vitest";
import { NotificationChannelNameSchema, NotificationInputSchema } from "./channel.js";

describe("NotificationChannelNameSchema", () => {
  it("accepts the four channel names the schema enum allows", () => {
    for (const name of ["in_app", "web_push", "email", "whatsapp"] as const) {
      expect(NotificationChannelNameSchema.parse(name)).toBe(name);
    }
  });

  it("rejects unknown channel names", () => {
    expect(() => NotificationChannelNameSchema.parse("sms")).toThrow();
    expect(() => NotificationChannelNameSchema.parse("")).toThrow();
  });
});

describe("NotificationInputSchema", () => {
  it("requires user_id (uuid) + title (non-empty)", () => {
    const ok = NotificationInputSchema.parse({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "hi",
    });
    expect(ok.user_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rejects a non-uuid user_id", () => {
    expect(() => NotificationInputSchema.parse({ user_id: "not-a-uuid", title: "x" })).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() =>
      NotificationInputSchema.parse({
        user_id: "11111111-1111-1111-1111-111111111111",
        title: "",
      }),
    ).toThrow();
  });

  it("caps title at 200 chars", () => {
    expect(() =>
      NotificationInputSchema.parse({
        user_id: "11111111-1111-1111-1111-111111111111",
        title: "x".repeat(201),
      }),
    ).toThrow();
  });

  it("accepts an optional body / dedupe_key / metadata", () => {
    const parsed = NotificationInputSchema.parse({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "hi",
      body: "there",
      dedupe_key: "daily-20260501",
      metadata: { url: "/dashboard", priority: "low" },
    });
    expect(parsed.body).toBe("there");
    expect(parsed.dedupe_key).toBe("daily-20260501");
    expect(parsed.metadata?.["url"]).toBe("/dashboard");
  });
});
