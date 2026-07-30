# xspace-AI examples

AI agents that join, listen, and speak in X/Twitter Spaces — TypeScript SDK plus server, dashboard, and voice pipeline.

## Example 1

```bash
node packages/cli/bin/xspace-agent join https://x.com/i/spaces/YOUR_SPACE_ID --provider openai
```

## Example 2

```bash
git clone https://github.com/nirholas/xspace-AI.git
cd xspace-AI
pnpm install
pnpm build
```

## Example 3

```bash
# .env
X_AUTH_TOKEN=your_x_auth_token
X_CT0=your_x_ct0_cookie
OPENAI_API_KEY=sk-...
```

## Example 4

```bash
node packages/cli/bin/xspace-agent join https://x.com/i/spaces/YOUR_SPACE_ID --provider openai
```

## Example 5

```bash
npm run docker:build
docker run -e OPENAI_API_KEY=sk-... -p 3000:3000 --shm-size=2gb xspace-agent
```

## Example 6

```text
packages/
  core/                → xspace-agent         The main SDK. Everything needed to build an AI agent
                         ├── agent.ts            Entry point — orchestrates browser, audio, LLM, turns
                         ├── team.ts             Multi-agent coordination (multiple AIs, one Space)
                         ├── audio/              PCM capture, VAD, silence detection, WAV encoding, TTS injection
                         ├── browser/            Puppeteer lifecycle, self-healing selector engine, DOM interaction
                         ├── fsm/                Finite state machine for agent & team lifecycles
                         ├── intelligence/       Speaker ID, topic tracking, sentiment, context management
                         ├── pipeline/           Provider factories — createLLM(), createSTT(), createTTS()
                         ├── turns/              Turn coordination, decision engine, interruption handling
                         ├── plugins/            Plugin system with 6 middleware hooks (before/after stt/llm/tts)
                         ├── providers/          Multi-provider router and cost tracking
                         ├── db/                 Drizzle ORM, migrations, repositories
                         ├── auth/               X/Twitter login, token validation, OAuth, SAML
                         ├── memory/             Conversation persistence, RAG, archiving
                         ├── observability/      Structured logging (Pino), tracing, metrics
                         └── __tests__/          Unit & E2E test suites with fixtures

  server/              → @xspace/server        Express + Socket.IO admin panel
                         ├── routes/             REST API endpoints
                         ├── events/             Socket.IO real-time event handlers
                         ├── middleware/          Auth, validation, CORS, rate limiting
                         ├── schemas/            Zod request/response validation
                         ├── personalities/      Preset agent configurations
                         └── public/             Admin dashboard HTML/CSS/JS

  cli/                 → @xspace/cli           Command-line tool
                         └── commands/           init, auth, join, start, dashboard

  widget/              → @xspace/widget        Embeddable voice chat widget (UMD + ESM builds)
                         ├── connection.ts       WebSocket connection handler
                         ├── theme.ts            Theme customization
                         └── ui/                 UI components

  create-xspace-agent/ → create-xspace-agent   Project scaffolding (like create-react-app)
                         └── templates/base/     Starter project template

  web-client/          → @xspace/web-client    Browser SDK for x402 pay-per-question
                         ├── client.ts           Question/payment client
                         ├── x402-fetch.ts       x402 payment-aware fetch wrapper
                         └── wallet/             Browser wallet adapters
```

## Example 7

```text
agent-voice-chat/      Standalone voice chat agent — separate from the monorepo
                       ├── server.js             Express + Socket.IO server (38KB)
                       ├── openapi.json           Full REST API spec
                       ├── agents.config.json     Agent configurations
                       ├── room-manager.js        Multi-room coordination
                       ├── knowledge/             Vector embeddings & RAG data
                       ├── memory/                Persistent conversation storage
                       ├── providers/             LLM, STT, TTS implementations
                       └── tests/                 Own test suite (vitest)

src/                   Legacy monolithic server — functional via `npm run dev`, being migrated
                       ├── server/                Express server, socket handlers, routes, metrics
                       ├── browser/               Puppeteer auth, launcher, orchestrator, selectors
                       ├── audio/                 Audio stream bridge
                       └── client/                Frontend initialization & provider configs

x-spaces/             Low-level Puppeteer automation scripts (JavaScript)
                       ├── index.js               Orchestration entry point
                       ├── audio-bridge.js         Audio capture & injection via CDP
                       ├── auth.js                 Browser cookie authentication
                       └── space-ui.js             X Spaces DOM interaction & selectors
```

## Example 8

```text
examples/              12 runnable projects — basic-join, multi-agent-debate, discord-bridge,
                       custom-provider, middleware-pipeline, express-integration, scheduled-spaces,
                       chrome-connect, with-plugins, and more. All but `plugins/` (a set of
                       reusable plugin modules) have their own package.json.

docs/                  78 markdown files: architecture overview, API reference (REST + WebSocket),
                       provider guides, deployment (Docker, Railway, Render, VPS), troubleshooting,
                       plugin system, configuration, and internal design specs.

personalities/         Pre-built agent personalities with system prompts & voice preferences
                       └── presets/               agent-zero, comedian, crypto-degen, educator,
                                                  interviewer, tech-analyst, and more

providers/             AI provider wrappers (JS) — Claude, Groq, OpenAI Chat, OpenAI Realtime, STT, TTS

public/                Frontend assets — admin dashboard, agent builder, voice chat UI,
                       widget demos (React, Vue), landing pages

docker/                Monitoring stack — Prometheus scrape configs + Grafana dashboards

tasks/                 43 implementation specs & roadmap items (landing page, design system,
                       docs site, onboarding flow, admin dashboard v2, auth, rate limiting, etc.)

tests/                 Top-level integration & load tests
```


Every snippet above is taken from the [repository documentation](https://github.com/nirholas/xspace-AI#readme).
