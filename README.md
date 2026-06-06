# ThoughtKeeper

An AI-native thought-capture app. Speak or type a thought and an agent classifies it, connects it to related thoughts, and resurfaces it when it matters. It is local-first: a single SQLite database is the source of truth, with hybrid full-text and vector search running in-process.

<p align="center">
  <img src="assets/thoughtkeeper-demo.gif" width="320" alt="ThoughtKeeper demo" />
</p>

<p align="center">
  <em><a href="assets/thoughtkeeper-demo.mp4">Watch the full 72-second walkthrough</a></em>
</p>

This is a working personal product, not a demo. The notes below point a reviewer at the parts of the code that are worth reading.

## Highlights

- **Hybrid retrieval with Reciprocal Rank Fusion.** Search fuses three independent signals (SQLite full-text matching, vector similarity via `sqlite-vec`, and recency) with RRF, supports quoted exact-match queries, and degrades gracefully when embeddings are unavailable. See [lib/db/search.ts](lib/db/search.ts).
- **Context-window engineering.** Long conversations are kept cheap through "asymptotic forgetting": heavy tool results are masked in prior turns, and older exchanges are rolled into a short running summary by a smaller model. The system prompt is split into a cached stable block and a volatile block, with prompt caching on both the prompt and the tool definitions. Streaming uses periodic keepalives so the connection survives idle proxies. See [app/api/chat/route.ts](app/api/chat/route.ts).
- **Agentic tool loop.** A typed tool set drives a multi-round agent that saves, searches, edits, and organizes thoughts. Tools are tiered by entry point (voice gets only capture, templates get only query, chat gets everything), with per-request token and cache accounting. See [lib/chat-tools.ts](lib/chat-tools.ts).
- **Local-first data layer.** `better-sqlite3` in WAL mode, a promise-chain write serializer that funnels async callers through SQLite's single writer, idempotent additive migrations, and non-blocking startup backfills for embeddings and summaries. See [lib/db/connection.ts](lib/db/connection.ts).
- **An agent with its own memory.** The assistant reads and writes a small set of Markdown knowledge files (identity, learned classification rules, per-user models, daily logs) that persist across sessions and feed back into its prompt. See [lib/agent-files.ts](lib/agent-files.ts).
- **Voice capture.** Audio is transcribed with OpenAI and saved through a fast capture path tuned for "say it and forget it." See [app/api/transcribe/route.ts](app/api/transcribe/route.ts) and [app/components/InlineCapture.tsx](app/components/InlineCapture.tsx).
- **Team-scoped sharing.** Every thought carries a user and a visibility (private or team). Queries are scoped per viewer, so a shared knowledge base and private notes coexist in one database.

## Stack

Next.js 16 (App Router) and React 19 in TypeScript. SQLite via `better-sqlite3` with the `sqlite-vec` extension for vector search. Anthropic for chat and classification, OpenAI for embeddings and transcription. Zustand for client state, Tailwind v4 for styling. An optional Capacitor wrapper packages the same UI as a native iOS app.

## How it works

A thought enters through one of three paths: voice (transcribed, then captured), an inline write box, or the chat agent. Captures are classified into a small format set, embedded for semantic search, and (when long) compressed into a short summary used in list views. Retrieval goes through one `query_thoughts` tool backed by the hybrid search above. The chat agent composes its system prompt from a cached core plus the agent's current knowledge files, runs a bounded tool loop, and streams results to the UI as cards plus text.

## Running locally

Requirements: Node 20+ and a toolchain capable of building `better-sqlite3` (a native module).

```bash
npm install
cp .env.local.example .env.local   # then add your API keys
npm run dev                          # http://localhost:3000
```

On first run the SQLite database and the agent's knowledge files are created automatically under `data/`. In development there is no auth proxy, so all requests resolve to a single default user.

## Authentication and deployment

The app is designed to run behind a reverse proxy that authenticates the user and sets an authenticated-email header. [lib/auth.ts](lib/auth.ts) maps that email to a user; in development it falls back to a default user. There is no built-in password system, so put your own auth layer or proxy in front before exposing it.

Data is a single SQLite file under `data/`. Run it on a host with a persistent disk and back that file up out of band. Vector search runs in-process through `sqlite-vec`, so there is no separate vector database to operate.

## About this snapshot

This repository is a public snapshot of a personal product. For privacy and IP reasons, some material has been removed or replaced: real database contents and user data, personal identifiers, and deployment-specific configuration. Neutral demo users and defaults stand in for the originals. The application code itself is intact.

## License

MIT. See [LICENSE](LICENSE).
