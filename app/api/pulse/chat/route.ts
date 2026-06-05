import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/auth";
import { executeTool } from "@/lib/chat-tools";
import { CHAT_MODEL } from "@/lib/models";
import { checkRateLimit } from "@/lib/rate-limit";
import { nowForPrompt, tzAbbrev, toLocalDate } from "@/lib/format";
import { getUserConfig, type UserId } from "@/lib/users-server";
import { THOUGHT_FORMAT_IDS } from "@/lib/users";

const client = new Anthropic();
const MAX_TOOL_ROUNDS = 5;
const FORMAT_IDS = THOUGHT_FORMAT_IDS;

/** Pulse-specific subset of tools. */
function getPulseTools(): Anthropic.Tool[] {
  return [
    {
      name: "query_thoughts",
      description:
        "Search and retrieve thoughts to surface in the pulse view. Results appear as a new card section. For 'latest'/'recent', omit query and use limit 1–3.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Hybrid text+semantic search. Omit to browse by recency.",
          },
          format: {
            type: "string",
            enum: [...FORMAT_IDS],
            description: "Filter by format.",
          },
          topic: {
            type: "string",
            description: "Filter by topic name.",
          },
          date_from: { type: "string", description: "YYYY-MM-DD start." },
          date_to: { type: "string", description: "YYYY-MM-DD end." },
          include_archived: { type: "boolean", description: "Default false." },
          limit: {
            type: "number",
            description: "Max results (default 5).",
          },
          section_title: {
            type: "string",
            description: "Title for the new section in the pulse view (e.g. 'Todos without due dates'). Always provide.",
          },
        },
        required: ["section_title"],
      },
    },
    {
      name: "thought_lifecycle",
      description:
        "Archive, unarchive, trash, or restore a thought.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "The thought ID" },
          action: {
            type: "string",
            enum: ["archive", "unarchive", "trash", "restore"],
            description: "Action to perform",
          },
        },
        required: ["id", "action"],
      },
    },
  ];
}

function buildSystemPrompt(
  userId: UserId,
  pulseContext: string
): { stable: string; volatile: string } {
  const config = getUserConfig(userId);
  const tz = config.timezone;
  const now = nowForPrompt(tz);
  const abbrev = tzAbbrev(tz);
  const today = toLocalDate(new Date(), tz);

  const stable = `You are ${config.displayName}'s pulse assistant inside ThoughtKeeper, a thought capture app.

Your job is to help ${config.displayName} understand and act on their Daily Pulse — the items that need attention today. You can also surface additional thoughts as new sections in the pulse view.

## How you work
- When the user asks about a specific nudge, explain why it's showing (overdue, stale, or duplicate) using the pulse context below.
- When the user asks to see more thoughts (e.g. "show me todos without due dates"), use query_thoughts. The results will appear as a new card section in the pulse view — NOT as a chat message.
- Always provide a section_title when querying — this becomes the section header.
- Keep responses concise (1-3 sentences). The cards do the talking.
- You only have access to query and lifecycle tools. For edits, suggest the user use the main chat.

## Pulse context
${pulseContext}`;

  const volatile = `Now: ${now} (${abbrev}). Today: ${today}.`;

  return { stable, volatile };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

export async function POST(req: NextRequest) {
  let body: {
    messages?: ChatMessage[];
    pulseContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let userId: UserId;
  try {
    userId = getAuthenticatedUser(req) as UserId;
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { allowed, retryAfter } = checkRateLimit(`pulse-chat:${userId}`, 20, 60000);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const tools = getPulseTools();
  const prompt = buildSystemPrompt(userId, body.pulseContext ?? "No pulse data provided.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const messages: Anthropic.MessageParam[] = body.messages!.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const systemBlocks: Anthropic.TextBlockParam[] = [
          { type: "text", text: prompt.stable },
          { type: "text", text: prompt.volatile },
        ];

        let rounds = 0;
        let lastKeepAlive = Date.now();
        while (rounds < MAX_TOOL_ROUNDS) {
          if (req.signal.aborted) break;
          rounds++;

          const response = client.messages.stream(
            {
              model: CHAT_MODEL,
              max_tokens: 1024,
              system: systemBlocks,
              tools,
              messages,
            },
            { signal: req.signal }
          );

          const announcedToolIds = new Set<string>();

          for await (const event of response) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                send("text", { text: event.delta.text });
              } else if (event.delta.type === "input_json_delta") {
                const now = Date.now();
                if (now - lastKeepAlive > 5000) {
                  controller.enqueue(encoder.encode(":\n\n"));
                  lastKeepAlive = now;
                }
              }
            }
            if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              announcedToolIds.add(event.content_block.id);
              send("tool_call", { name: event.content_block.name });
            }
          }

          const finalMessage = await response.finalMessage();
          messages.push({ role: "assistant", content: finalMessage.content });

          const toolBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          if (toolBlocks.length === 0 || finalMessage.stop_reason !== "tool_use") {
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolBlocks) {
            const toolInput = block.input as Record<string, unknown>;
            // Extract section_title before passing to executeTool (it's UI-only)
            const sectionTitle = toolInput.section_title as string | undefined;
            delete toolInput.section_title;

            // Force display to "cards" and user_scope to "mine" for pulse
            if (block.name === "query_thoughts") {
              toolInput.display = "cards";
              toolInput.user_scope = "mine";
            }

            if (!announcedToolIds.has(block.id)) {
              send("tool_call", {
                name: block.name,
                input: { ...toolInput, section_title: sectionTitle },
              });
            }

            const result = await executeTool(
              block.name,
              toolInput,
              block.id,
              userId
            );

            let parsedResult: unknown;
            try {
              parsedResult = JSON.parse(result.content);
            } catch {
              parsedResult = result.content;
            }
            send("tool_result", {
              name: block.name,
              input: { ...toolInput, section_title: sectionTitle },
              result: parsedResult,
              section_title: sectionTitle,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.content,
            });
          }

          messages.push({ role: "user", content: toolResults });
        }

        send("done", {});
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          console.error("[pulse-chat]", e);
          send("error", { message: "Something went wrong" });
        }
      } finally {
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
