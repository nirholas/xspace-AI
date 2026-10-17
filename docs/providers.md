# AI Providers — Complete Reference

## Provider System

The X Space agents use a pluggable provider system. Set `AI_PROVIDER` env var to choose:

| AI_PROVIDER value | File | Type | How it works |
|---|---|---|---|
| `openai` (default) | `openai-realtime.js` | `webrtc` | OpenAI Realtime API via WebRTC sessions |
| `openai-chat` | `openai-chat.js` | `socket` | OpenAI Chat Completions (streaming) |
| `groq` | `groq.js` | `socket` | Groq API with Llama 3.3 70B (streaming) |
| `claude` | `claude.js` | `socket` | Anthropic Claude (streaming) |

### Two Provider Types

**`webrtc`** — Audio goes directly between browser and OpenAI. The server only creates sessions. Each agent page (agent1.html/agent2.html) establishes a WebRTC peer connection to OpenAI's Realtime API. Audio is processed entirely client-side.

**`socket`** — Audio goes through the server pipeline: Browser mic → base64 audio → server → STT → text → LLM → text → TTS → audio → browser. This is the flow used for Claude, Groq, and OpenAI Chat.

---

## providers/index.js — Factory (17 lines)

- Reads `AI_PROVIDER` env var (default: "openai")
- Returns the matching provider module
- Exports `createProvider()` function and `AI_PROVIDER` string

---

## providers/openai-realtime.js (27 lines)

**Type:** `webrtc`

**`createSession(agentId, prompts, voices)`**
- POST to `https://api.openai.com/v1/realtime/sessions`
- Body: model, modalities (audio+text), voice, instructions (system prompt)
- Returns session data with `client_secret` for WebRTC auth
- Model: `OPENAI_REALTIME_MODEL` env var or `gpt-4o-realtime-preview-2024-12-17`

No conversation history management — the Realtime API handles it via the persistent WebRTC session.

---

## providers/openai-chat.js (73 lines)

**Type:** `socket`

- Model: `OPENAI_MODEL` env var or `gpt-4o-mini`
- Maintains per-agent conversation history (max 20 messages)
- Uses streaming chat completions
- `streamResponse(agentId, userText, systemPrompt)`: async generator that yields text deltas
- `clearHistory(agentId)`: reset conversation for an agent
- Parses SSE stream manually (data: lines → JSON → delta.content)

---

## providers/groq.js (74 lines)

**Type:** `socket`

Identical structure to openai-chat.js but:
- API endpoint: `https://api.groq.com/openai/v1/chat/completions`
- API key: `GROQ_API_KEY`
- Model: `GROQ_MODEL` env var or `llama-3.3-70b-versatile`

---

## providers/claude.js (49 lines)

**Type:** `socket`

- Uses `@anthropic-ai/sdk` (official Anthropic SDK)
- API key: `ANTHROPIC_API_KEY`
- Model: `CLAUDE_MODEL` env var or `claude-sonnet-4-20250514`
- Uses `client.messages.stream()` for native streaming
- Parses `content_block_delta` events with `text_delta` type
- Same per-agent history management (max 20)

---

## providers/stt.js — Speech-to-Text (36 lines)

Supports two backends:
- `STT_PROVIDER=groq` (default): Groq's Whisper Large V3
- `STT_PROVIDER=openai`: OpenAI's Whisper-1

**`transcribe(audioBuffer, mimeType)`**
- Creates FormData with audio file
- Posts to the appropriate API endpoint
- Returns `{ text: "transcribed text" }`

---

## providers/tts.js — Text-to-Speech (68 lines)

Supports three backends:
- `TTS_PROVIDER=elevenlabs`: ElevenLabs Multilingual V2
- `TTS_PROVIDER=openai`: OpenAI TTS-1
- `TTS_PROVIDER=browser`: No server-side TTS (browser's speechSynthesis)

Auto-detected: if ELEVENLABS_API_KEY exists → elevenlabs, else if OPENAI_API_KEY → openai, else → browser.

**`synthesize(text, agentId)`**
- ElevenLabs: Uses per-agent voice IDs from `ELEVENLABS_VOICE_0` / `ELEVENLABS_VOICE_1` env vars
- OpenAI: Uses hardcoded voice map (agent 0 = "onyx", agent 1 = "nova")
- Returns MP3 Buffer or null (for browser fallback)

---

## 60db TTS — packages/core provider (`packages/core/src/pipeline/tts.ts`)

The 60db voice platform (https://60db.ai) is implemented in the SDK provider factory
alongside ElevenLabs. Select it with `voice.provider: '60db'` / `TTS_PROVIDER=60db` +
`SIXTYDB_API_KEY` (get a key at app.60db.ai → Settings → Developer → API Keys).

**`synthesize(text, agentId)`** — `POST https://api.60db.ai/tts-synthesize`
- Bearer auth; body `{ text, voice_id, speed }` (max 5000 chars)
- Response JSON envelope `{ audio_base64, sample_rate, output_format }` — decoded
  to an MP3 Buffer before returning (same contract as ElevenLabs)

**`synthesizeStream(text, agentId)`** — 60db TTS WebSocket, `wss://api.60db.ai/ws/tts?apiKey=...`
- Full protocol driven per call: `create_context` → `send_text` → `flush_context`
  → `audio_chunk`* → `flush_completed` → `close_context`
- Requests LINEAR16 @ 24 kHz — yielded chunks are raw PCM (mono, signed 16-bit LE)
  and can be concatenated directly
- Socket is torn down in a `finally` block, so abandoning iteration early is safe

**Voices** — per-agent voice map like other providers. Defaults:
- agent 0: `fbb75ed2-975a-40c7-9e06-38e30524a9a1` (60db system default)
- agent 1: `7911a3e8` (docs example voice)
- Browse the full list at app.60db.ai → Voices, or `GET https://api.60db.ai/voices`

**`checkHealth()`** — `GET https://api.60db.ai/voices` (Bearer auth, 5s timeout)

**Cost** — `$0.00002` per character (`estimateCost()`; `TTS_PRICING['60db-tts']`)

---

## Provider Data Flow Comparison

### WebRTC Flow (OpenAI Realtime):
```
User speaks in X Space
  → Space WebRTC audio → User's speaker
  → (No server involvement for audio processing)
  → agent page captures via RTCPeerConnection hook
  → OpenAI Realtime processes directly
  → Response audio comes back via same WebRTC connection
```

### Socket Flow (Claude/Groq/OpenAI Chat):
```
User speaks in X Space
  → audio-bridge captures via RTCPeerConnection hook
  → PCM chunks → Node.js via page.exposeFunction()
  → VAD detects silence → pcmChunksToWav()
  → stt.transcribe(wavBuffer) → text
  → provider.streamResponse(agentId, text, prompt) → response text
  → tts.synthesize(responseText) → MP3 buffer
  → audio-bridge.injectAudio(page, mp3Buffer) → plays in Space
```


