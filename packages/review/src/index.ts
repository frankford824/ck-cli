import { collectText, type ModelProvider } from "@ccli/providers";
import type { AuditSession } from "@ccli/session";
import { GitTool, ProjectTool } from "@ccli/tools";

export interface ReviewInput {
  cwd: string;
  requirement?: string;
  audit?: AuditSession;
  reviewer?: { provider: ModelProvider; model: string };
}

export interface ReviewResult {
  passed: boolean;
  summary: string;
  risks: string[];
  validation: "passed" | "failed" | "skipped";
}

export class ReviewerAgent {
  async review(input: ReviewInput): Promise<ReviewResult> {
    const git = new GitTool();
    const project = new ProjectTool();
    const status = await git.status(input.cwd).catch(() => "");
    const changedFiles = await git.changedFilesSinceBase(input.cwd).catch(() => []);
    const validationResults = await project.runValidation({ cwd: input.cwd, audit: input.audit, confirmed: true }).catch(
      (error: unknown) => {
        void input.audit?.record("review.validation.error", "验证过程出现问题", serializeError(error));
        return undefined;
      }
    );

    const validation =
      validationResults === undefined
        ? "failed"
        : validationResults.length === 0
          ? "skipped"
          : validationResults.every((result) => result.exitCode === 0)
            ? "passed"
            : "failed";

    const risks: string[] = [];
    if (!status.trim() && changedFiles.length === 0) {
      risks.push("没有发现可交付的新变更。");
    }
    if (validation === "failed") {
      risks.push("自动验证没有全部通过。");
    }
    if (validation === "skipped") {
      risks.push("当前项目没有可自动执行的验证脚本。");
    }

    let modelSummary: string | undefined;
    if (input.reviewer) {
      modelSummary = await this.modelReview(input, status, changedFiles, validation, risks).catch(async (error: unknown) => {
        await input.audit?.record("review.model.error", "独立模型审查失败", serializeError(error));
        return undefined;
      });
    }

    const passed = risks.length === 0;
    const summary =
      modelSummary ??
      (passed
        ? "独立审查未发现明显风险，可以进入保存和交付环节。"
        : `独立审查发现 ${risks.length} 个需要关注的问题。`);

    const result: ReviewResult = { passed, summary, risks, validation };
    await input.audit?.record("review.result", "独立审查完成", { ...result, changedFiles });
    return result;
  }

  private async modelReview(
    input: ReviewInput,
    status: string,
    changedFiles: string[],
    validation: ReviewResult["validation"],
    risks: string[]
  ): Promise<string> {
    if (!input.reviewer) {
      return "";
    }
    return collectText(input.reviewer.provider, {
      model: input.reviewer.model,
      temperature: 0.1,
      maxTokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "你是独立审查代理。只用简体中文输出面向普通用户的结论，不要展示代码、命令、文件路径、diff 或堆栈。"
        },
        {
          role: "user",
          content: JSON.stringify({
            requirement: input.requirement,
            gitStatus: status,
            changedFiles,
            validation,
            staticRisks: risks
          })
        }
      ]
    });
  }
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
