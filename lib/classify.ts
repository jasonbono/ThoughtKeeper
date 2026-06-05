import Anthropic from "@anthropic-ai/sdk";
import { type UserId } from "./users-server";
import { THOUGHT_FORMAT_IDS } from "./users";
import { readAgentFile } from "./agent-files";
import { CLASSIFY_MODEL } from "./models";
import { nowForPrompt, parseDueAt, tzAbbrev } from "./format";
import { USERS } from "./users";

export interface Classification {
  format: string;
  title: string;
  due_at?: string | null;
  topics?: string[];
}

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

function buildClassificationPrompt(userId: UserId): string {
  // Load agent-learned classification rules for this user
  const learnedRules = readAgentFile(`rules/${userId}.md`);
  let rulesSection = "";
  if (learnedRules && !learnedRules.includes("_(none yet)_")) {
    const rulesMatch = learnedRules.match(/## Rules\n([\s\S]*)/);
    const rulesBody = rulesMatch ? rulesMatch[1].trim() : learnedRules;
    if (rulesBody) {
      rulesSection = `\nLearned rules (apply these with priority):\n${rulesBody}\n`;
    }
  }

  const tz = USERS[userId].timezone;
  const now = nowForPrompt(tz);
  const abbrev = tzAbbrev(tz);

  return `You are ThoughtKeeper, a thought classifier. Given raw text, determine the format, generate a title, and extract a due date if one is mentioned.

Current date and time (${abbrev}): ${now}

Formats: "todo" or "capture".
Is it a to-do or to-do list? If not, it's a capture.
${rulesSection}
Title rules: sentence case, 3-8 words, no trailing punctuation.

Due date: if the text mentions when something should happen or is due, extract it as YYYY-MM-DD HH:mm (${abbrev}). Use 09:00 if only a date is mentioned. Set null if no date/time is mentioned.

Respond with ONLY valid JSON, no markdown, no explanation:
{"format": "<todo|capture>", "title": "<title>", "due_at": "<YYYY-MM-DD HH:mm or null>"}`;
}

export async function classify(text: string, userId: UserId, _source?: string): Promise<Classification> {
  const systemPrompt = buildClassificationPrompt(userId);
  const validTypes = new Set<string>(THOUGHT_FORMAT_IDS);

  const message = await getClient().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 150,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Strip markdown code fences if the model wraps output despite instructions
  const cleaned = raw.text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Classification;
  if (!validTypes.has(parsed.format)) {
    // Coerce to capture if unknown
    parsed.format = "capture";
  }

  // Normalize due_at: lenient parse → proper ISO 8601 with user's timezone offset, or null
  const tz = USERS[userId].timezone;
  parsed.due_at = parseDueAt(parsed.due_at, tz);

  return parsed;
}

/**
 * Generate a slimthought (≤150 char AI summary) for a thought and store it.
 * Called async post-insert, same pattern as embeddings.
 */
export async function generateSlimthought(thoughtId: string, rawText: string): Promise<void> {
  const message = await getClient().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 100,
    temperature: 0,
    system: `Compress the following text into a single concise summary of about 150 characters. Preserve the key meaning and intent. Respond with ONLY the summary text, nothing else.`,
    messages: [{ role: "user", content: rawText }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") return;

  let slimthought = raw.text.trim();
  if (slimthought.length > 200) {
    // Trim at last word boundary before 200 chars
    slimthought = slimthought.slice(0, 200).replace(/\s+\S*$/, "");
  }

  // Lazy import to avoid circular dependency (captures.ts imports us)
  const { getDb, withWriteLock } = await import("./db/connection");
  await withWriteLock(() => {
    getDb().prepare("UPDATE captures SET slimthought = ? WHERE id = ?").run(slimthought, thoughtId);
  });
}

/**
 * Backfill slimthoughts for existing thoughts that are missing them.
 * Runs async at startup, same pattern as backfillEmbeddings.
 */
export async function backfillSlimthoughts(): Promise<void> {
  const { getDb } = await import("./db/connection");
  const db = getDb();

  const missing = db.prepare(
    `SELECT id, raw_text FROM captures WHERE slimthought IS NULL AND char_count > 150 AND trashed = 0`
  ).all() as { id: string; raw_text: string }[];

  if (missing.length === 0) return;

  console.log(`[slimthought] backfilling ${missing.length} thoughts…`);
  let done = 0;
  for (const row of missing) {
    try {
      await generateSlimthought(row.id, row.raw_text);
      done++;
    } catch (e) {
      console.warn(`[slimthought] backfill failed for ${row.id}:`, (e as Error).message);
    }
  }
  console.log(`[slimthought] backfill complete: ${done}/${missing.length}`);
}
