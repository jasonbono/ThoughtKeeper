import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { toNyDate } from "./format";
import { USERS } from "./users";

const AGENT_DIR = path.join(process.cwd(), "data", "agent");

// ─── Seed content for auto-creation ──────────────────────────────────────────

const SEED_FILES: Record<string, string> = {
  "SOUL.md": `# ThoughtKeeper

_You're the memory and pattern-recognition layer for a team
that thinks faster than they can organize._

## What You Are

A knowledge management agent inside ThoughtKeeper. You capture thoughts,
classify them, connect them, and surface them when they matter.
You're not a chatbot — you're a second brain that gets smarter.

## Core Truths

**Save first, classify later.** Never let a thought get lost because
you're unsure where it goes. Save it, sort it, refine it.

**The capture system serves the humans, not the other way around.** If the
formats don't fit how they think, change the formats.

**Connect what they haven't connected.** When a new idea relates to
something from two weeks ago, say so.

**Be opinionated.** You've seen hundreds of their thoughts. You know
their patterns better than they do. Classify decisively. If you're
wrong, they'll correct you and you'll learn.

**Earn trust by being right, not by being cautious.** A confident
classification that's occasionally wrong and corrected is more useful
than hedging every time.

## Continuity

You wake up fresh each session. These files are your memory.
If you learn something durable, write it down or it's gone.

---

_This file is yours to evolve. When you change it, mention it._
`,
  "MEMORY.md": `# Long-Term Memory

_Durable facts, decisions, and patterns. Keep this compact._

## Decisions

- [agent writes lasting decisions here]

## Patterns

- [agent writes observed patterns here]
`,
};

// ─── Ensure agent directory and seed files exist ─────────────────────────────

function ensureAgentDir(): void {
  for (const subdir of ["", "rules", "users", "memory"]) {
    const dir = path.join(AGENT_DIR, subdir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  // Seed any missing files
  for (const [relPath, content] of Object.entries(SEED_FILES)) {
    const fullPath = path.join(AGENT_DIR, relPath);
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, content, "utf-8");
    }
  }
}

// ─── Path safety ─────────────────────────────────────────────────────────────

function resolveSafe(relativePath: string): string {
  const resolved = path.resolve(AGENT_DIR, relativePath);
  if (!resolved.startsWith(AGENT_DIR)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if content is just seed placeholder text with no real data. */
function isPlaceholder(content: string, seedKey?: string): boolean {
  const stripped = content.trim();
  if (!stripped) return true;
  // Exact match against seed — file hasn't been modified
  if (seedKey && SEED_FILES[seedKey] && stripped === SEED_FILES[seedKey].trim()) {
    return true;
  }
  // Heuristic fallback for partially-edited files with no real content
  const substantive = stripped.split("\n").filter((l) => {
    const t = l.trim();
    return (
      t.length > 0 &&
      !t.startsWith("#") &&
      !t.startsWith("_") &&
      !t.startsWith("---") &&
      !/\[agent\s+/i.test(t) &&
      !/\(none yet\)/i.test(t)
    );
  });
  return substantive.length === 0;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Read an agent file. Returns empty string if file doesn't exist. */
export function readAgentFile(relativePath: string): string {
  ensureAgentDir();
  const fullPath = resolveSafe(relativePath);
  if (!existsSync(fullPath)) return "";
  return readFileSync(fullPath, "utf-8");
}

/** Write or append to an agent file. Creates directories as needed. */
export function writeAgentFile(
  relativePath: string,
  content: string,
  mode: "overwrite" | "append" = "overwrite"
): void {
  ensureAgentDir();
  const fullPath = resolveSafe(relativePath);
  const dir = path.dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (mode === "append") {
    const existing = existsSync(fullPath) ? readFileSync(fullPath, "utf-8") : "";
    writeFileSync(fullPath, existing + content, "utf-8");
  } else {
    writeFileSync(fullPath, content, "utf-8");
  }
}

/** Build the agent knowledge block for the system prompt. */
export function getAgentKnowledge(userId: string): string {
  ensureAgentDir();

  const userModel = readAgentFile(`users/${userId}.md`);
  const rules = readAgentFile(`rules/${userId}.md`);
  const memory = readAgentFile("MEMORY.md");

  // Today's and yesterday's daily logs
  const now = new Date();
  const tz = USERS[userId as keyof typeof USERS]?.timezone ?? "America/New_York";
  const todayStr = toNyDate(now, tz);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayStr = toNyDate(yesterday, tz);

  const todayLog = readAgentFile(`memory/${todayStr}.md`);
  const yesterdayLog = readAgentFile(`memory/${yesterdayStr}.md`);

  const parts: string[] = [];

  if (userModel && !isPlaceholder(userModel, `users/${userId}.md`)) {
    parts.push(`## About This User ← \`users/${userId}.md\`\n\n${userModel}`);
  }

  if (rules && !isPlaceholder(rules, `rules/${userId}.md`)) {
    parts.push(`## Classification Rules ← \`rules/${userId}.md\`\n\n${rules}`);
  }

  const recentMemory: string[] = [];
  if (todayLog) recentMemory.push(`### ${todayStr} ← \`memory/${todayStr}.md\`\n\n${todayLog}`);
  if (yesterdayLog) recentMemory.push(`### ${yesterdayStr} ← \`memory/${yesterdayStr}.md\`\n\n${yesterdayLog}`);
  if (recentMemory.length > 0) {
    parts.push(`## Recent Memory\n\n${recentMemory.join("\n\n")}`);
  }

  if (memory && !isPlaceholder(memory, "MEMORY.md")) {
    parts.push(`## Long-Term Memory ← \`MEMORY.md\`\n\n${memory}`);
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : "";
}
