import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  analyzeHarnessReadiness,
  analyzeHarnessRoadmap,
  defaultToolBudget,
  evaluateHarnessHooks,
  harnessPrompt,
  loadHarnessContext,
  progressSnapshot,
  recordHarnessLesson,
  readHarnessProgress,
  renderHarnessMethod,
  analyzeHarnessPlaybook,
  renderHarnessPlaybook,
  renderHarnessProfile,
  renderHarnessReadiness,
  renderHarnessRoadmap,
  renderHarnessSummary,
  writeHarnessProgress
} from "../src/index.js";

describe("harness", () => {
  it("loads deterministic project guidance and renders stage tool budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "项目固定事实：所有输出默认中文。\n", "utf8");
      await writeFile(join(root, "CLAUDE.md"), "不要把过程术语直接暴露给普通用户。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "rules"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "rules", "safety.md"), "高影响动作必须确认。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "agents"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "agents", "reviewer.md"), "独立检查目标、风险和验证。\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "feature-list.json"), "{\"features\":[]}\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "init-check.json"), "{\"steps\":[\"先验证当前状态\"]}\n", "utf8");
      await writeFile(
        join(root, ".ccli", "harness", "settings.json"),
        JSON.stringify({
          permissions: {
            autoApprove: ["读取项目说明"],
            confirm: ["推送分支"],
            deny: ["无确认发布"]
          }
        }),
        "utf8"
      );
      await writeFile(
        join(root, ".ccli", "harness", "hooks.json"),
        JSON.stringify({
          hooks: [
            { id: "dangerous-action-gate", when: "before-tool", description: "执行前拦截危险动作", blocks: true },
            { id: "quality-feedback", when: "after-edit", description: "改动后运行验证" }
          ]
        }),
        "utf8"
      );

      const context = await loadHarnessContext(root);
      const prompt = harnessPrompt(context, "plan");

      expect(context.standingFacts).toHaveLength(2);
      expect(context.artifacts).toHaveLength(2);
      expect(context.agents).toHaveLength(1);
      expect(context.settings?.permissions?.confirm).toContain("推送分支");
      expect(context.hookPlan?.hooks).toHaveLength(2);
      expect(prompt).toContain("整理中文产品方案");
      expect(prompt).toContain("项目固定事实");
      expect(prompt).toContain("执行清单");
      expect(prompt).toContain("权限档案");
      expect(prompt).toContain("确定性钩子");
      expect(prompt).toContain("独立子代理");
      expect(prompt).toContain("先验证当前状态");
      expect(prompt).toContain("不展示代码、命令、路径、堆栈");
      expect(prompt).toContain("生成和评估分离");
      expect(renderHarnessSummary(context)).toContain("驾驭系统已加载");
      expect(renderHarnessProfile(context)).toContain("高影响动作需要中文确认");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists progress so a later run can resume context", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-progress-"));
    try {
      const progress = progressSnapshot({
        task: "添加登录页",
        currentStage: "validate",
        summary: "正在验证是否正常。",
        facts: ["已经完成页面初稿"],
        nextAction: "如果验证失败，将反馈给开发代理修复。",
        validation: "failed"
      });

      await writeHarnessProgress(root, progress);
      await expect(readHarnessProgress(root)).resolves.toMatchObject({
        task: "添加登录页",
        currentStage: "validate",
        validation: "failed"
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a small staged tool surface", () => {
    const budgets = defaultToolBudget();
    expect(budgets).toHaveLength(7);
    expect(budgets.every((budget) => budget.allowedTools.length <= 3)).toBe(true);
    expect(budgets.find((budget) => budget.stage === "ship")?.deniedActions).toContain("无确认发布");
  });

  it("reports harness readiness gaps in plain Chinese", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-readiness-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "只面向普通用户输出中文结果。\n", "utf8");
      const context = await loadHarnessContext(root);
      const report = analyzeHarnessReadiness(context);
      const rendered = renderHarnessReadiness(report);

      expect(report.score).toBeLessThan(100);
      expect(report.gaps).toContain("安全和产品规则");
      expect(report.gaps).toContain("权限档案");
      expect(report.gaps).toContain("确定性钩子计划");
      expect(report.gaps).toContain("结构化任务清单");
      expect(report.gaps).toContain("开工基线检查");
      expect(report.gaps).toContain("失败经验库");
      expect(report.gaps).toContain("短期进度落盘");
      expect(rendered).toContain("驾驭系统健康度");
      expect(rendered).toContain("建议下一步");
      expect(rendered).toContain("直接说");
      expect(rendered).not.toMatch(/\bccli\s/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records repeated failures as reusable harness lessons", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-lessons-"));
    try {
      const lesson = {
        task: "添加登录页",
        stage: "validate" as const,
        symptom: "手机按钮太小",
        impact: "普通用户不容易点击。",
        prevention: "以后新增按钮时先检查手机尺寸。",
        source: "用户反馈"
      };

      const first = await recordHarnessLesson(root, lesson);
      const second = await recordHarnessLesson(root, lesson);
      const context = await loadHarnessContext(root);

      expect(first.written).toBe(true);
      expect(second.written).toBe(false);
      expect(context.memories.some((document) => document.path.endsWith("LESSONS.md"))).toBe(true);
      expect(harnessPrompt(context, "plan")).toContain("手机按钮太小");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps lesson writes safe when two commands record the same issue", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-lessons-concurrent-"));
    try {
      const lesson = {
        symptom: "不要把技术错误直接展示给普通用户",
        impact: "普通用户会看不懂结果。",
        prevention: "以后把错误翻译成发生了什么、影响什么和需要用户决定什么。",
        source: "并发写入测试"
      };

      const results = await Promise.all([recordHarnessLesson(root, lesson), recordHarnessLesson(root, lesson)]);
      const content = await readFile(join(root, ".ccli", "harness", "agent-memory", "LESSONS.md"), "utf8");

      expect(results.filter((result) => result.written)).toHaveLength(1);
      expect(content.match(/## 经验：不要把技术错误直接展示给普通用户/g)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("explains harness engineering in plain Chinese", () => {
    const method = renderHarnessMethod();
    expect(method).toContain("模型 + 外部支架");
    expect(method).toContain("权限档案");
    expect(method).toContain("确定性护栏");
    expect(method).toContain("14 步路线");
    expect(method).toContain("以后不要再这样");
  });

  it("turns harness engineering into a plain Chinese playbook", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-playbook-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "项目固定事实：所有用户可见结果都用中文。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "rules"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "rules", "safety.md"), "高影响动作必须确认。\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "rules", "product.md"), "普通用户只看中文产品结果。\n", "utf8");
      await writeFile(
        join(root, ".ccli", "harness", "settings.json"),
        JSON.stringify({
          permissions: {
            autoApprove: ["读取项目说明"],
            confirm: ["推送分支"],
            deny: ["无确认发布"]
          }
        }),
        "utf8"
      );

      const context = await loadHarnessContext(root);
      const report = analyzeHarnessPlaybook(context);
      const rendered = renderHarnessPlaybook(report);

      expect(report.steps).toHaveLength(7);
      expect(rendered).toContain("驾驭实操剧本");
      expect(rendered).toContain("验证失败先回流修复");
      expect(rendered).toContain("自动循环判断");
      expect(rendered).toContain("先补齐");
      expect(rendered).not.toMatch(/\bccli\s/);
      expect(rendered).not.toContain(".ccli/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps the 14-step harness roadmap to current project readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-roadmap-"));
    try {
      await writeFile(join(root, "AGENTS.md"), "项目固定事实：所有用户可见结果都用中文。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "rules"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "README.md"), "先让一次人工触发任务稳定，再考虑循环。\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "rules", "safety.md"), "高影响动作必须确认。\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "rules", "product.md"), "普通用户只看中文产品结果。\n", "utf8");
      await mkdir(join(root, ".ccli", "skills"), { recursive: true });
      await writeFile(join(root, ".ccli", "skills", "qa.md"), "检查目标、风险和验证覆盖。\n", "utf8");
      await mkdir(join(root, ".ccli", "harness", "agents"), { recursive: true });
      await writeFile(join(root, ".ccli", "harness", "agents", "reviewer.md"), "独立检查目标、风险和验证。\n", "utf8");
      await writeFile(join(root, ".ccli", "harness", "agents", "eval-runner.md"), "整理验证反馈。\n", "utf8");
      await writeFile(
        join(root, ".ccli", "harness", "settings.json"),
        JSON.stringify({
          permissions: {
            autoApprove: ["读取项目说明"],
            confirm: ["推送分支"],
            deny: ["无确认发布"]
          }
        }),
        "utf8"
      );
      await writeFile(
        join(root, ".ccli", "harness", "hooks.json"),
        JSON.stringify({
          hooks: [
            { id: "dangerous-action-gate", when: "before-tool", description: "执行前拦截危险动作", blocks: true },
            { id: "quality-feedback", when: "after-edit", description: "改动后运行验证" }
          ]
        }),
        "utf8"
      );
      await recordHarnessLesson(root, {
        symptom: "页面按钮太小",
        impact: "手机用户不好点击。",
        prevention: "新增页面先检查手机按钮尺寸。"
      });
      await writeHarnessProgress(
        root,
        progressSnapshot({
          task: "首版产品",
          currentStage: "review",
          summary: "已经完成一轮验证。",
          nextAction: "继续独立审查。",
          validation: "passed"
        })
      );

      const context = await loadHarnessContext(root);
      const progress = await readHarnessProgress(root);
      const report = analyzeHarnessRoadmap(context, progress);
      const rendered = renderHarnessRoadmap(report);

      expect(report.steps).toHaveLength(14);
      expect(report.readyCount).toBeGreaterThanOrEqual(11);
      expect(rendered).toContain("驾驭路线图");
      expect(rendered).toContain("基础层");
      expect(rendered).toContain("控制层");
      expect(rendered).toContain("复利层");
      expect(rendered).toContain("把踩坑变成下一轮输入");
      expect(rendered).not.toMatch(/\bccli\s/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("turns deterministic hooks into a blocking runtime decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "ccli-harness-hook-"));
    try {
      await mkdir(join(root, ".ccli", "harness"), { recursive: true });
      await writeFile(
        join(root, ".ccli", "harness", "hooks.json"),
        JSON.stringify({
          hooks: [
            {
              id: "dangerous-action-gate",
              when: "before-tool",
              description: "执行前拦截危险动作",
              blocks: true
            }
          ]
        }),
        "utf8"
      );

      const context = await loadHarnessContext(root);
      const evaluation = evaluateHarnessHooks(context, {
        when: "before-tool",
        action: "shell",
        command: "rm -rf ."
      });

      expect(evaluation.blocked).toBe(true);
      expect(evaluation.userMessage).toContain("驾驭系统阻止");
      expect(evaluation.findings[0]?.reason).toContain("破坏性");

      const branchPush = evaluateHarnessHooks(context, {
        when: "before-tool",
        action: "git-push",
        command: "git push -u origin 'main-fix'"
      });
      const mainPush = evaluateHarnessHooks(context, {
        when: "before-tool",
        action: "git-push",
        command: "git push -u origin 'main'"
      });

      expect(branchPush.blocked).toBe(false);
      expect(mainPush.blocked).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
