#!/usr/bin/env npx tsx
// Join an X Space with a Gemini-powered agent — LLM, STT, and TTS all run on a
// single Google AI Studio key via the Generative Language API.
//
//   npx tsx run-gemini-agent.ts https://x.com/i/spaces/SPACE_ID
//
// Set HEADLESS=false to watch the browser.

import 'dotenv/config'
import { XSpaceAgent } from './packages/core/src/index'

const rawUrl = process.argv[2]
if (!rawUrl) {
  console.error('Usage: npx tsx run-gemini-agent.ts <space-url>')
  process.exit(1)
}
// Strip tracking params (?s=20) — the join flow wants the bare Space URL.
const spaceUrl = rawUrl.split('?')[0]

const googleKey = process.env.GOOGLE_API_KEY
if (!googleKey) {
  console.error('Error: GOOGLE_API_KEY is not set in .env')
  process.exit(1)
}
if (!process.env.X_AUTH_TOKEN) {
  console.error('Error: X_AUTH_TOKEN is not set in .env')
  process.exit(1)
}

const agent = new XSpaceAgent({
  auth: { token: process.env.X_AUTH_TOKEN, ct0: process.env.X_CT0 },
  ai: {
    provider: 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    apiKey: googleKey,
    systemPrompt: process.env.SYSTEM_PROMPT!,
  },
  transcription: {
    provider: 'gemini',
    apiKey: googleKey,
    model: process.env.STT_MODEL,
  },
  // Voice: prefer OpenAI TTS (returns MP3, the injection path's native format)
  // when a key is present, and fall back to Gemini otherwise / on failure.
  voice: process.env.OPENAI_API_KEY
    ? {
        provider: 'openai' as const,
        apiKey: process.env.OPENAI_API_KEY,
        voiceId: process.env.OPENAI_TTS_VOICE || 'onyx',
        fallback: [
          {
            provider: 'gemini' as const,
            apiKey: googleKey,
            model: process.env.TTS_MODEL,
            voiceId: process.env.TTS_VOICE,
          },
        ],
      }
    : {
        provider: 'gemini' as const,
        apiKey: googleKey,
        model: process.env.TTS_MODEL,
        voiceId: process.env.TTS_VOICE,
      },
  browser: {
    mode: 'managed',
    headless: process.env.HEADLESS !== 'false',
  },
  behavior: {
    silenceThreshold: parseFloat(process.env.SILENCE_THRESHOLD || '1.5'),
    turnDelay: parseInt(process.env.TURN_DELAY || '1500', 10),
  },
})

agent.on('status', (s) => console.log(`[status] ${s}`))
agent.on('transcription', (e: any) => console.log(`[heard ${e.speaker || '?'}] ${e.text}`))
agent.on('response', (e: any) => console.log(`[said] ${e.text}`))
agent.on('error', (e: any) => console.error('[error]', e?.message ?? e))
agent.on('space-ended', () => {
  console.log('[space ended]')
  process.exit(0)
})

async function shutdown() {
  console.log('\nLeaving Space...')
  await agent.leave().catch(() => {})
  await agent.destroy().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

import { readFileSync, existsSync, writeFileSync } from 'fs'

const OPENING = process.env.OPENING_LINE ||
  "Hey everyone, glad to be up here. Big shout to Denzel Cocker — I'm genuinely bullish on $THREE and what the team's building. Happy to get into why. And just so it's clear, I'm an AI agent, not a person."

const SAY_FILE = '/workspaces/xspace-AI/.say.txt'

async function main() {
  console.log(`Joining: ${spaceUrl}`)
  await agent.join(spaceUrl)
  console.log('Joined. Listening...')

  // Give the host a moment to accept the speaker request, then open with the
  // Cocker / $THREE line. say() unmutes and injects the audio itself.
  setTimeout(() => {
    console.log('[opening]', OPENING)
    agent.say(OPENING).catch((e) => console.error('[say failed]', e?.message ?? e))
  }, 8000)

  // Live talking-point channel: write a line to .say.txt and the agent speaks it.
  writeFileSync(SAY_FILE, '')
  setInterval(async () => {
    try {
      if (!existsSync(SAY_FILE)) return
      const line = readFileSync(SAY_FILE, 'utf8').trim()
      if (!line) return
      writeFileSync(SAY_FILE, '')
      console.log('[say]', line)
      await agent.say(line)
    } catch (e: any) {
      console.error('[say loop]', e?.message ?? e)
    }
  }, 2000)
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err)
  if (err?.hint) console.error('hint:', err.hint)
  process.exit(1)
})
