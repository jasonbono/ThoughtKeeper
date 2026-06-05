import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getTools, getSystemPrompt, executeTool } from "@/lib/chat-tools";
import { getAuthenticatedUser } from "@/lib/auth";
import { CHAT_MODEL } from "@/lib/models";
import { insertChatUsage } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const client = new Anthropic();

const MAX_TOOL_ROUNDS = 25;

// ── Input limits ──
// Chat mode has a tighter limit than Notes — chat messages persist in
// conversation history and compound across turns. Long text belongs in
// Notes mode (single-turn capture, no history cost).
const CHAT_MAX_CHARS = 2000;

// ── Asymptotic forgetting ──
// Multi-turn chat context is managed via two complementary strategies:
//
// 1. Tool result masking (client-side, useChat.ts): Heavy tool results
//    (query_thoughts, search_trash, etc.) are replaced with compact
//    placeholders in ALL prior exchanges. The assistant's text response
//    already summarizes what was found; the model re-queries if needed.
//
// 2. History summarization (server-side, below): When a conversation
//    exceeds SUMMARY_THRESHOLD exchanges, older exchanges are compressed
//    into a ~200-token summary via Haiku. Only the most recent RECENT_KEEP
//    exchanges are sent verbatim to the main model. The summary is injected
//    into the volatile system prompt block.
//
// Both are stateless — applied fresh each request. As the conversation
// grows, the same fixed-size summary covers more exchanges, so compression
// naturally increases. This produces an "asymptotic forgetting" effect:
// recent turns are vivid (verbatim), older turns fade to gist (summary),
// and the total context cost plateaus rather than growing linearly.
//
// To disable summarization: set SUMMARY_THRESHOLD to Infinity.
const SUMMARY_THRESHOLD = 5;  // exchanges before summarization kicks in
const RECENT_KEEP = 3;        // exchanges to always keep verbatim

/**
 * Summarize older chat exchanges using Haiku.
 *
 * Takes the messages that will be compressed and returns a short summary string.
 * The prompt is tuned to preserve conversational arc and user corrections while
 * dropping specific data (IDs, counts, content) that the model can re-query.
 *
 * Returns null on failure — caller should fall back to full history.
 */
