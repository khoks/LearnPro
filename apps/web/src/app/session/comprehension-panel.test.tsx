/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComprehensionAnswerWidget,
  ComprehensionGradeResultPanel,
  ComprehensionProblemPanel,
  KindBadge,
} from "./session-view";

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

describe("ComprehensionProblemPanel (STORY-038)", () => {
  it("renders the predict-the-output framing", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="predict_output" />);
    });
    expect(container.textContent?.toLowerCase()).toContain("predict the output");
  });

  it("renders the trace-execution framing", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="trace_execution" />);
    });
    expect(container.textContent?.toLowerCase()).toContain("trace the execution");
  });

  it("renders the reason-property framing", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="reason_property" />);
    });
    expect(container.textContent?.toLowerCase()).toMatch(/reason about/);
  });

  it("explicitly tells the user the editor is read-only", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="predict_output" />);
    });
    expect(container.textContent?.toLowerCase()).toContain("read-only");
  });

  it("uses coach-voice copy with no forbidden phrases", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="predict_output" />);
    });
    const text = container.textContent ?? "";
    for (const p of FORBIDDEN_PHRASES) {
      expect(text, `forbidden phrase ${p}`).not.toMatch(p);
    }
  });

  it("carries the data-testid hook for SessionLayout-level tests", () => {
    act(() => {
      root.render(<ComprehensionProblemPanel comprehensionFormat="predict_output" />);
    });
    expect(container.querySelector('[data-testid="comprehension-problem-panel"]')).not.toBeNull();
  });
});

describe("ComprehensionAnswerWidget (STORY-038) — multiple-choice", () => {
  const baseProps = {
    answerFormat: "multiple_choice" as const,
    options: ["[2, 4, 6, 8]", "[6, 8]", "[3, 4]", "[8]"],
    question: "What does the program print?",
  };

  it("renders the question and all four options as radio buttons", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={false}
        />,
      );
    });
    expect(container.textContent).toContain("What does the program print?");
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(4);
  });

  it("calls onSelectIndex when a radio is clicked", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={false}
        />,
      );
    });
    const radio = container.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement;
    act(() => {
      radio.click();
    });
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });

  it("checks the radio matching the controlled selected_index", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: 2, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={false}
        />,
      );
    });
    const radios = container.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>;
    expect(radios[0]?.checked).toBe(false);
    expect(radios[1]?.checked).toBe(false);
    expect(radios[2]?.checked).toBe(true);
    expect(radios[3]?.checked).toBe(false);
  });

  it("disables every radio when disabled prop is true", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={true}
        />,
      );
    });
    const radios = container.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>;
    for (const r of Array.from(radios)) {
      expect(r.disabled).toBe(true);
    }
  });
});

describe("ComprehensionAnswerWidget (STORY-038) — free-text", () => {
  const baseProps = {
    answerFormat: "free_text" as const,
    options: [],
    question: "Why is the code slow?",
  };

  it("renders a textarea for free-text input", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={false}
        />,
      );
    });
    const ta = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(ta).not.toBeNull();
  });

  it("forwards textarea changes to onChangeText", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={false}
        />,
      );
    });
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(ta, "my answer");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChangeText).toHaveBeenCalled();
  });

  it("disables the textarea when disabled prop is true", () => {
    const onSelectIndex = vi.fn();
    const onChangeText = vi.fn();
    act(() => {
      root.render(
        <ComprehensionAnswerWidget
          {...baseProps}
          state={{ selected_index: null, free_text: "" }}
          onSelectIndex={onSelectIndex}
          onChangeText={onChangeText}
          disabled={true}
        />,
      );
    });
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });
});

describe("ComprehensionGradeResultPanel (STORY-038)", () => {
  it("renders 'Correct' on a correct answer with the explanation", () => {
    act(() => {
      root.render(
        <ComprehensionGradeResultPanel
          correct={true}
          reasoning="ignored"
          explanation="The list comprehension yields [4, 6]."
          fallbackUsed={false}
        />,
      );
    });
    expect(container.textContent).toContain("Correct");
    expect(container.textContent).toContain("The list comprehension yields [4, 6].");
  });

  it("renders 'Not quite' on an incorrect answer with the reasoning + good-looks-like", () => {
    act(() => {
      root.render(
        <ComprehensionGradeResultPanel
          correct={false}
          reasoning="Misses the central reason about overlapping subproblems."
          explanation="Without memoization, fib has O(2^n) overlapping subproblems."
          fallbackUsed={false}
        />,
      );
    });
    expect(container.textContent).toContain("Not quite");
    expect(container.textContent).toContain("overlapping subproblems");
    expect(container.textContent?.toLowerCase()).toContain("what good looks like");
  });

  it("surfaces a soft fallback note when fallbackUsed is true", () => {
    act(() => {
      root.render(
        <ComprehensionGradeResultPanel
          correct={false}
          reasoning="Grader produced no parsable verdict; defaulting to conservative incorrect."
          explanation="Some explanation."
          fallbackUsed={true}
        />,
      );
    });
    expect(container.textContent?.toLowerCase()).toContain("conservative");
  });

  it("uses coach-voice copy with no forbidden phrases", () => {
    act(() => {
      root.render(
        <ComprehensionGradeResultPanel
          correct={true}
          reasoning="ignored"
          explanation="Some explanation here."
          fallbackUsed={false}
        />,
      );
    });
    const text = container.textContent ?? "";
    for (const p of FORBIDDEN_PHRASES) {
      expect(text, `forbidden phrase ${p}`).not.toMatch(p);
    }
  });
});

describe("KindBadge (STORY-037 / STORY-038)", () => {
  it("renders a yellow Debug pill for kind=debug", () => {
    act(() => {
      root.render(<KindBadge kind="debug" />);
    });
    const pill = container.querySelector('[data-testid="kind-badge"]') as HTMLElement | null;
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("Debug");
  });

  it("renders a blue Read pill for kind=comprehension", () => {
    act(() => {
      root.render(<KindBadge kind="comprehension" />);
    });
    const pill = container.querySelector('[data-testid="kind-badge"]') as HTMLElement | null;
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe("Read");
  });

  it("renders nothing for kind=implement", () => {
    act(() => {
      root.render(<KindBadge kind="implement" />);
    });
    expect(container.querySelector('[data-testid="kind-badge"]')).toBeNull();
  });
});
