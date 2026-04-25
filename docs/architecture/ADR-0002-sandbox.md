# ADR-0002 — Code execution sandbox: Piston on Docker (WSL2) for MVP

- **Status:** Accepted (2026-04-25)
- **Deciders:** Rahul (project owner)
- **Phase:** MVP

## Context

LearnPro must execute arbitrary user code safely on the developer's Windows machine (and later on Linux SaaS hosts). The sandbox is the highest-risk component in the entire system — a breakout means the host is compromised. It also has the highest variance in performance: cold-start latency dominates the user-perceived feel of "run my code."

Constraints:

- **Windows-first dev environment** — Docker Desktop with WSL2 is the practical baseline.
- **Multi-language** from MVP (Python + TypeScript), expanding to Go, Rust, Java, Kotlin, C in v1.
- **Self-hosted ethos** — no SaaS-only options for MVP.
- **Eventual SaaS scale** — must plug in a stronger isolation primitive on Linux later.
- **Solo dev ship velocity** — minimize MVP infra surface area.

Options considered:

| Option | Windows fit | Isolation | Multi-lang ease | Verdict |
|---|---|---|---|---|
| Docker Desktop + WSL2 (raw) | Native | Container-level (good with seccomp/no-net) | Build per-language Dockerfiles | Solid baseline; lots of work to support 5+ languages |
| Podman Desktop | Good, rootless | Same as Docker | Same | Better licensing for hosts; trivial swap if `SandboxProvider` is defined |
| **Piston (self-hosted, on Docker)** | Native (runs in WSL2) | Container-level | **One service, ~40 languages built in** | **MVP choice.** Saves weeks of per-language work |
| gVisor | Linux only | Strong (user-space kernel) | Good | Add as Docker runtime under Linux SaaS hosts; not for Windows dev |
| Firecracker microVMs | Linux/KVM only | Strongest | Heavier per exec | SaaS scale only (v3+) |
| Judge0 (self-hosted) | Easy | Container | Excellent | Similar to Piston; Piston has cleaner API |
| CodeSandbox / StackBlitz API | Cloud-only | N/A | Excellent for FE frameworks | Defeats self-hosted ethos for MVP; useful for v2 React/Angular previews |

## Decision

For MVP: **self-hosted Piston in Docker on WSL2** for one-shot run-and-grade execution. Wrap behind a `SandboxProvider` interface in `packages/sandbox` so we can swap implementations without touching agent or grading code.

For v1+: add a **Docker-Compose-managed pool of long-lived language containers** for stateful, multi-file, framework work that Piston doesn't fit (Spring Boot dev servers, React with hot reload, etc.).

For v3 / SaaS scale: swap to **gVisor runtime** under Docker on Linux hosts; reach for **Firecracker microVMs** when paying-user scale demands stronger isolation per execution.

### Hardening (applies to every implementation, not just MVP)

- `--network none` (or equivalent) for any execution that doesn't explicitly need egress.
- Read-only root filesystem; tmpfs mount at `/tmp` for scratch space.
- CPU / memory / pids cgroup limits.
- Wall-clock timeout enforced *outside* the container by the orchestrator.
- Output size truncation (don't blow up the API).
- `--cap-drop=ALL`.
- Non-root UID inside the container (e.g., uid 1000 mapped to a sandboxed user).
- Custom seccomp profile, or at minimum `runtime/default`.
- **Never `--privileged`. Ever.**
- Treat the runner host as compromised by design — isolate from the API host on a separate network or, at SaaS scale, a separate VM/host.

## Consequences

**Positive:**
- Piston gives us ~40 languages out of the box — Python, TypeScript, Go, Rust, Java, Kotlin, C, and more all work day 1 (we still need to curate problems per language, but the runtime exists).
- Single service to deploy and monitor in MVP. Simple operational story.
- The `SandboxProvider` interface forces clean separation; adding gVisor or Firecracker later is bounded work.
- Hardening checklist is explicit and reviewable.

**Negative:**
- Piston's design favors short, stateless executions. Stateful multi-file workspaces (needed for framework lessons) require a separate path in v1+.
- Docker Desktop on Windows requires WSL2 and adds resource overhead vs. native Linux. Acceptable for dev; SaaS hosts will be native Linux.
- Container-level isolation is *adequate* for MVP but not enterprise-grade; we are explicit that gVisor / Firecracker is the v3 destination.

**Risks:**
- Piston is a third-party project; we depend on its container security posture in addition to our own. Mitigation: pin the version, audit the Dockerfile, run on an isolated network.
- A breakout would compromise the runner host — by design we ensure that's a low-value target (no secrets, no other tenants' data, isolated from the API host).
