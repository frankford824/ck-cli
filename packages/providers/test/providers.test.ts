import { describe, expect, it } from "vitest";
import { collectText, type ModelProvider } from "../src/index.js";

describe("providers", () => {
  it("collects streamed text events", async () => {
    const provider: ModelProvider = {
      id: "fake",
      async listModels() {
        return [{ id: "fake-model" }];
      },
      async *stream() {
        yield { type: "text", text: "你好" };
        yield { type: "text", text: "世界" };
        yield { type: "done" };
      }
    };

    await expect(collectText(provider, { model: "fake-model", messages: [] })).resolves.toBe("你好世界");
  });
});
