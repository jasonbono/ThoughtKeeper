import type Anthropic from "@anthropic-ai/sdk";
import { classify } from "./classify";
import { readAgentFile, writeAgentFile, getAgentKnowledge } from "./agent-files";
import { toLocalDate, nowForPrompt, tzAbbrev, parseDueAt } from "./format";
import type { Thought } from "./types";
import {
  insertThought,
  hybridSearchThoughts,
  getAllThoughts,
  countThoughts,
  countTextMatches,
  updateThought,
  getThoughtById,
  archiveThought,
  unarchiveThought,
  trashThought,
  restoreFromTrash,
  searchTrashedThoughts,
  getTrashedThoughts,
  getUserTopics,
  getUserTopicsWithCounts,
  createUserTopic,
  deleteUserTopic,
  setTopicsForThought,
  getTopicsForThought,
  getTopicsForThoughts,
} from "./db";
import { semanticSearch } from "./embeddings";
import {
  type UserId,
  getAllFormats,
  getValidFormatIds,
  getUserConfig,
  getAllTeammateIds,
} from "./users-server";
import { THOUGHT_FORMAT_IDS } from "./users";

const FORMAT_IDS = THOUGHT_FORMAT_IDS;

// Tool tiers by source mode — voice only needs capture, templates only need query
const CAPTURE_TOOLS = new Set(["save_thought", "manage_topics"]);
const QUERY_TOOLS = new Set(["query_thoughts", "manage_topics"]);

/** Generate tools filtered by source mode. */
export function getTools(userId: UserId, source?: string): Anthropic.Tool[] {
  const tier = source === "voice" ? CAPTURE_TOOLS
    : source === "templates" ? QUERY_TOOLS
    : null; // chat gets everything

  const allTools: Anthropic.Tool[] = [
    {
      name: "save_thought",
      description:
        "Save a thought. Use when the user shares something to capture or after collaboratively developing an idea.",
      input_schema: {
        type: "object" as const,
        properties: {
          text: {
            type: "string",
            description: "User's original text, verbatim. Never summarize or rephrase. Max 20000 chars.",
          },
          format: {
            type: "string",
            enum: [...FORMAT_IDS],
            description: "Always provide.",
          },
          title: {
            type: "string",
            description: "Concise 3-8 word title. Always provide.",
          },
          due_at: {
            type: "string",
            description: "ISO 8601 with timezone offset, e.g. '2026-03-06T14:00:00-05:00'.",
          },
          topics: {
            type: "array",
            items: { type: "string" },
            description: "Topic names (0-3).",
          },
        },
        required: ["text", "format", "title"],
      },
    },
    {
      name: "query_thoughts",
      description:
        "Search and retrieve thoughts. For 'latest'/'recent', omit query and use limit 1–3. Default user_scope to 'both' unless user says 'my thoughts'.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: {
            type: "string",
            description: "Fetch by ID. Ignores other filters.",
          },
          query: {
            type: "string",
            description: "Hybrid text+semantic. Quotes for exact match. Omit to browse by recency.",
          },
          format: {
            type: "string",
            enum: [...FORMAT_IDS],
            description: "Filter by format. Always set when user asks about a specific format.",
          },
          topic: {
            type: "string",
            description: "Filter by topic name.",
          },
          user_scope: {
            type: "string",
            enum: ["mine", "teammate", "both"],
            description: "Default 'mine'. Use 'both' for recall queries.",
          },
          date_from: {
            type: "string",
            description: "YYYY-MM-DD start.",
          },
          date_to: {
            type: "string",
            description: "YYYY-MM-DD end.",
          },
          include_archived: {
            type: "boolean",
            description: "Default false.",
          },
          limit: {
            type: "number",
            description: "Max results (default 5). Response includes total_text_matches for counting.",
          },
          display: {
            type: "string",
            enum: ["cards", "silent"],
            description: "'cards' (default) or 'silent' for synthesis.",
          },
          detail: {
            type: "string",
            enum: ["summary", "full"],
            description: "'summary' (default): title + AI summary. 'full': includes raw_text — only when user asks to read full content.",
          },
        },
        required: [],
      },
    },
    {
      name: "update_thought",
      description:
        "Edit an existing thought. All fields except id optional — omit to keep current.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Thought ID" },
          raw_text: { type: "string", description: "New text" },
          title: { type: "string", description: "New title" },
          format: {
            type: "string",
            enum: [...FORMAT_IDS],
            description: "New format",
          },
          due_at: {
            type: ["string", "null"],
            description: "ISO 8601 or null to clear.",
          },
          topics: {
            type: "array",
            items: { type: "string" },
            description: "New topic names (replaces all).",
          },
          visibility: {
            type: "string",
            enum: ["private", "team"],
            description: "'private' or 'team'. Sharing requires shared mode.",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "thought_lifecycle",
      description:
        "Archive, unarchive, trash, or restore a thought. Only works on your own thoughts.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "The thought ID" },
          action: { type: "string", enum: ["archive", "unarchive", "trash", "restore"], description: "Action to perform" },
        },
        required: ["id", "action"],
      },
    },
    {
      name: "search_trash",
      description:
        "Search trashed thoughts. Only use when the user explicitly asks about the trash.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query. Empty to list all." },
          display: { type: "string", enum: ["cards", "silent"] },
        },
        required: ["query"],
      },
    },
    {
      name: "manage_topics",
      description:
        "Manage topic tags for organizing thoughts. list returns each topic with its thought count.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["list", "create", "delete"],
            description: "The action to perform",
          },
          name: { type: "string", description: "Topic name (for create)" },
          topic_id: { type: "string", description: "Topic ID (for delete)" },
        },
        required: ["action"],
      },
    },
    {
      name: "read_agent_file",
      description:
        "Read a knowledge file from data/agent/.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Relative path, e.g. 'SOUL.md', 'rules/alex.md'" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_agent_file",
      description:
        "Write or append to a knowledge file in data/agent/. Daily logs → always append. All others → read_agent_file first, then overwrite with full content.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Relative path within data/agent/" },
          content: { type: "string", description: "Content to write" },
          mode: { type: "string", enum: ["overwrite", "append"] },
        },
        required: ["path", "content", "mode"],
      },
    },
    {
      name: "test_classification",
      description:
        "Dry-run classification without saving.",
      input_schema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "Text to classify" },
          user: { type: "string", enum: ["alex", "sam", "jordan", "taylor"] },
        },
        required: ["text"],
      },
    },
  ];

  return tier ? allTools.filter((t) => tier.has(t.name)) : allTools;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

