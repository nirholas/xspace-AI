# AGENTS.md

Operating notes for AI coding agents (Claude Code, Codex, Cursor, Copilot and others) working in this repository. Everything here is derived from the files actually in the tree, so trust it over guesses, and update it when the facts change.

## What this repository is

TypeScript SDK and CLI for building AI agents that autonomously join, listen, and speak in X/Twitter Spaces. Supports multiple LLM providers (OpenAI, Claude, Groq), speech-to-text (Whisper, Deepgram), text-to-speech (ElevenLabs, OpenAI), multi-agent coordination, middleware pipelines, and a real-time admin dashboard. No Twitter API approval needed

- Homepage: https://nirholas.github.io/xspace-AI/
- Source: https://github.com/nirholas/xspace-AI
- Primary language: TypeScript
- License: Other (see the LICENSE file)

## Repository layout

- `agent-voice-chat/`
- `automation/`
- `dashboard-vercel/`
- `docker/`
- `docs/`
- `examples/`
- `infra/`
- `infrastructure/`
- `lib/`
- `packages/`
- `personalities/`
- `providers/`
- `public/`
- `routes/`
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CLAUDE.md`
- `package.json`
- `Dockerfile`

Tests live in `tests/`. Add or update a test next to the code you change.

## Setup

```bash
pnpm install
```

## Commands

| Task | Command |
|---|---|
| dev | `pnpm run dev` |
| start | `pnpm start` |
| build | `pnpm run build` |
| test | `pnpm test` |
| lint | `pnpm run lint` |
| typecheck | `pnpm run typecheck` |
| format | `pnpm run format` |
| run with Docker | `docker compose up` |
| build image | `docker build .` |

Run the test and lint commands above before you consider a change finished. If a command fails on code you did not touch, say so in your report instead of silently skipping it.

## Conventions

- TypeScript runs in strict mode; do not loosen `tsconfig.json` to make an error go away.
- Indentation and line endings follow `.editorconfig`.
- `.env` files are gitignored; never commit credentials, and read configuration from environment variables.
- Commit messages follow Conventional Commits (`type(scope): summary`), matching the existing history.
- Read `CONTRIBUTING.md` before opening a pull request.
- `CLAUDE.md` holds additional, more detailed operating rules; it takes precedence where the two overlap.
- Read the surrounding code before adding to it, and match its naming, file organisation and error-handling style.
- Keep `README.md` accurate: if a change alters behaviour, commands or configuration, update the docs in the same commit.
- Do not leave TODO comments, stub functions, placeholder data or commented-out code behind. Finish what you start or leave it out.
- Small, focused commits with a subject line that describes the change, not the act of committing.

## Where to raise things

- Bugs and feature requests: https://github.com/nirholas/xspace-AI/issues
- Questions and ideas: https://github.com/nirholas/xspace-AI/discussions
- Security issues: report privately at https://github.com/nirholas/xspace-AI/security/advisories/new, never in a public issue.
