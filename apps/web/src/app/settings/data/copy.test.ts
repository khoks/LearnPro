import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETE_BUTTON,
  ACCOUNT_DELETE_CONFIRM_ACTION,
  ACCOUNT_DELETE_CONFIRM_BODY_1,
  ACCOUNT_DELETE_CONFIRM_BODY_2,
  ACCOUNT_DELETE_CONFIRM_CANCEL,
  ACCOUNT_DELETE_CONFIRM_TITLE,
  ACCOUNT_SECTION_BODY,
  ACCOUNT_SECTION_TITLE,
  FORBIDDEN_PHRASES,
  PAGE_INTRO,
  PAGE_TITLE,
  SUMMARY_HEADING,
  VOICE_DELETE_BUTTON,
  VOICE_DELETE_CONFIRM_ACTION,
  VOICE_DELETE_CONFIRM_BODY,
  VOICE_DELETE_CONFIRM_CANCEL,
  VOICE_DELETE_CONFIRM_TITLE,
  VOICE_DELETE_DONE_NONE,
  VOICE_DELETE_DONE_TEMPLATE,
  VOICE_SECTION_BODY,
  VOICE_SECTION_TITLE,
  containsForbiddenPhrase,
} from "./copy.js";

const ALL_VISIBLE_STRINGS = [
  PAGE_TITLE,
  PAGE_INTRO,
  SUMMARY_HEADING,
  VOICE_SECTION_TITLE,
  VOICE_SECTION_BODY,
  VOICE_DELETE_BUTTON,
  VOICE_DELETE_CONFIRM_TITLE,
  VOICE_DELETE_CONFIRM_BODY,
  VOICE_DELETE_CONFIRM_ACTION,
  VOICE_DELETE_CONFIRM_CANCEL,
  VOICE_DELETE_DONE_NONE,
  VOICE_DELETE_DONE_TEMPLATE(0),
  VOICE_DELETE_DONE_TEMPLATE(1),
  VOICE_DELETE_DONE_TEMPLATE(5),
  ACCOUNT_SECTION_TITLE,
  ACCOUNT_SECTION_BODY,
  ACCOUNT_DELETE_BUTTON,
  ACCOUNT_DELETE_CONFIRM_TITLE,
  ACCOUNT_DELETE_CONFIRM_BODY_1,
  ACCOUNT_DELETE_CONFIRM_BODY_2,
  ACCOUNT_DELETE_CONFIRM_ACTION,
  ACCOUNT_DELETE_CONFIRM_CANCEL,
];

describe("settings/data copy — anti-dark-pattern guards", () => {
  it("none of the user-visible strings contain a forbidden phrase", () => {
    for (const s of ALL_VISIBLE_STRINGS) {
      const hit = containsForbiddenPhrase(s);
      expect(hit, `"${s}" contains forbidden phrase "${hit}"`).toBeNull();
    }
  });

  it("forbidden-phrase list is non-empty (regression guard)", () => {
    expect(FORBIDDEN_PHRASES.length).toBeGreaterThan(0);
  });

  it("containsForbiddenPhrase catches a contrived bad phrase", () => {
    expect(containsForbiddenPhrase("DON'T forget")).toBe("DON'T");
    expect(containsForbiddenPhrase("you'll lose your streak")).toBe("you'll lose");
  });

  it("VOICE_DELETE_DONE_TEMPLATE handles singular vs plural correctly", () => {
    expect(VOICE_DELETE_DONE_TEMPLATE(1)).toBe("Removed 1 voice transcript.");
    expect(VOICE_DELETE_DONE_TEMPLATE(2)).toContain("2 voice transcripts");
  });
});
