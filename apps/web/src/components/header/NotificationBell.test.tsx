import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationBell } from "./NotificationBell.js";

void React;

// Anti-dark-pattern guard: the bell + dropdown's static copy must avoid the same forbidden
// phrases the dashboard tests enforce. We render-to-string and grep for the set.
const FORBIDDEN_PHRASES = ["DON'T LOSE", "DAY X", "burn", "BURN", "🔥", "⚠️"];

function htmlForBell(): string {
  return renderToStaticMarkup(<NotificationBell pollOnMount={false} />);
}

describe("NotificationBell", () => {
  it("renders the bell button + accessible aria-label", () => {
    const html = htmlForBell();
    expect(html).toContain('data-testid="notification-bell-button"');
    expect(html).toContain('aria-label="Notifications (0 unread)"');
  });

  it("does not render the panel until clicked (initial render is closed)", () => {
    const html = htmlForBell();
    expect(html).not.toContain('data-testid="notification-bell-panel"');
  });

  it("does not render the unread badge when count is 0", () => {
    const html = htmlForBell();
    expect(html).not.toContain('data-testid="notification-bell-badge"');
  });

  it("renders the bell glyph with aria-hidden so screen readers ignore the emoji itself", () => {
    const html = htmlForBell();
    expect(html).toContain('<span aria-hidden="true">');
  });

  it("contains no forbidden dark-pattern phrases (closed state)", () => {
    const html = htmlForBell();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(html, `bell copy must not contain "${phrase}"`).not.toContain(phrase);
    }
  });
});