async function summarizeOlderExchanges(
  oldMessages: Anthropic.MessageParam[],
): Promise<string | null> {
  // Format messages into a readable transcript for Haiku
  const transcript = oldMessages.map((m) => {
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content
            .map((b) => {
              if (typeof b === "string") return b;
              if ("text" in b && typeof b.text === "string") return b.text;
              // Tool results, images, etc. — just note their presence
              if ("type" in b) return `[${b.type}]`;
              return "";
            })
            .filter(Boolean)
            .join(" ")
        : "";
    return `${m.role}: ${text}`;
  }).join("\n");

  try {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 250,
      system: `You summarize conversation history for an AI assistant's context window.
Write a concise summary (2-4 sentences) that preserves:
- The conversation arc and user's evolving intent
- Any corrections or clarifications the user made
- Emotional context or frustration if present
- Names, dates, and topics discussed

Do NOT preserve (the assistant can re-query for these):
- Specific thought IDs, exact counts, or raw content
- Full tool call details or result data
- Verbatim quotes from retrieved thoughts

Prioritize recent exchanges over older ones.`,
      messages: [
        { role: "user", content: `Summarize this conversation so far:\n\n${transcript}` },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return text || null;
  } catch (e) {
    // Summarization is best-effort — never block the main response
    console.warn("[chat-summary] Haiku summarization failed, using full history:", (e as Error).message);
    return null;
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMessage[]; user?: string; source?: "chat" | "voice" | "templates"; mode?: "private" | "shared" };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enforce chat input limit server-side (client has matching maxLength).
  // Truncate rather than reject — don't break the UX for a limit violation.
  if (body.source === "chat" || body.source === undefined) {
    for (const msg of body.messages) {
      if (msg.role === "user" && typeof msg.content === "string" && msg.content.length > CHAT_MAX_CHARS) {
        msg.content = msg.content.slice(0, CHAT_MAX_CHARS);
      }
    }
  }

  let userId;
  try {
    userId = getAuthenticatedUser(req);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { allowed, retryAfter } = checkRateLimit(`chat:${userId}`, 30, 60000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const tools = getTools(userId, body.source);
  // Cache tool definitions — last tool gets cache_control so the entire tools list is cached
  (tools[tools.length - 1] as unknown as Record<string, unknown>).cache_control = { type: "ephemeral" };
  const model = CHAT_MODEL;

  // Extract the latest image from user messages (for attaching to captures)
  function extractLatestImage(msgs: Anthropic.MessageParam[]): string | null {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.role === "user" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (typeof block === "object" && "type" in block && block.type === "image") {
            const src = (block as Anthropic.ImageBlockParam).source;
            if (src.type === "base64") {
              return `data:${src.media_type};base64,${src.data}`;
            }
          }
        }
      }
    }
    return null;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        let messages: Anthropic.MessageParam[] = body.messages!.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Build system prompt once — stable part is cached, volatile part is not.
        // Computing once outside the loop prevents cache-busting when agent
        // writes to knowledge files mid-request (fix #5).
        const prompt = getSystemPrompt(userId, body.source, body.mode);
        let volatileText = prompt.volatile;

        // ── Summarize old exchanges to reduce context size ──
        // Chat conversations accumulate fast: user messages, assistant responses,
        // and (masked) tool traces compound with each turn. After SUMMARY_THRESHOLD
        // exchanges, we compress the older history into a short summary via Haiku
        // and keep only the recent exchanges verbatim.
        //
        // The summary goes into the volatile system prompt (not cached, changes
        // per request). On failure, we fall back to sending full history.
        if (body.source === "chat" || body.source === undefined) {
          // Count complete exchanges (user–assistant pairs).
          // Messages end with the current user message (unpaired), so use
          // floor(length / 2) to count only complete exchanges.
          const exchangeCount = Math.floor(messages.length / 2);

          if (exchangeCount >= SUMMARY_THRESHOLD) {
            // Keep the last RECENT_KEEP complete exchanges plus the trailing
            // user message. The +1 for odd-length ensures recentMessages always
            // starts with a user message (Anthropic API requirement).
            const recentCount = RECENT_KEEP * 2 + (messages.length % 2);
            const oldMessages = messages.slice(0, -recentCount);
            const recentMessages = messages.slice(-recentCount);

            if (oldMessages.length > 0) {
              const summary = await summarizeOlderExchanges(oldMessages);

              if (summary) {
                volatileText += `\n\n[Summary of earlier exchanges (details omitted — re-query as needed):\n${summary}]`;
                messages = recentMessages;
              }
            }
            // If summary failed or nothing to summarize, messages stays unchanged
          }
        }

        const systemBlocks: Anthropic.TextBlockParam[] = [
          {
            type: "text" as const,
            text: prompt.stable,
            cache_control: { type: "ephemeral" as const },
          },
          {
            type: "text" as const,
            text: volatileText,
          },
        ];

        let rounds = 0;
        let lastKeepAlive = Date.now();
        const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

        while (rounds < MAX_TOOL_ROUNDS) {
          if (req.signal.aborted) break;
          rounds++;

          const response = client.messages.stream({
            model,
            max_tokens: 4096,
            system: systemBlocks,
            tools,
            messages,
          }, { signal: req.signal });

          // Track tool IDs announced during streaming so we don't duplicate
          // the tool_call SSE event after finalMessage().
          const announcedToolIds = new Set<string>();

          for await (const event of response) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                send("text", { text: event.delta.text });
              } else if (event.delta.type === "input_json_delta") {
                // Send periodic SSE keepalive while the model generates tool
                // call JSON — without this the connection appears idle and
                // proxies (e.g. Cloudflare Tunnel) may drop it.
                const now = Date.now();
                if (now - lastKeepAlive > 5000) {
                  controller.enqueue(encoder.encode(":\n\n"));
                  lastKeepAlive = now;
                }
              }
            }
            // Emit tool indicator as soon as the model starts generating a
            // tool call, not after the full response completes. This makes
            // the UI show "Searching thoughts…" / "Updating thought…"
            // immediately instead of appearing frozen.
            if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              announcedToolIds.add(event.content_block.id);
              send("tool_call", { name: event.content_block.name });
            }
          }

          const finalMessage = await response.finalMessage();
          usage.input += finalMessage.usage.input_tokens;
          usage.output += finalMessage.usage.output_tokens;
          usage.cacheRead += (finalMessage.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
          usage.cacheWrite += (finalMessage.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;

          messages.push({ role: "assistant", content: finalMessage.content });

          const toolBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          if (toolBlocks.length === 0 || finalMessage.stop_reason !== "tool_use") {
            break;
          }

          const latestImage = extractLatestImage(messages);
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolBlocks) {
            const toolInput = block.input as Record<string, unknown>;

            // In voice mode, override the assistant's text with the original user message
            // to prevent the model from summarizing/shortening the content.
            if (body.source === "voice" && block.name === "save_thought") {
              const firstUserMsg = body.messages![0];
              const originalText = typeof firstUserMsg.content === "string"
                ? firstUserMsg.content
                : (firstUserMsg.content as Anthropic.ContentBlock[])
                    .filter((b): b is Anthropic.TextBlock => (b as Anthropic.TextBlock).type === "text")
                    .map((b) => b.text)
                    .join("\n");
              toolInput.text = originalText;
            }

            // Only send tool_call if not already announced during streaming
            if (!announcedToolIds.has(block.id)) {
              send("tool_call", { name: block.name, input: toolInput });
            }

            const result = await executeTool(
              block.name,
              toolInput,
              block.id,
              userId,
              { imageData: block.name === "save_thought" ? latestImage : null, mode: body.mode }
            );

            let parsedResult: unknown;
            try { parsedResult = JSON.parse(result.content); } catch { parsedResult = result.content; }
            send("tool_result", {
              name: block.name,
              input: toolInput,
              result: parsedResult,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.content,
            });
          }

          messages.push({ role: "user", content: toolResults });
        }

        try {
          await insertChatUsage({
            user_id: userId,
            model,
            source: body.source,
            input_tokens: usage.input,
            output_tokens: usage.output,
            cache_read_tokens: usage.cacheRead,
            cache_write_tokens: usage.cacheWrite,
            tool_rounds: rounds,
          });
        } catch (e) {
          console.warn("[chat-usage] failed to log:", (e as Error).message);
        }

        send("done", { usage: { input: usage.input, output: usage.output, cache_read: usage.cacheRead, cache_write: usage.cacheWrite, tool_rounds: rounds, model } });
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        const message = err instanceof Error ? err.message : "Stream failed";
        console.error("Chat stream error:", err);
        try { send("error", { error: message }); } catch { /* stream may be closed */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
