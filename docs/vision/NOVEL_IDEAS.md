# Novel ideas log

> Running log of mechanisms / workflows / scoring formulas / pedagogy patterns that the user (or Claude) flags as **possibly novel** — not just "we like this" but "no other platform we know of works this way." Maintained by the [`harvest-knowledge`](../../.claude/skills/harvest-knowledge/SKILL.md) skill. Newest entries on top.
>
> **Why this exists:** if LearnPro's wedge against the dozen existing platforms is real, parts of it may be genuinely new — and worth (a) protecting via patent search and (b) marketing as differentiators. We track candidates here so future-us can decide whether to do a real prior-art search before publishing or shipping.
>
> **Honesty gate:** false novelty flags are expensive (legal time, marketing rework). If a five-second mental check turns up obvious prior art (LeetCode, Boot.dev, Anki, ChatGPT-as-tutor, an academic paper), write it down in the entry. Better to kill a flag than to chase a phantom claim.

---

_(no entries yet — the catalog of differentiators in [`docs/product/DIFFERENTIATORS.md`](../product/DIFFERENTIATORS.md) lists the wedge candidates; entries here are the subset where the user has actively claimed novelty during a session, not the broader differentiators list.)_

---

## Entry format

Newest entries go at the top of the list above. Use this template:

```markdown
## YYYY-MM-DD — <name of the idea>

**What it is:** 2–3 sentences describing the mechanism / workflow / formula
**Where it lives in the product:** epic / story link, or "not yet filed"
**Why it might be novel:** what existing approaches do *differently*; cite competitors / known prior art
**Patentability signal:** plain-language read on whether this looks like a method/process/system claim worth a real prior-art search; **never legal advice**
**Open questions:** what would need to be true for this to actually work; what could disprove novelty
**Owner:** who flagged it (usually the user)
**Status:** candidate | prior-art found (killed) | prior-art search in progress | filed (provisional/full) | abandoned
```

Update an entry's `Status` over time rather than creating a new entry. If `Status: prior-art found`, leave the entry in place (don't delete) — knowing what *isn't* novel is also valuable.
