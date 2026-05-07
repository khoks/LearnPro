/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DebugProblemPanel, KindBadge } from "./session-view";

// STORY-037 — debug-problem framing UI: yellow info panel + small KindBadge that surfaces only
// for kind="debug". The panel must (a) explain the problem is broken on purpose, (b) state what
// the code SHOULD do, (c) name the archetype in human-friendly terms, and (d) carry no
// forbidden-coach-voice phrases (no fire emoji, no FOMO timers, no all-caps imperatives).

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN_PHRASES = [
  /DON'?T LOSE/i,
  /\bDAY\s+\d+\b/,
  /🔥/,
  /⚠️/,
  /\bHURRY\b/i,
  /\bMUST\s+/,
  /leaderboard/i,
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DebugProblemPanel (STORY-037)", () => {
  it("renders the expected_behavior text", () => {
    act(() => {
      root.render(
        <DebugProblemPanel
          expectedBehavior="Return the sum of 1..n inclusive."
          bugArchetype="off_by_one"
        />,
      );
    });
    expect(container.textContent).toContain("Return the sum of 1..n inclusive.");
  });

  it("humanizes each catalogued archetype", () => {
    const cases: Array<[string, RegExp]> = [
      ["off_by_one", /off-by-one/i],
      ["mutation_in_iteration", /mutation-during-iteration/i],
      ["reference_equality", /reference-equality/i],
      ["async_race", /async race/i],
      ["late_binding", /late-binding|closure late-binding/i],
      ["shadowing", /shadowed/i],
      ["type_coercion", /type-coercion/i],
      ["default_arg_mutability", /mutable-default/i],
    ];
    for (const [archetype, regex] of cases) {
      const local = createRoot(document.createElement("div"));
      const localContainer = document.createElement("div");
      document.body.appendChild(localContainer);
      const localRoot = createRoot(localContainer);
      act(() => {
        localRoot.render(<DebugProblemPanel expectedBehavior="Test." bugArchetype={archetype} />);
      });
      expect(localContainer.textContent, `archetype ${archetype} should map to ${regex}`).toMatch(
        regex,
      );
      act(() => localRoot.unmount());
      localContainer.remove();
      void local;
    }
  });

  it("falls back to 'one bug' when archetype is null", () => {
    act(() => {
      root.render(<DebugProblemPanel expectedBehavior="Test." bugArchetype={null} />);
    });
    expect(container.textContent).toContain("one bug");
  });

  it("explicitly tells the user the editor is pre-populated", () => {
    act(() => {
      root.render(<DebugProblemPanel expectedBehavior="Return n." bugArchetype="off_by_one" />);
    });
    expect(container.textContent?.toLowerCase()).toContain("pre-populated");
  });

  it("mentions hidden tests will run on submit", () => {
    act(() => {
      root.render(<DebugProblemPanel expectedBehavior="Return n." bugArchetype="off_by_one" />);
    });
    expect(container.textContent?.toLowerCase()).toMatch(/hidden tests.*submit/i);
  });

  it("uses coach-voice copy with no forbidden phrases (no FOMO / fire emoji / shouting)", () => {
    act(() => {
      root.render(<DebugProblemPanel expectedBehavior="Return n." bugArchetype="off_by_one" />);
    });
    const text = container.textContent ?? "";
    for (const p of FORBIDDEN_PHRASES) {
      expect(text, `forbidden phrase ${p}`).not.toMatch(p);
    }
  });

  it("carries the data-testid hook for SessionLayout-level tests", () => {
    act(() => {
      root.render(<DebugProblemPanel expectedBehavior="Return n." bugArchetype="off_by_one" />);
    });
    expect(container.querySelector('[data-testid="debug-problem-panel"]')).not.toBeNull();
  });
});

describe("KindBadge (STORY-037)", () => {
  it("renders a yellow Debug pill for kind=debug", () => {
    act(() => {
      root.render(<KindBadge kind="debug" />);
    });
    const pill = container.querySelector('[data-testid="kind-badge"]') as HTMLElement | null;
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("Debug");
  });

  it("renders nothing for kind=implement", () => {
    act(() => {
      root.render(<KindBadge kind="implement" />);
    });
    expect(container.querySelector('[data-testid="kind-badge"]')).toBeNull();
  });
});
