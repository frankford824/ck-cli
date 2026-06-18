import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type MemoryKind = "task" | "decision" | "review" | "design" | "user" | "system";

export interface MemoryEntry {
  id: string;
  timestamp: string;
  wing: string;
  room: string;
  drawer: string;
  kind: MemoryKind;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  wing?: string;
  room?: string;
  limit?: number;
}

export interface MemoryHit {
  entry: MemoryEntry;
  score: number;
}

export class LocalMemoryStore {
  readonly file: string;

  constructor(readonly cwd: string) {
    this.file = join(cwd, ".ccli", "memory.jsonl");
  }

  async remember(input: Omit<MemoryEntry, "id" | "timestamp">): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      ...input,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date().toISOString()
    };
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  async all(): Promise<MemoryEntry[]> {
    try {
      const content = await readFile(this.file, "utf8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as MemoryEntry);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryHit[]> {
    const terms = tokenize(query);
    const entries = await this.all();
    return entries
      .filter((entry) => !options.wing || entry.wing === options.wing)
      .filter((entry) => !options.room || entry.room === options.room)
      .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, options.limit ?? 5);
  }
}

export function memoryContextForPrompt(hits: MemoryHit[]): string {
  if (!hits.length) {
    return "没有找到相关历史记忆。";
  }
  return hits
    .map((hit, index) => {
      const entry = hit.entry;
      return `${index + 1}. [${entry.wing}/${entry.room}/${entry.drawer}] ${entry.text}`;
    })
    .join("\n");
}

function tokenize(query: string): string[] {
  const ascii = query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? [];
  const cjk = [...query.matchAll(/[\u3400-\u9fff]{2,}/g)].map((match) => match[0]);
  const chars = [...query].filter((char) => /[\u3400-\u9fff]/.test(char));
  return [...new Set([...ascii, ...cjk, ...chars])];
}

function scoreEntry(entry: MemoryEntry, terms: string[]): number {
  const haystack = `${entry.wing} ${entry.room} ${entry.drawer} ${entry.kind} ${entry.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term.toLowerCase())) {
      score += term.length > 1 ? term.length : 0.25;
    }
  }
  return score;
}