/** Strip noise fields and replace image_data with a boolean. */
function slimThought(c: Thought, topicNames?: string[], detail: "summary" | "full" = "summary") {
  const slim: Record<string, unknown> = {
    id: c.id,
    title: c.title,
    format: c.format,
    visibility: c.visibility,
    created_at: c.created_at,
    user: c.user,
  };
  if (detail === "full") {
    slim.raw_text = c.raw_text;
  } else {
    slim.slimthought = c.slimthought ?? c.raw_text.slice(0, 150);
    if (c.char_count > 150) slim.text_length = c.char_count;
  }
  if (c.due_at) slim.due_at = c.due_at;
  if (c.image_data || c.has_image) slim.has_image = true;
  if (c.archived) slim.archived = true;
  if (topicNames && topicNames.length > 0) slim.topics = topicNames;
  return slim;
}

/** Resolve topic names to IDs for the current user. */
function resolveTopicIds(userId: UserId, topicNames: string[]): string[] {
  const userTopics = getUserTopics(userId);
  const nameMap = new Map(userTopics.map((t) => [t.name.toLowerCase(), t.id]));
  return topicNames
    .map((name) => nameMap.get(name.toLowerCase()))
    .filter((id): id is string => !!id);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  toolUseId: string,
  userId: UserId,
  context?: { imageData?: string | null; mode?: "private" | "shared" }
): Promise<ToolResult> {
  try {
    switch (name) {
      case "save_thought": {
        const text = (input.text as string).trim();
        if (!text || text.length > 20000) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Text must be 1-20000 characters" }) };
        }
        const format = input.format as string;
        const title = input.title as string;
        const validFormats = getValidFormatIds();
        if (!validFormats.has(format)) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Invalid format: ${format}` }) };
        }
        const id = crypto.randomUUID();
        const dueAt = (input.due_at as string | undefined) ?? null;
        const visibility = context?.mode === "shared" ? "team" : "private";
        const row = await insertThought({
          id,
          raw_text: text,
          title,
          format,
          created_at: new Date(),
          due_at: dueAt,
          user: userId,
          visibility,
          image_data: context?.imageData ?? null,
        });

        // Set topics if provided
        const topicNames = input.topics as string[] | undefined;
        if (topicNames && topicNames.length > 0) {
          const topicIds = resolveTopicIds(userId, topicNames);
          if (topicIds.length > 0) await setTopicsForThought(id, topicIds);
        }

        // Fetch resolved topic names for the response
        const savedTopics = topicNames && topicNames.length > 0
          ? getTopicsForThought(id).map((t) => t.name)
          : undefined;

        // Surface related thoughts from across the knowledge base
        let related_thoughts: Array<Record<string, unknown>> | undefined;
        try {
          const results = await semanticSearch(`${title}\n\n${text}`, {
            viewer: userId,
            limit: 6,
            minScore: 0.3,
          });
          const neighbors = results
            .filter((r) => r.capture_id !== id)
            .slice(0, 5);
          if (neighbors.length > 0) {
            related_thoughts = neighbors
              .map((r) => {
                const t = getThoughtById(r.capture_id);
                if (!t) return null;
                return {
                  id: t.id,
                  title: t.title,
                  format: t.format,
                  created_at: t.created_at,
                  user: t.user,
                  summary: t.slimthought ?? t.raw_text.slice(0, 120),
                  similarity: Math.round(r.score * 100) / 100,
                };
              })
              .filter((r): r is NonNullable<typeof r> => r !== null);
            if (related_thoughts.length === 0) related_thoughts = undefined;
          }
        } catch {
          // Don't fail the save if related lookup fails
        }

        return {
          tool_use_id: toolUseId,
          content: JSON.stringify({
            saved: true,
            id: row.id,
            raw_text: row.raw_text,
            title: row.title,
            format: row.format,
            visibility: row.visibility,
            created_at: row.created_at,
            due_at: row.due_at,
            has_image: !!row.image_data,
            ...(savedTopics && savedTopics.length > 0 ? { topics: savedTopics } : {}),
            ...(related_thoughts ? { related_thoughts } : {}),
          }),
        };
      }

      case "query_thoughts": {
        const directId = input.id as string | undefined;
        const display = (input.display as string) ?? "cards";
        const detail = (input.detail as "summary" | "full") ?? "summary";

        // Direct fetch by ID — always returns full text
        if (directId) {
          const thought = getThoughtById(directId);
          if (!thought) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found" }) };
          }
          if (thought.user !== userId && thought.visibility !== "team") {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found" }) };
          }
          const directTopics = getTopicsForThought(directId).map((t) => t.name);
          return {
            tool_use_id: toolUseId,
            content: JSON.stringify({
              count: 1,
              total_before_limit: 1,
              thoughts: [slimThought(thought, directTopics, "full")],
              display,
            }),
          };
        }

        const query = input.query as string | undefined;
        const formatFilter = input.format as string | undefined;
        const topicFilter = input.topic as string | undefined;
        const userScope = (input.user_scope as string) ?? "mine";
        const dateFrom = input.date_from as string | undefined;
        const dateTo = input.date_to as string | undefined;
        const includeArchived = (input.include_archived as boolean) ?? false;
        const limit = (input.limit as number) ?? 5;

        const teammates = getAllTeammateIds(userId);
        const targetUserIds: UserId[] =
          userScope === "teammate" ? teammates :
          userScope === "both" ? [userId, ...teammates] :
          [userId];

        const hasPostFilters = !!(formatFilter || topicFilter || dateFrom || dateTo);
        // Fetch more from DB when we need to filter in JS; otherwise push exact limit to SQL
        const sqlLimit = hasPostFilters ? limit * 10 : limit;

        let allRows: Thought[] = [];
        const seenIds = new Set<string>();

        for (const uid of targetUserIds) {
          const viewer = uid !== userId ? userId : undefined;
          let rows: Thought[];
          if (query) {
            rows = await hybridSearchThoughts(query, { includeArchived, userId: uid, viewer, limit: sqlLimit });
          } else {
            rows = getAllThoughts(includeArchived, uid, viewer, sqlLimit);
          }
          // Deduplicate across user scopes
          for (const row of rows) {
            if (!seenIds.has(row.id)) {
              seenIds.add(row.id);
              allRows.push(row);
            }
          }
        }

        // Apply filters
        if (formatFilter) allRows = allRows.filter((r) => r.format === formatFilter);
        if (topicFilter) {
          const filterLower = topicFilter.toLowerCase();
          const batchTopics = getTopicsForThoughts(allRows.map((r) => r.id));
          allRows = allRows.filter((r) => {
            const names = batchTopics.get(r.id) ?? [];
            return names.some((n) => n.toLowerCase() === filterLower);
          });
        }
        if (dateFrom || dateTo) {
          if (dateFrom) allRows = allRows.filter((r) => toLocalDate(new Date(r.created_at), getUserConfig(userId).timezone) >= dateFrom);
          if (dateTo) allRows = allRows.filter((r) => toLocalDate(new Date(r.created_at), getUserConfig(userId).timezone) <= dateTo);
        }

        const totalBeforeLimit = allRows.length;
        allRows = allRows.slice(0, limit);

        // Total pool: how many thoughts exist across target users (before search/filters)
        let totalPool = 0;
        for (const uid of targetUserIds) {
          const viewer = uid !== userId ? userId : undefined;
          totalPool += countThoughts(includeArchived, uid, viewer);
        }

        // Exact text match count — cheap COUNT(*) for accurate "how many" answers
        let totalTextMatches: number | undefined;
        if (query) {
          totalTextMatches = 0;
          for (const uid of targetUserIds) {
            const viewer = uid !== userId ? userId : undefined;
            totalTextMatches += countTextMatches(query, includeArchived, uid, viewer);
          }
        }

        const teammateName = userScope !== "mine" && teammates.length > 0
          ? teammates.map((id) => getUserConfig(id).displayName).join(" & ")
          : undefined;
        const topicMap = getTopicsForThoughts(allRows.map((r) => r.id));
        return {
          tool_use_id: toolUseId,
          content: JSON.stringify({
            count: allRows.length,
            total_before_limit: totalBeforeLimit,
            ...(totalTextMatches !== undefined ? { total_text_matches: totalTextMatches } : {}),
            total_pool: totalPool,
            thoughts: allRows.map((r) => slimThought(r, topicMap.get(r.id), detail)),
            display,
            ...(teammateName ? { teammate: teammateName } : {}),
          }),
        };
      }

      case "update_thought": {
        const id = input.id as string;
        const existing = getThoughtById(id);
        if (!existing) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found" }) };
        }
        if (existing.user !== userId) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "You can only edit your own thoughts" }) };
        }
        const validFormats = getValidFormatIds();
        const fields: { raw_text?: string; title?: string; format?: string; due_at?: string | null; visibility?: "private" | "team"; topicIds?: string[] } = {};
        if (input.raw_text !== undefined) fields.raw_text = input.raw_text as string;
        if (input.title !== undefined) fields.title = input.title as string;
        if (input.format !== undefined) {
          const format = input.format as string;
          if (!validFormats.has(format)) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Invalid format: ${format}` }) };
          }
          fields.format = format;
        }
        if (input.due_at !== undefined) fields.due_at = (input.due_at as string | null) ?? null;
        // Visibility changes: making private is always allowed; making shared requires shared mode
        if (input.visibility !== undefined) {
          const vis = input.visibility as string;
          console.log(`[visibility-change] thought=${id} from=${existing.visibility} to=${vis} mode=${context?.mode}`);
          if (vis === "team" && context?.mode !== "shared") {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Cannot share thoughts while in private mode. Ask the user to flip the switch to shared." }) };
          }
          if (vis === "private" || vis === "team") {
            fields.visibility = vis;
          }
        }
        const topicNames = input.topics as string[] | undefined;
        if (topicNames !== undefined) {
          fields.topicIds = topicNames.length > 0 ? resolveTopicIds(userId, topicNames) : [];
        }

        const updated = await updateThought(id, fields);
        if (!updated) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "No fields to update" }) };
        }

        const reclassification = fields.format && fields.format !== existing.format
          ? { reclassified_from: existing.format, reclassified_to: fields.format }
          : undefined;

        const updatedTopics = getTopicsForThought(id).map((t) => t.name);

        return {
          tool_use_id: toolUseId,
          content: JSON.stringify({
            updated: true,
            thought: slimThought(updated, updatedTopics),
            ...reclassification,
          }),
        };
      }

      case "thought_lifecycle": {
        const id = input.id as string;
        const action = input.action as string;
        const existing = getThoughtById(id);
        if (!existing) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found" }) };
        }
        if (existing.user !== userId) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: `You can only ${action} your own thoughts` }) };
        }
        if (action === "archive") {
          if (existing.archived) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Already archived" }) };
          }
          await archiveThought(id);
          const archived = getThoughtById(id);
          if (!archived) return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found after archive" }) };
          return { tool_use_id: toolUseId, content: JSON.stringify({ archived: true, thought: slimThought(archived) }) };
        }
        if (action === "unarchive") {
          if (!existing.archived) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Not archived" }) };
          }
          await unarchiveThought(id);
          const unarchived = getThoughtById(id);
          if (!unarchived) return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found after unarchive" }) };
          return { tool_use_id: toolUseId, content: JSON.stringify({ unarchived: true, thought: slimThought(unarchived) }) };
        }
        if (action === "trash") {
          if (existing.trashed) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Already in trash" }) };
          }
          await trashThought(id);
          const trashed = getThoughtById(id);
          if (!trashed) return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found after trash" }) };
          return { tool_use_id: toolUseId, content: JSON.stringify({ trashed: true, thought: slimThought(trashed) }) };
        }
        if (action === "restore") {
          if (!existing.trashed) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Not in trash" }) };
          }
          await restoreFromTrash(id);
          const restored = getThoughtById(id);
          if (!restored) return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Thought not found after restore" }) };
          return { tool_use_id: toolUseId, content: JSON.stringify({ restored: true, thought: slimThought(restored) }) };
        }
        return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Unknown action: ${action}` }) };
      }

      case "search_trash": {
        const query = (input.query as string).trim();
        const display = (input.display as string) ?? "cards";
        let rows: Thought[];
        if (!query) {
          rows = getTrashedThoughts(userId);
        } else {
          // Embeddings are deleted on trash, so semantic search won't find trashed items.
          // Go straight to text search.
          rows = searchTrashedThoughts(query, userId);
        }
        const trashTopicMap = getTopicsForThoughts(rows.map((r) => r.id));
        return {
          tool_use_id: toolUseId,
          content: JSON.stringify({ count: rows.length, trashed_thoughts: rows.map((r) => slimThought(r, trashTopicMap.get(r.id), "summary")), display }),
        };
      }

      case "manage_topics": {
        const action = input.action as string;

        if (action === "list") {
          const topics = getUserTopicsWithCounts(userId);
          return {
            tool_use_id: toolUseId,
            content: JSON.stringify({ topics: topics.map((t) => ({ id: t.id, name: t.name, count: t.count })) }),
          };
        }

        if (action === "create") {
          const topicName = input.name as string;
          if (!topicName?.trim()) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "name is required" }) };
          }
          const existing = getUserTopics(userId);
          if (existing.length >= 15) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Maximum 15 topics per user" }) };
          }
          if (existing.some((t) => t.name.toLowerCase() === topicName.trim().toLowerCase())) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Topic "${topicName.trim()}" already exists` }) };
          }
          const topic = await createUserTopic(userId, topicName.trim());
          return {
            tool_use_id: toolUseId,
            content: JSON.stringify({ created: true, topic: { id: topic.id, name: topic.name } }),
          };
        }

        if (action === "delete") {
          const topicId = input.topic_id as string;
          if (!topicId) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "topic_id is required" }) };
          }
          // Verify the topic belongs to the current user
          const ownTopics = getUserTopics(userId);
          if (!ownTopics.some((t) => t.id === topicId)) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Topic not found or not owned by you" }) };
          }
          await deleteUserTopic(topicId);
          return {
            tool_use_id: toolUseId,
            content: JSON.stringify({ deleted: true, topic_id: topicId }),
          };
        }

        return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Unknown action: ${action}` }) };
      }

      case "read_agent_file": {
        const filePath = input.path as string;
        try {
          const content = readAgentFile(filePath);
          if (!content) {
            return { tool_use_id: toolUseId, content: JSON.stringify({ path: filePath, exists: false, content: "" }) };
          }
          return { tool_use_id: toolUseId, content: JSON.stringify({ path: filePath, exists: true, content }) };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to read file";
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: message }) };
        }
      }

      case "write_agent_file": {
        const filePath = input.path as string;
        const content = input.content as string;
        const mode = (input.mode as "overwrite" | "append") ?? "overwrite";
        try {
          writeAgentFile(filePath, content, mode);
          return { tool_use_id: toolUseId, content: JSON.stringify({ written: true, path: filePath, mode }) };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to write file";
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: message }) };
        }
      }

      case "test_classification": {
        const text = (input.text as string).trim();
        const targetUser = (input.user as UserId) ?? userId;
        if (!text) {
          return { tool_use_id: toolUseId, content: JSON.stringify({ error: "Text is required" }) };
        }
        const result = await classify(text, targetUser);
        return {
          tool_use_id: toolUseId,
          content: JSON.stringify({ dry_run: true, text_preview: text.slice(0, 100), ...result }),
        };
      }

      default:
        return { tool_use_id: toolUseId, content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return { tool_use_id: toolUseId, content: JSON.stringify({ error: message }) };
  }
}

export function getSystemPrompt(userId: UserId, source?: "chat" | "voice" | "templates", mode?: "private" | "shared"): { stable: string; volatile: string } {
  const config = getUserConfig(userId);
  const formats = getAllFormats();

  const formatDescriptions = formats
    .map((t) => `"${t.id}" = ${t.description}`)
    .join(", ");

  const formatIds = formats.map((t) => t.id).join(" | ");

  const teammates = getAllTeammateIds(userId);
  const teammateNames = teammates.map((id) => getUserConfig(id).displayName);

  // Inject agent knowledge
  const agentKnowledge = getAgentKnowledge(userId);

  // Get user's topics for the prompt
  let topicsList = "";
  try {
    const topics = getUserTopics(userId);
    if (topics.length > 0) {
      topicsList = `\n**${config.displayName}'s topics**: ${topics.map((t) => t.name).join(", ")}`;
    }
  } catch {
    // Topics table might not exist yet
  }

  // Image guidance — only for modes that can have images
  const imageGuidance = (source !== "voice" && source !== "templates")
    ? `\n\n**Image thoughts**: When saving with an image, the text MUST include a thorough description — key details, names, numbers, structure. The image won't be visible during search; only the text makes it findable.`
    : "";

  // Learning & memory — only for chat mode
  const learningMemory = (source === "chat" || source === undefined) ? `

## Learning & Memory

Knowledge files in \`data/agent/\` persist across sessions. Update when you learn:
- Classification correction (\`reclassified_from/to\`) → update \`rules/${userId}.md\`
- User preference/pattern → update \`users/${userId}.md\`
- Notable session event → append to today's daily log
- Durable fact/decision → update \`MEMORY.md\`
After writing a classification rule, optionally use test_classification to verify.` : "";

  // Agent knowledge — only include header if there's content
  const knowledgeBlock = agentKnowledge
    ? `# Your Knowledge\n\n${agentKnowledge}\n\n---\n\n`
    : "";

  const isCapture = source === "voice";
  const isQuery = source === "templates";

  // Retrieval — only for modes with query_thoughts
  const retrievalSection = !isCapture ? `

## Retrieval

Be cost-conscious — use the smallest \`limit\` that answers the question. For counting, use \`display: "silent"\` and read \`total_text_matches\`.

Always make a fresh tool call — never reuse previous results. \`query_thoughts\` returns slimthoughts by default — concise AI-generated summaries sufficient for most queries. Only use \`detail: "full"\` when the user explicitly asks to read full content, or you need to quote or edit.
- Hybrid search (text + meaning). Wrap in quotes for exact-match only.
- Try alternative phrasing if first query returns nothing.
- Only the last query_thoughts per turn renders cards.` : "";

  // Style — card rendering guidance only for modes with query_thoughts
  const cardGuidance = !isCapture ? `

Tool results render as UI cards above your text:
- \`display: "cards"\` shows thought cards. Don't repeat card content — add synthesis/commentary.
- \`display: "silent"\` suppresses cards for synthesis/counting.` : "";

  // Topics guidance — mention saving only for modes with save_thought
  const topicsGuidance = !isQuery
    ? `Topics: user-defined tags (0-3 per thought). manage_topics to list/create/delete. Suggest relevant topics when saving.`
    : `Topics: user-defined tags. manage_topics to list/create/delete.`;

  // === STABLE PART — cached, changes only when agent knowledge/topics change ===
  const stable = `${knowledgeBlock}**Current formats**: ${formatIds}${topicsList}

You are ${config.displayName}'s thought assistant inside ThoughtKeeper — a thought capture app. Everything saves to a local database. Be useful, not chatty. Be opinionated — classify decisively, connect what they haven't connected. Earn trust by being right, not by being cautious.

${teammateNames.length > 0 ? `${config.displayName} and ${teammateNames.join(" and ")} are teammates. Access all team members' thoughts as a shared knowledge base.` : `${config.displayName} is using ThoughtKeeper as an individual user.`}${imageGuidance}${retrievalSection}

