import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("installers", () => {
  it("keeps git optional for first-time installs", async () => {
    const shell = await readFile("install.sh", "utf8");
    const powershell = await readFile("install.ps1", "utf8");

    expect(shell).toContain("download_archive");
    expect(shell).toContain("CCLI_ARCHIVE_URL");
    expect(shell).not.toContain("main() {\n  need_command git");

    expect(powershell).toContain("Download-Archive");
    expect(powershell).toContain("CCLI_ARCHIVE_URL");
    expect(powershell).not.toContain('Require-Command "git"\nTest-NodeVersion');
  });

  it("finishes with open-box copy instead of developer verification copy", async () => {
    const combined = `${await readFile("install.sh", "utf8")}\n${await readFile("install.ps1", "utf8")}`;

    expect(combined).toContain("安装完成");
    expect(combined).toContain("打开开箱首页");
    expect(combined).not.toContain("验证命令");
    expect(combined).not.toContain("--help");
    expect(combined).not.toContain("启动器已写入");
    expect(combined).not.toContain("ccli 已安装到");
  });
});
