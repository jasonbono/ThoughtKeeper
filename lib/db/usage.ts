import { getDb, withWriteLock } from "./connection";

export function insertChatUsage(row: {
  user_id: string;
  model: string;
  source?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  tool_rounds: number;
}): Promise<void> {
  return withWriteLock(() => {
    getDb().prepare(
      `INSERT INTO chat_usage (user_id, model, source, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, tool_rounds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(row.user_id, row.model, row.source ?? null, row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens, row.tool_rounds);
  });
}
