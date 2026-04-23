import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { DecisionRecord } from "./logic.js";

const DEFAULT_PATH = resolve(tmpdir(), "ohanafy-memory.json");

export type StoreShape = {
  decisions: DecisionRecord[];
};

export class MemoryStore {
  constructor(private readonly path: string = DEFAULT_PATH) {}

  private ensureDir() {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  read(): StoreShape {
    if (!existsSync(this.path)) return { decisions: [] };
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      return { decisions: parsed.decisions ?? [] };
    } catch {
      return { decisions: [] };
    }
  }

  write(state: StoreShape): void {
    this.ensureDir();
    writeFileSync(this.path, JSON.stringify(state, null, 2), "utf-8");
  }

  append(record: DecisionRecord): void {
    const state = this.read();
    state.decisions.push(record);
    this.write(state);
  }

  list(): DecisionRecord[] {
    return this.read().decisions;
  }

  clear(): void {
    this.write({ decisions: [] });
  }
}

export const sharedStore = new MemoryStore();
