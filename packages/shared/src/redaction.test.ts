import { describe, it, expect } from "vitest";
import {
  highConfidenceCount,
  redactPii,
  shouldInvokeLlmReview,
  totalScrubbedCount,
  type RedactionResult,
} from "./redaction.js";

function counts(result: RedactionResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of result.scrubbed) out[e.type] = e.count;
  return out;
}

describe("redactPii — basics", () => {
  it("returns the input untouched when there is no PII", () => {
    const r = redactPii("hello world, the cat sat on the mat");
    expect(r.redacted).toBe("hello world, the cat sat on the mat");
    expect(r.scrubbed).toEqual([]);
  });

  it("returns empty string and zero scrubbed for empty input", () => {
    const r = redactPii("");
    expect(r.redacted).toBe("");
    expect(r.scrubbed).toEqual([]);
  });

  it("totalScrubbedCount sums across categories", () => {
    const r = redactPii("foo@bar.com and baz@qux.com");
    expect(totalScrubbedCount(r)).toBe(2);
  });
});

describe("redactPii — emails", () => {
  it("scrubs a single email", () => {
    const r = redactPii("ping me at foo@bar.com if stuck");
    expect(r.redacted).toBe("ping me at [REDACTED:email] if stuck");
    expect(counts(r)).toEqual({ email: 1 });
  });

  it("scrubs multiple emails in one input", () => {
    const r = redactPii("from alice@example.com to bob.smith+work@sub.example.co");
    expect(r.redacted).toBe("from [REDACTED:email] to [REDACTED:email]");
    expect(counts(r)).toEqual({ email: 2 });
  });

  it("scrubs an email even when surrounded by punctuation", () => {
    const r = redactPii("contact:<jane.doe@org.io>!");
    expect(r.redacted).toBe("contact:<[REDACTED:email]>!");
    expect(counts(r)).toEqual({ email: 1 });
  });

  it("does not mistake a hashtag for an email", () => {
    const r = redactPii("ship it #lgtm");
    expect(r.redacted).toBe("ship it #lgtm");
    expect(r.scrubbed).toEqual([]);
  });
});

describe("redactPii — phones", () => {
  it("scrubs a US phone (555-123-4567)", () => {
    const r = redactPii("call 555-123-4567 anytime");
    expect(r.redacted).toBe("call [REDACTED:phone] anytime");
    expect(counts(r)).toEqual({ phone: 1 });
  });

  it("scrubs a US phone with parentheses (555) 123-4567", () => {
    const r = redactPii("call (555) 123-4567 anytime");
    expect(r.redacted).toBe("call [REDACTED:phone] anytime");
    expect(counts(r)).toEqual({ phone: 1 });
  });

  it("scrubs an E.164 international phone +44 20 7946 0958", () => {
    const r = redactPii("london office: +44 20 7946 0958.");
    expect(r.redacted).toContain("[REDACTED:phone]");
    expect(counts(r).phone).toBe(1);
  });

  it("scrubs an international phone with dots", () => {
    const r = redactPii("germany line +49.30.12345678 ext 5");
    expect(counts(r).phone).toBe(1);
  });

  it("does not flag a 4-digit year as a phone", () => {
    const r = redactPii("we shipped it in 2024");
    expect(r.scrubbed).toEqual([]);
  });
});

describe("redactPii — urls", () => {
  it("scrubs an https URL by default", () => {
    const r = redactPii("see https://docs.example.com/guide for details");
    expect(r.redacted).toBe("see [REDACTED:url] for details");
    expect(counts(r)).toEqual({ url: 1 });
  });

  it("scrubs an http URL too", () => {
    const r = redactPii("local doc at http://localhost:3000/page");
    expect(counts(r)).toEqual({ url: 1 });
  });

  it("preserves URLs when allowUrls=true (tutor flow)", () => {
    const r = redactPii("docs at https://docs.example.com/guide", { allowUrls: true });
    expect(r.redacted).toBe("docs at https://docs.example.com/guide");
    expect(r.scrubbed).toEqual([]);
  });

  it("still scrubs emails when allowUrls=true", () => {
    const r = redactPii("docs at https://x.com plus mail me@foo.com", { allowUrls: true });
    expect(r.redacted).toContain("https://x.com");
    expect(r.redacted).toContain("[REDACTED:email]");
    expect(counts(r)).toEqual({ email: 1 });
  });

  it("does not match a bare 'site.com' without scheme", () => {
    const r = redactPii("visit site.com today");
    expect(r.scrubbed).toEqual([]);
  });
});

describe("redactPii — credit cards", () => {
  it("scrubs a Stripe test card 4242 4242 4242 4242 (Luhn-valid)", () => {
    const r = redactPii("card on file: 4242 4242 4242 4242");
    expect(r.redacted).toBe("card on file: [REDACTED:credit_card]");
    expect(counts(r)).toEqual({ credit_card: 1 });
  });

  it("scrubs a hyphen-separated card 4242-4242-4242-4242", () => {
    const r = redactPii("card 4242-4242-4242-4242 expires");
    expect(r.redacted).toBe("card [REDACTED:credit_card] expires");
    expect(counts(r)).toEqual({ credit_card: 1 });
  });

  it("does NOT flag a non-Luhn 16-digit ID like 1234567890123456", () => {
    const r = redactPii("order id 1234567890123456");
    expect(r.redacted).toBe("order id 1234567890123456");
    expect(r.scrubbed).toEqual([]);
  });

  it("does NOT flag a 10-digit number as a credit card (too short)", () => {
    const r = redactPii("ref 1234567890");
    expect(counts(r).credit_card).toBeUndefined();
  });
});

