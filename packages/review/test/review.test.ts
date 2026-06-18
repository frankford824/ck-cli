import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewerAgent } from "../src/index.js";

describe("ReviewerAgent", () => {
  it("reports skipped validation when project has no scripts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "ccli-review-"));
    try {
      const result = await new ReviewerAgent().review({ cwd });
      expect(result.validation).toBe("skipped");
      expect(result.passed).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
