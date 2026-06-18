import { describe, expect, it } from "vitest";
import { assessOperation } from "../src/index.js";

describe("assessOperation", () => {
  it("blocks destructive shell commands", () => {
    const decision = assessOperation({ kind: "shell", command: "rm -rf /" });

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("blocked");
  });

  it("requires confirmation for secrets", () => {
    const decision = assessOperation({ kind: "write", target: ".env" });

    expect(decision.allowed).toBe(true);
    expect(decision.confirmationRequired).toBe(true);
    expect(decision.risk).toBe("high");
  });

  it("requires confirmation for GitHub PR creation", () => {
    const decision = assessOperation({ kind: "github-pr" });

    expect(decision.confirmationRequired).toBe(true);
    expect(decision.userMessage).toContain("确认");
  });

  it("requires confirmation for GitHub PR merge", () => {
    const decision = assessOperation({ kind: "github-merge" });

    expect(decision.confirmationRequired).toBe(true);
    expect(decision.userMessage).toContain("合入主线");
  });
});
