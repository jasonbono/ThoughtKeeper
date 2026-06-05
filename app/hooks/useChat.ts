"use client";

import { useState, useRef, useCallback } from "react";
import type { ToolEvent, DisplayMessage, ApiMessageContent, ApiMessage } from "../../lib/types";

export type { ToolEvent, DisplayMessage, ApiMessageContent, ApiMessage };

// Tools whose results are large (list/query responses). Others are small enough to always keep.
const HEAVY_TOOLS = new Set([
  "query_thoughts", "search_trash",
  "read_agent_file",
]);

// Max user–assistant exchanges to send to the API.
// Server-side summarization kicks in at 5 exchanges and keeps 3 verbatim,
// so anything beyond 7 is just extra input for the summarizer.
const MAX_EXCHANGES = 7;

// Only include images in the most recent N user messages (images are token-heavy).
const IMAGE_RECENCY = 3;

/**
 * Build context-pruned API messages from display messages.
 * - Windows to the last MAX_EXCHANGES user–assistant pairs.
 * - Strips images from older messages.
 * - Heavy tool results are always masked to { note, count } — the assistant's
 *   text already summarizes what was found; re-query if raw data is needed.
 */
export function buildApiMessages(
  messages: DisplayMessage[],
  opts?: {
    /** Injected at the start of the message list (e.g. template context, last-note context) */
    contextPrefix?: ApiMessage[];
    /** Parse image data URLs into Anthropic image blocks */
    includeImages?: boolean;
  }
): ApiMessage[] {
  const { contextPrefix, includeImages } = opts ?? {};

  // Window to last N exchanges (messages are always added in user+assistant pairs)
  const maxMessages = MAX_EXCHANGES * 2;
  const windowed = messages.length > maxMessages
    ? messages.slice(-maxMessages)
    : messages;

  // Count user messages from the end to determine image recency
  let userMsgCount = 0;
  for (let i = windowed.length - 1; i >= 0; i--) {
    if (windowed[i].role === "user") userMsgCount++;
  }

  const apiMessages: ApiMessage[] = [];

  if (contextPrefix) {
    apiMessages.push(...contextPrefix);
  }

  let userIdx = 0;
  for (const m of windowed) {
    if (m.role === "user") {
      userIdx++;
      const isRecent = (userMsgCount - userIdx) < IMAGE_RECENCY;
      if (includeImages && isRecent && m.imageDataUrl) {
        const parsed = parseDataUrl(m.imageDataUrl);
        const blocks: Array<{ type: string; [key: string]: unknown }> = [];
        if (parsed) {
          blocks.push({ type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 } });
        }
        if (m.text) blocks.push({ type: "text", text: m.text });
        if (blocks.length > 0) apiMessages.push({ role: "user", content: blocks });
      } else if (m.text.length > 0) {
        apiMessages.push({ role: "user", content: m.text });
      }
    } else if (m.role === "assistant") {
      const parts: string[] = [];
      for (const te of m.toolEvents) {
        if (te.type === "tool_result") {
          // Always mask heavy tool results in history — the assistant's text
          // response already summarizes what was found. If the model needs
          // the raw data again it can re-query (cheap).
          if (HEAVY_TOOLS.has(te.name)) {
            const count = typeof te.data?.count === "number" ? te.data.count : undefined;
            const trimmed: Record<string, unknown> = { note: "prior result — re-query if needed" };
            if (count !== undefined) trimmed.count = count;
            parts.push(`[${te.name} result: ${JSON.stringify(trimmed)}]`);
          } else {
            parts.push(`[${te.name} result: ${JSON.stringify(te.data)}]`);
          }
        }
      }
      if (m.text) parts.push(m.text);
      const content = parts.join("\n");
      if (content.length > 0) apiMessages.push({ role: "assistant", content });
    }
  }

  return apiMessages;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

// ── Hook ──

interface UseChatOptions {
  source: "chat" | "voice" | "templates";
  captureMode?: "private" | "shared";
  /** Called to build context prefix messages before each send */
  getContextPrefix?: () => ApiMessage[] | undefined;
  /** Whether to include image data in API messages */
  includeImages?: boolean;
}

export function useChat({ source, captureMode, getContextPrefix, includeImages }: UseChatOptions) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;

  const handleSSE = useCallback((assistantId: string, event: string, data: Record<string, unknown>) => {
    if (event === "text") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: m.text + (data.text as string) } : m
        )
      );
    } else if (event === "tool_call") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, toolEvents: [...m.toolEvents, { type: "tool_call", name: data.name as string, data }] }
            : m
        )
      );
    } else if (event === "tool_result") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, toolEvents: [...m.toolEvents, {
                type: "tool_result",
                name: data.name as string,
                data: data.result as Record<string, unknown>,
                input: data.input as Record<string, unknown> | undefined,
              }] }
            : m
        )
      );
    }
  }, []);

  const sendMessage = useCallback(async (
    text: string,
    opts?: { imageDataUrl?: string | null }
  ) => {
    const trimmed = text.trim();
    const imageDataUrl = opts?.imageDataUrl ?? undefined;
    if ((!trimmed && !imageDataUrl) || isStreaming) return;

    const userMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      toolEvents: [],
      imageDataUrl,
    };
    const assistantMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      toolEvents: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const contextPrefix = getContextPrefix?.();
    const apiMessages = buildApiMessages(messagesRef.current, { contextPrefix, includeImages });

    // Add the current user message
    if (imageDataUrl) {
      const parsed = parseDataUrl(imageDataUrl);
      const blocks: Array<{ type: string; [key: string]: unknown }> = [];
      if (parsed) {
        blocks.push({ type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 } });
      }
      blocks.push({ type: "text", text: trimmed || "Capture this image." });
      apiMessages.push({ role: "user", content: blocks });
    } else {
      apiMessages.push({ role: "user", content: trimmed });
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, source, mode: captureMode }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSE(assistantMsg.id, eventType, data);
            } catch {
              // skip malformed
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, text: m.text || "Something went wrong. Try again." } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, source, captureMode, getContextPrefix, includeImages, handleSSE]);

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, clearMessages, setMessages };
}