describe("redactPii — government IDs", () => {
  it("scrubs a US SSN (NNN-NN-NNNN)", () => {
    const r = redactPii("ssn on file 123-45-6789 verified");
    expect(r.redacted).toBe("ssn on file [REDACTED:gov_id] verified");
    expect(counts(r)).toEqual({ gov_id: 1 });
  });

  it("scrubs a labelled ID prefix (ID: 123456789)", () => {
    const r = redactPii("Customer ID: 123456789 received");
    expect(r.redacted).toContain("[REDACTED:gov_id]");
    expect(counts(r).gov_id).toBe(1);
  });

  it("scrubs SSN with prefix (SSN: 987-65-4321)", () => {
    const r = redactPii("SSN: 987-65-4321 confirmed");
    expect(counts(r).gov_id).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag a random 9-digit number without context", () => {
    const r = redactPii("we have 123456789 widgets in stock");
    expect(counts(r).gov_id).toBeUndefined();
  });
});

describe("redactPii — multiple categories at once", () => {
  it("scrubs email + phone + url in one input", () => {
    const r = redactPii("Reach foo@bar.com or 555-123-4567 — see https://help.example.com");
    expect(r.redacted).toBe("Reach [REDACTED:email] or [REDACTED:phone] — see [REDACTED:url]");
    expect(counts(r)).toEqual({ email: 1, phone: 1, url: 1 });
  });

  it("scrubs all 5 categories together", () => {
    const r = redactPii(
      "Email me@x.com phone (555) 555-5555 url https://x.com card 4242424242424242 ssn 111-22-3333",
    );
    expect(counts(r).email).toBe(1);
    expect(counts(r).phone).toBe(1);
    expect(counts(r).url).toBe(1);
    expect(counts(r).credit_card).toBe(1);
    expect(counts(r).gov_id).toBe(1);
  });

  it("dedupes overlapping spans (email containing phone-shaped digits)", () => {
    // The regex priority: email first, phone last. The whole email should be one span.
    const r = redactPii("user555-123-4567@example.com");
    expect(r.redacted).toBe("[REDACTED:email]");
    expect(counts(r)).toEqual({ email: 1 });
  });
});

describe("redactPii — unicode and edge cases", () => {
  it("scrubs PII inside unicode-rich text", () => {
    const r = redactPii("こんにちは — ping me at hello@example.com 👋");
    expect(r.redacted).toContain("[REDACTED:email]");
    expect(r.redacted).toContain("こんにちは");
    expect(r.redacted).toContain("👋");
    expect(counts(r).email).toBe(1);
  });

  it("scrubs PII at the start of the string", () => {
    const r = redactPii("foo@bar.com is my email");
    expect(r.redacted).toBe("[REDACTED:email] is my email");
  });

  it("scrubs PII at the very end of the string", () => {
    const r = redactPii("my email is foo@bar.com");
    expect(r.redacted).toBe("my email is [REDACTED:email]");
  });

  it("scrubs back-to-back PII matches", () => {
    const r = redactPii("a@b.com c@d.com");
    expect(r.redacted).toBe("[REDACTED:email] [REDACTED:email]");
    expect(counts(r)).toEqual({ email: 2 });
  });

  it("scrubbed entries are sorted by category for stable output", () => {
    const r = redactPii("https://x.com and a@b.com and 555-555-5555");
    const types = r.scrubbed.map((e) => e.type);
    expect(types).toEqual([...types].sort());
  });
});

describe("shouldInvokeLlmReview", () => {
  it("returns false when text is too short", () => {
    const r = redactPii("hi");
    expect(shouldInvokeLlmReview("hi", r)).toBe(false);
  });

  it("returns false when regex already found a high-confidence match (email)", () => {
    const r = redactPii("ping foo@bar.com");
    expect(shouldInvokeLlmReview("ping foo@bar.com", r)).toBe(false);
  });

  it("returns false when regex found a credit card (high confidence)", () => {
    const text = "card 4242 4242 4242 4242 on file";
    const r = redactPii(text);
    expect(shouldInvokeLlmReview(text, r)).toBe(false);
  });

  it("returns true on borderline 9-digit input that the regex couldn't tag", () => {
    const text = "the value is 555444333 here";
    const r = redactPii(text);
    expect(highConfidenceCount(r)).toBe(0);
    expect(shouldInvokeLlmReview(text, r)).toBe(true);
  });

  it("returns true on free-text without any regex hits", () => {
    const text = "Hi — please email Jane at the school office, she sits next to John";
    const r = redactPii(text);
    expect(shouldInvokeLlmReview(text, r)).toBe(true);
  });
});
