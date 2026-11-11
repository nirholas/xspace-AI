---
name: xspace-agent
description: Build and run an AI agent that joins, listens and speaks in X (Twitter) Spaces with the xspace-agent TypeScript SDK or its CLI. Use when the user wants a voice bot in an X Space, with a chosen LLM, speech-to-text and text-to-speech provider.
---

# xspace-agent

`xspace-agent` (npm, version 0.2.0) drives a headless Chromium (Puppeteer) session on x.com, transcribes the Space audio, asks an LLM for a reply and speaks it back. No X API approval is needed, but it logs in with browser cookies.

## Install

```bash
npm install xspace-agent            # the SDK
npm create xspace-agent@latest      # scaffold a project (create-xspace-agent)
```

The CLI (`packages/cli`, bin `xspace-agent`) is not published to npm. From a clone of the repo run `pnpm install && pnpm build`, then `node packages/cli/bin/xspace-agent <command>`.

## Credentials (environment)

- `X_AUTH_TOKEN` and `X_CT0`: the `auth_token` and `ct0` cookies from a logged-in x.com browser session (preferred). Alternative: `X_USERNAME`, `X_PASSWORD`, `X_EMAIL` (may hit 2FA or CAPTCHA).
- One LLM key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY`. Voice providers use their own keys, for example `ELEVENLABS_API_KEY`.
- Never print or commit these values. Ask the user to export them in their shell.

## SDK

```ts
import { XSpaceAgent } from 'xspace-agent'

const agent = new XSpaceAgent({
  auth: { token: process.env.X_AUTH_TOKEN!, ct0: process.env.X_CT0! },
  ai: {
    provider: 'openai',            // 'openai' | 'claude' | 'groq' | 'gemini' | 'custom'
    apiKey: process.env.OPENAI_API_KEY!,
    systemPrompt: 'You are a concise, helpful panelist.',
  },
  voice: { provider: 'elevenlabs', voiceId: 'rachel' },   // optional TTS
  browser: { headless: true },
})

agent.on('transcription', ({ text, speaker }) => console.log(`${speaker}: ${text}`))
agent.on('response', ({ text }) => console.log(`Agent: ${text}`))
agent.on('space-ended', () => agent.destroy())

await agent.join('https://x.com/i/spaces/SPACE_ID')
```

Other methods on `XSpaceAgent`: `joinAsListener(url)`, `requestToSpeak()`, `say(text)`, `mute()`, `unmute()`, `leave()`, `destroy()`, `getStatus()`, `setSystemPrompt(prompt)`, `getConversationHistory()`, `getCostSummary()`. Events include `transcription`, `response`, `status`, `error`, `space-ended`.

Middleware hooks run at `before:stt`, `after:stt`, `before:llm`, `after:llm`, `before:tts`, `after:tts` via `agent.use(stage, handler)`; returning null aborts that step.

## CLI (from a clone)

```bash
node packages/cli/bin/xspace-agent init        # wizard, writes xspace.config.json
node packages/cli/bin/xspace-agent auth        # saves X credentials to .env
node packages/cli/bin/xspace-agent join <url> --provider openai [--listen-only]
node packages/cli/bin/xspace-agent start       # run the server with dashboard
node packages/cli/bin/xspace-agent dashboard
```

Global flags: `-c/--config <path>`, `-p/--port <n>`, `-v/--verbose`, `-q/--quiet`, `--no-headless`. `join` also takes `--browser managed|connect`, `--cdp-endpoint <url>` and `--cdp-port <n>`. The URL must contain `x.com/i/spaces/`.

## Notes

- Use `--listen-only` or `joinAsListener` first to confirm transcription before letting the agent speak.
- Only join Spaces where the host allows bots, and tell participants an AI is speaking.
