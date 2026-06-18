import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ModelRole = "planner" | "builder" | "reviewer" | "presenter";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelEvent {
  type: "text" | "done" | "error";
  text?: string;
  error?: string;
}

export interface ModelInfo {
  id: string;
  label?: string;
}

export interface ModelProvider {
  id: string;
  listModels(): Promise<ModelInfo[]>;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}

export interface RoleModelConfig {
  provider: string;
  model: string;
}

export interface CcliConfig {
  language?: "zh-CN";
  mode?: "plain-user" | "expert";
  automation?: "high-with-guardrails" | "confirm-all";
  providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
  roles?: Partial<Record<ModelRole, RoleModelConfig>>;
}

export interface ProviderRegistry {
  get(id: string): ModelProvider | undefined;
  forRole(role: ModelRole, config: CcliConfig): { provider: ModelProvider; model: string } | undefined;
  list(): ModelProvider[];
}

export async function loadCcliConfig(cwd: string): Promise<CcliConfig> {
  const global = await readJson<CcliConfig>(join(homedir(), ".ccli", "config.json"));
  const project = await readJson<CcliConfig>(join(cwd, ".ccli", "config.json"));
  return mergeConfig(global, project);
}

export function createDefaultProviderRegistry(config: CcliConfig = {}): ProviderRegistry {
  const providers: ModelProvider[] = [
    new OpenAIProvider(resolveProviderConfig("openai", config, "OPENAI_API_KEY")),
    new AnthropicProvider(resolveProviderConfig("anthropic", config, "ANTHROPIC_API_KEY")),
    new GoogleProvider(resolveProviderConfig("google", config, "GOOGLE_API_KEY", "GEMINI_API_KEY")),
    new QwenProvider(resolveProviderConfig("qwen", config, "QWEN_API_KEY", "DASHSCOPE_API_KEY")),
    new DeepSeekProvider(resolveProviderConfig("deepseek", config, "DEEPSEEK_API_KEY")),
    new KimiProvider(resolveProviderConfig("kimi", config, "KIMI_API_KEY", "MOONSHOT_API_KEY"))
  ];

  return {
    get(id) {
      return providers.find((provider) => provider.id === id);
    },
    forRole(role, roleConfig) {
      const selection = roleConfig.roles?.[role];
      if (!selection) {
        return undefined;
      }
      const provider = providers.find((candidate) => candidate.id === selection.provider);
      return provider ? { provider, model: selection.model } : undefined;
    },
    list() {
      return [...providers];
    }
  };
}

export async function collectText(provider: ModelProvider, request: ModelRequest): Promise<string> {
  let text = "";
  for await (const event of provider.stream(request)) {
    if (event.type === "text" && event.text) {
      text += event.text;
    }
    if (event.type === "error") {
      throw new Error(event.error ?? "模型调用失败");
    }
  }
  return text;
}

interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly defaultBaseUrl: string;
  readonly defaultModels: ModelInfo[];
  private readonly config: ProviderConfig;

  constructor(id: string, defaultBaseUrl: string, defaultModels: ModelInfo[], config: ProviderConfig) {
    this.id = id;
    this.defaultBaseUrl = defaultBaseUrl;
    this.defaultModels = defaultModels;
    this.config = config;
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.defaultModels;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    if (!this.config.apiKey) {
      yield { type: "error", error: `缺少 ${this.id} API key` };
      return;
    }

    const response = await fetch(`${this.config.baseUrl ?? this.defaultBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens
      })
    });

    if (!response.ok) {
      yield { type: "error", error: await safeResponseText(response) };
      return;
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    yield { type: "text", text: json.choices?.[0]?.message?.content ?? "" };
    yield { type: "done" };
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super("openai", "https://api.openai.com/v1", [{ id: "gpt-5" }, { id: "gpt-5-mini" }], config);
  }
}

export class QwenProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super(
      "qwen",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      [{ id: "qwen3-coder-plus" }, { id: "qwen-plus" }],
      config
    );
  }
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super("deepseek", "https://api.deepseek.com/v1", [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }], config);
  }
}

export class KimiProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super("kimi", "https://api.moonshot.cn/v1", [{ id: "kimi-latest" }, { id: "kimi-k2" }], config);
  }
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "claude-sonnet-4-5" }, { id: "claude-opus-4-1" }];
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    if (!this.config.apiKey) {
      yield { type: "error", error: "缺少 anthropic API key" };
      return;
    }

    const system = request.messages.find((message) => message.role === "system")?.content;
    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));

    const response = await fetch(`${this.config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: request.model,
        system,
        messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      yield { type: "error", error: await safeResponseText(response) };
      return;
    }

    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    yield {
      type: "text",
      text: json.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("") ?? ""
    };
    yield { type: "done" };
  }
}

export class GoogleProvider implements ModelProvider {
  readonly id = "google";
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "gemini-3-pro" }, { id: "gemini-2.5-pro" }];
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    if (!this.config.apiKey) {
      yield { type: "error", error: "缺少 google API key" };
      return;
    }

    const prompt = request.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const url = `${this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models/${encodeURIComponent(
      request.model
    )}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens
        }
      })
    });

    if (!response.ok) {
      yield { type: "error", error: await safeResponseText(response) };
      return;
    }

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    yield {
      type: "text",
      text: json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
    };
    yield { type: "done" };
  }
}

function resolveProviderConfig(id: string, config: CcliConfig, ...envNames: string[]): ProviderConfig {
  return {
    apiKey: config.providers?.[id]?.apiKey ?? envNames.map((name) => process.env[name]).find(Boolean),
    baseUrl: config.providers?.[id]?.baseUrl
  };
}

function mergeConfig(globalConfig?: CcliConfig, projectConfig?: CcliConfig): CcliConfig {
  return {
    ...globalConfig,
    ...projectConfig,
    providers: {
      ...globalConfig?.providers,
      ...projectConfig?.providers
    },
    roles: {
      ...globalConfig?.roles,
      ...projectConfig?.roles
    }
  };
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function safeResponseText(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text || `模型服务返回了 ${response.status}`;
}