## Style

Act, don't announce. Be brief. Match energy.${!isQuery ? " Mention title and format when saving. When save_thought returns \`related_thoughts\`, briefly note any meaningful connections — especially cross-user or cross-time links the user wouldn't expect." : ""} Use markdown, bullet lists, headers — never cram items onto one line.${cardGuidance}

## Data model

Formats: ${formatDescriptions}.
Due dates on all formats. Resolve relative dates against the user's current time. ISO 8601 with their timezone offset. Date-only = T09:00:00. Omit if not mentioned.

${topicsGuidance}${!isCapture ? `

When querying with user_scope "both"/"teammate", only shared thoughts from others are returned.` : ""}${learningMemory}`;

  // === VOLATILE PART — not cached, changes per request ===
  const tz = config.timezone;
  const abbrev = tzAbbrev(tz);
  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(Math.floor(rounded.getMinutes() / 5) * 5, 0, 0);
  const localDate = rounded.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const localIsoDate = toLocalDate(rounded, tz);
  const localTime = rounded.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const volatileParts: string[] = [
    `Now: ${localDate}, ${localTime} (${abbrev}). Today: ${localIsoDate}.`,
  ];

  // Privacy mode — skip for templates (read-only)
  if (!isQuery) {
    if (mode === "shared") {
      const shareHint = !isCapture ? ` Can change private→shared via update_thought.` : "";
      volatileParts.push(`Capture mode: shared. New captures visible to team.${shareHint}`);
    } else {
      volatileParts.push(`Capture mode: private. Cannot share — user must flip the switch first.`);
    }
  }

  // Source-specific instructions
  if (source === "voice") {
    volatileParts.push(`VOICE MODE: Every message is a thought to capture. Pick format and save via save_thought. Response MUST be under 20 words. No markdown, no questions.`);
  } else if (source === "templates") {
    volatileParts.push(`TEMPLATES MODE: Use query_thoughts (silent) to retrieve thoughts, then fill the template structure. Preserve headers/sections. Use date filters for time ranges. May need multiple queries.\nFORMATTING: Your output is rendered through a markdown parser. You MUST use proper markdown syntax — bullet lists (\`- item\`) for any list of items, \`##\` for section headers. Plain indentation or leading spaces are NOT rendered. Every list of items must use \`- \` bullets so lines are visually distinct, especially when text wraps.`);
  }

  return { stable, volatile: volatileParts.join("\n") };
}
