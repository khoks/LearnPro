// STORY-010 — Hardening item: seccomp profile.
//
// Disallowed syscalls (mount, ptrace, etc.) must raise EPERM (or equivalent
// PermissionError / OSError) when invoked from inside the sandbox. We exercise two of the
// most dangerous syscalls: `mount` and `ptrace`.

import { describe, expect, it } from "vitest";
import { runBreakout } from "./harness.js";

describe("hardening: seccomp — mount(2) is blocked", () => {
  it("python ctypes mount() raises PermissionError", async () => {
    const { response } = await runBreakout({
      id: "seccomp-mount",
      language: "python",
      code: [
        "import ctypes, sys",
        "libc = ctypes.CDLL('libc.so.6', use_errno=True)",
        "ret = libc.mount(b'none', b'/mnt', b'tmpfs', 0, None)",
        "errno = ctypes.get_errno()",
        "if ret == 0:",
        "    print('MOUNTED')",
        "    sys.exit(0)",
        "print('errno=', errno, file=sys.stderr)",
        "sys.exit(1)",
      ].join("\n"),
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("MOUNTED");
    expect(response.stderr.toLowerCase()).toMatch(
      /errno=\s*1|operation not permitted|permissionerror|errno 1\b/,
    );
  });
});

describe("hardening: seccomp — ptrace(2) is blocked", () => {
  it("python ctypes ptrace(PTRACE_TRACEME) raises EPERM", async () => {
    const { response } = await runBreakout({
      id: "seccomp-ptrace",
      language: "python",
      code: [
        "import ctypes, sys",
        "libc = ctypes.CDLL('libc.so.6', use_errno=True)",
        "PTRACE_TRACEME = 0",
        "ret = libc.ptrace(PTRACE_TRACEME, 0, 0, 0)",
        "errno = ctypes.get_errno()",
        "if ret == 0:",
        "    print('TRACED')",
        "    sys.exit(0)",
        "print('errno=', errno, file=sys.stderr)",
        "sys.exit(1)",
      ].join("\n"),
    });
    expect(response.exit_code).not.toBe(0);
    expect(response.stdout).not.toContain("TRACED");
    expect(response.stderr.toLowerCase()).toMatch(
      /errno=\s*1|operation not permitted|permissionerror|errno 1\b/,
    );
  });
});
