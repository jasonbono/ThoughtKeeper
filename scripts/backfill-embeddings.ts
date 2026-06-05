/**
 * Backfill embeddings for all existing captures that don't have one yet.
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts
 *
 * Requires OPENAI_API_KEY in environment (reads from .env.local).
 */

import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";
import fs from "fs";

// Load .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const DB_PATH = path.join(__dirname, "..", "data", "captures.db");
const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const BATCH_SIZE = 50;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure embeddings table
db.exec(`
  CREATE TABLE IF NOT EXISTS embeddings (
    capture_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const openai = new OpenAI();

interface CaptureRow {
  id: string;
  title: string;
  raw_text: string;
}

async function main() {
  // Find captures without embeddings
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.raw_text FROM captures c
       LEFT JOIN embeddings e ON e.capture_id = c.id
       WHERE e.capture_id IS NULL AND c.trashed = 0
       ORDER BY c.created_at DESC`
    )
    .all() as CaptureRow[];

  console.log(`Found ${rows.length} captures without embeddings`);

  if (rows.length === 0) {
    console.log("Nothing to do!");
    return;
  }

  const insert = db.prepare(
    `INSERT INTO embeddings (capture_id, embedding, model, created_at)
     VALUES (?, ?, ?, ?)`
  );

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => `${r.title}\n\n${r.raw_text}`);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} captures)...`);

    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: DIMENSIONS,
    });

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const vec = new Float32Array(res.data[j].embedding);
        const buf = Buffer.from(vec.buffer);
        insert.run(batch[j].id, buf, EMBEDDING_MODEL, now);
      }
    });
    tx();

    console.log(`  ✓ Embedded ${batch.length} captures`);
  }

  const total = (db.prepare("SELECT COUNT(*) as n FROM embeddings").get() as { n: number }).n;
  console.log(`\nDone! Total embeddings: ${total}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
