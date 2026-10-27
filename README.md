# SupportMind

An AI customer-support agent for an electronics store. SupportMind answers questions about products, return policies, payment methods and delivery rules. It pulls live data (price, stock, specs) from MongoDB and answers from uploaded manuals and policy PDFs using hybrid search (semantic + BM25). When it can't help, it creates a ticket for a human.

## Motivation

This project was built to learn how to build a production-style AI agent end to end: tool calling with **MCP (Model Context Protocol)**, retrieval-augmented generation (RAG) over PDFs, multi-turn chat, guardrails, and caching. Every data source the bot touches is exposed to the model as an MCP tool.

## Table of contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Monorepo structure](#monorepo-structure)
5. [Request workflow](#request-workflow)
6. [RAG pipeline](#rag-pipeline)
7. [Guardrails and rate limiting](#guardrails-and-rate-limiting)
8. [Caching](#caching)
9. [Admin dashboard](#admin-dashboard)
10. [Getting started](#getting-started)
11. [Future roadmap](#future-roadmap)

---

## What it does

- Customers chat with the bot anonymously (no login), with streaming replies.
- Answers FAQ questions (return policy, payment methods, delivery rules) from policy PDFs, with citations.
- Answers product questions (search, details, comparison, price, stock) using live data from MongoDB.
- Answers manual questions from uploaded product manuals.
- Creates a ticket for a human when it can't answer or the user asks for a person.
- Gives admins a dashboard to manage products, upload PDFs, handle tickets and view usage analytics.

**Catalog:** 20–30 electronics products across 4–5 categories. Each category has its own attributes (laptops: RAM, storage, screen size; headphones: battery life, noise cancelling).

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Backend | Node.js, Express, dotenv, Mongoose |
| Database | MongoDB |
| Vector search | MongoDB Atlas Vector Search |
| Lexical search | BM25 via Atlas Search |
| Frontend | React, React Router, MUI |
| LLM | Anthropic Claude via API |
| Embeddings | Third-party embedding model (set in env) |
| Tools layer | MCP server (official TypeScript SDK) |
| Rate limits and cache | Redis |
| Background jobs | Redis-backed queue (PDF ingestion) |

---

## Architecture

```
                    ┌──────────────────────┐
                    │  React frontend      │
                    │  (chat + admin)      │
                    └──────────┬───────────┘
                               │ HTTPS + SSE streaming
                    ┌──────────▼───────────┐
                    │  Express API         │
                    │  auth, rate limits,  │
                    │  guardrails          │
                    └───┬──────────────┬───┘
                        │              │
          LLM calls     │              │  MCP client
     ┌──────────────────▼──┐      ┌────▼─────────────────────┐
     │  Claude API         │      │  MCP server              │
     │  (tool-calling loop)│      │  product, manual, policy │
     └─────────────────────┘      │  search tools,           │
                                  │  create_ticket           │
                                  └────┬───────────────┬─────┘
                                       │               │
                              ┌────────▼───┐    ┌──────▼────────┐
                              │  MongoDB   │    │ Vector + BM25 │
                              │  products, │    │ index (chunks)│
                              │  chats,    │    └───────────────┘
                              │  tickets   │
                              └────────────┘      Redis: rate limits, response cache, job queue
```

The Express backend acts as the MCP client. The MCP server is a separate process that exposes product, manual and policy search plus ticket creation. The chatbot only gets read tools and `create_ticket`, never admin operations.

---

## Monorepo structure

```
supportmind/
├── backend/        # Express API, workflow, services, ingestion worker
├── mcp-server/     # MCP tools
├── frontend/       # React app (chat + admin screens)
├── shared/         # Shared TypeScript types
├── seed/           # Sample products, PDFs, admin seed script
└── README.md
```

---

## Request workflow

1. **Input guardrails:** length cap and prompt-injection checks.
2. **Simple reply check:** greetings and thanks are matched with basic keyword matching and answered with a fixed reply, without calling the model.
3. **Model-driven tool calling:** the model reads the conversation history and decides which tools to call (product search, manual search, policy search, ticket creation), including several tools in one turn. The loop has an iteration cap and tool timeouts.
4. **Output guardrails:** checks the reply before it is shown to the user.
5. **Save and log:** the reply is saved with citations, token usage is logged, and a ticket is created if needed.

**A ticket is created when** the user asks for a human, nothing relevant is found, or a tool fails.

---

## RAG pipeline

Runs as a background job when an admin uploads a PDF. The document status updates as it goes, and the job can be re-run.

**Retrieval:** run semantic and BM25 searches in parallel, merge with Reciprocal Rank Fusion, return the top chunks with source and page for citations. A reranker can be added if quality needs it.

**Updates:** deleting or re-uploading a document removes the old chunks and bumps the document version, which also invalidates cached answers.

---

## Guardrails and rate limiting

- **Rate limiting:** limits how many messages and how many tokens a user can use in a given period, and caps overall usage, so the bot can't be spammed or run up costs. Users are identified by their session (plus IP for anonymous visitors).
- **Input guardrails:** block oversized input and prompt-injection attempts before they reach the model.
- **Output guardrails:** stop the bot from leaking its system prompt, going off-topic, or stating prices and stock that don't match the data.

---

## Caching

- **Prompt caching (provider):** the stable part of every request (system prompt and tool definitions) is cached by the model provider, so repeated calls are faster and cheaper.
- **Response caching:** answers to repeated policy and manual questions are stored in Redis and returned without calling the model. Cache entries are tied to the document version, so uploading, editing or deleting a PDF automatically invalidates stale answers. Price and stock answers are never cached.

---

## Admin dashboard

- Login only; the admin user is created by a seed script.
- Product management, PDF upload and processing status, tickets, and analytics (tokens used, success rate, ticket counts).

---

## Getting started

**Prerequisites:** Node.js 20+, MongoDB (Atlas for vector search), Redis, an Anthropic API key, an embeddings provider key.

**Environment variables (backend)**

| Variable | Purpose |
|---|---|
| `PORT` | API port |
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | LLM API key (server-side only) |
| `LLM_MODEL` | Model name |
| `EMBEDDING_PROVIDER` / `EMBEDDING_API_KEY` | Embeddings |
| `JWT_SECRET` | Admin auth |
| `ALLOWED_ORIGINS` | CORS |
| `MCP_SERVER_COMMAND` or `MCP_SERVER_URL` | How the backend reaches the MCP server |

**Setup**
1. Install dependencies in each workspace (`backend`, `mcp-server`, `frontend`, `shared`).
2. Copy the example env file and fill it in.
3. Run the seed script to create the admin user, products and sample PDFs.
4. Start MongoDB and Redis, then the backend, MCP server and frontend.

---

## Future roadmap

1. **Customer accounts and orders.** Customer authentication and an orders collection.
2. **Order tracking.** Live order status from an orders API.
3. **Refunds and returns.** Write actions with safeguards: user confirmation, authorization checks, idempotency and audit logs.
4. **Human escalation for complex or emotional conversations.**
5. **Product images.** Image fields on products, returned in chat replies.
6. **Intent router.** Route each message by intent to handle hardcoded replies (greetings, thanks, "track my order") and to decide what is cacheable, instead of relying on the model for everything.
7. **Reranker and OCR.** Rerank retrieval results and support scanned PDFs.
8. **Multi-server MCP.** Split into separate catalog and support servers.
9. **Scaling.** Stateless servers, Redis-backed limits and cache, and a job queue for ingestion to support thousands of users.