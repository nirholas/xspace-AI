// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 nirholas (https://github.com/nirholas/xspace-agent) [§69]

// =============================================================================
// Pipeline – Text-to-Speech Provider
// =============================================================================

import axios from 'axios'
import WebSocket, { type RawData } from 'ws'
import type { TTSProvider, ProviderMetrics } from './types'
import { getMetrics } from '../observability/metrics'
import { getAppLogger } from '../observability/logger'

/** Default OpenAI TTS voice mapping per agent index. */
const DEFAULT_OPENAI_VOICE_MAP: Record<number, string> = {
  0: 'onyx',
  1: 'nova',
}

/** Default ElevenLabs voice ID mapping per agent index. */
const DEFAULT_ELEVENLABS_VOICE_MAP: Record<number, string> = {
  0: 'VR6AewLTigWG4xSOukaG',
  1: 'TxGEqnHWrfWFTfGW9XjX',
}

/** Default Groq TTS voice mapping per agent index. */
const DEFAULT_GROQ_VOICE_MAP: Record<number, string> = {
  0: 'Charon-PlayAI',
  1: 'Zephyr-PlayAI',
}

/**
 * Default Google Cloud TTS voice mapping per agent index.
 * Studio voices are the highest-quality tier — near-human quality.
 * See https://cloud.google.com/text-to-speech/docs/voices for the full list.
 */
const DEFAULT_GOOGLE_VOICE_MAP: Record<number, string> = {
  0: 'en-US-Studio-O',  // Male Studio voice
  1: 'en-US-Studio-Q',  // Female Studio voice
}

/**
 * Default Gemini TTS voice mapping per agent index.
 * Prebuilt voices on the Generative Language API — see
 * https://ai.google.dev/gemini-api/docs/speech-generation for the full list.
 */
const DEFAULT_GEMINI_VOICE_MAP: Record<number, string> = {
  0: 'Kore',   // Firm, even-toned
  1: 'Puck',   // Upbeat
}

/**
 * Default 60db voice mapping per agent index.
 * Voice 0 is the 60db system default voice; voice 1 is the example voice from
 * their docs. Browse the full list at https://app.60db.ai → Voices.
 */
const DEFAULT_60DB_VOICE_MAP: Record<number, string> = {
  0: 'fbb75ed2-975a-40c7-9e06-38e30524a9a1',  // 60db system default voice
  1: '7911a3e8',                               // voice from the 60db docs
}

// Pricing per character
const TTS_PRICING: Record<string, number> = {
  'openai-tts': 0.000015,
  'elevenlabs-tts': 0.000030,
  'groq-tts': 0.000010,
  'google-tts': 0.000160,  // Studio voices — $160/1M chars
  'gemini-tts': 0.000010,  // gemini-2.5-flash-preview-tts, approx per output char
  '60db-tts': 0.00002,     // $0.00002 per character
}

/** Wrap raw signed 16-bit little-endian mono PCM in a RIFF/WAVE container. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)          // PCM subchunk size
  header.writeUInt16LE(1, 20)           // audio format = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}

export interface TTSConfig {
  provider: 'elevenlabs' | 'openai' | 'groq' | 'browser' | 'google' | 'gemini' | '60db'
  apiKey?: string
  /** Model override. Gemini only (default: 'gemini-2.5-flash-preview-tts'). */
  model?: string
  voiceId?: string
  speed?: number
  stability?: number
  /** Per-agent voice overrides. Keys are agent indices, values are voice IDs. */
  voiceMap?: Record<number, string>
  /** Fallback TTS configs tried in order if the primary provider fails. */
  fallback?: TTSConfig[]
}

function createTTSMetrics(): ProviderMetrics {
  return {
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    avgLatencyMs: 0,
    avgTimeToFirstTokenMs: 0,
  }
}

export function createTTS(config: TTSConfig): TTSProvider {
  const { provider, apiKey, stability = 0.5, voiceMap } = config

  if (provider === 'browser') {
    const metrics = createTTSMetrics()
    return {
      name: 'browser-tts',
      async synthesize(): Promise<Buffer | null> {
        // Browser-based TTS is handled client-side; server returns null.
        return null
      },
      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },
      estimateCost(): number {
        return 0
      },
      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        return { ok: true, latencyMs: 0 }
      },
    }
  }

  if (provider === 'elevenlabs') {
    const elVoiceMap: Record<number, string> = {
      ...DEFAULT_ELEVENLABS_VOICE_MAP,
      ...voiceMap,
    }
    const metrics = createTTSMetrics()
    const log = getAppLogger('tts')

    return {
      name: 'elevenlabs-tts',

      async synthesize(
        text: string,
        agentId: number = 0,
      ): Promise<Buffer | null> {
        if (!apiKey) return null
        const start = Date.now()

        const voiceId = elVoiceMap[agentId] || elVoiceMap[0]
        const m = getMetrics()
        const labels = { provider: 'elevenlabs' }

        try {
          const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability,
                similarity_boost: 0.8,
                style: 0.0,
                use_speaker_boost: true,
              },
            },
            {
              headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
              },
              responseType: 'arraybuffer',
            },
          )

          const latencyMs = Date.now() - start
          metrics.requestCount++
          metrics.successCount++
          metrics.avgLatencyMs =
            (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
          m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
          log.debug({ provider: 'elevenlabs', latencyMs, chars: text.length }, 'TTS synthesis completed')

          return Buffer.from(response.data)
        } catch (err) {
          metrics.requestCount++
          metrics.errorCount++
          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
          log.error({ err, provider: 'elevenlabs' }, 'TTS synthesis failed')
          throw err
        }
      },

      async *synthesizeStream(
        text: string,
        agentId: number = 0,
      ): AsyncIterable<Buffer> {
        if (!apiKey) return

        const voiceId = elVoiceMap[agentId] || elVoiceMap[0]

        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
          {
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability,
              similarity_boost: 0.8,
              style: 0.0,
              use_speaker_boost: true,
            },
          },
          {
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            responseType: 'stream',
          },
        )

        for await (const chunk of response.data) {
          yield Buffer.from(chunk)
        }
      },

      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },

      estimateCost(characterCount: number): number {
        return characterCount * (TTS_PRICING['elevenlabs-tts'] ?? 0)
      },

      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
          const res = await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': apiKey! },
            timeout: 5000,
          })
          return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
        } catch (err: any) {
          return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
        }
      },
    }
  }

  // provider === '60db'
  // 60db voice platform (https://60db.ai). synthesize() uses the JSON-over-HTTP
  // endpoint (base64 MP3 in a JSON envelope); synthesizeStream() drives the
  // WebSocket protocol (create_context → send_text → flush_context → chunks).
  if (provider === '60db') {
    const dbVoiceMap: Record<number, string> = {
      ...DEFAULT_60DB_VOICE_MAP,
      ...voiceMap,
    }
    const metrics = createTTSMetrics()
    const log = getAppLogger('tts')

    return {
      name: '60db-tts',

      async synthesize(
        text: string,
        agentId: number = 0,
      ): Promise<Buffer | null> {
        if (!apiKey) return null
        const start = Date.now()

        const voiceId = dbVoiceMap[agentId] || dbVoiceMap[0]
        const m = getMetrics()
        const labels = { provider: '60db' }

        try {
          const response = await axios.post(
            'https://api.60db.ai/tts-synthesize',
            {
              text,
              voice_id: voiceId,
              speed: config.speed ?? 1.0,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 30_000,
            },
          )

          const audioBase64: string | undefined = response.data?.audio_base64
          if (!audioBase64) {
            throw new Error('60db TTS returned no audio data')
          }

          const latencyMs = Date.now() - start
          metrics.requestCount++
          metrics.successCount++
          metrics.avgLatencyMs =
            (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
          m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
          log.debug({ provider: '60db', latencyMs, chars: text.length }, 'TTS synthesis completed')

          return Buffer.from(audioBase64, 'base64')
        } catch (err) {
          metrics.requestCount++
          metrics.errorCount++
          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
          log.error({ err, provider: '60db' }, 'TTS synthesis failed')
          throw err
        }
      },

      async *synthesizeStream(
        text: string,
        agentId: number = 0,
      ): AsyncIterable<Buffer> {
        if (!apiKey) return

        const voiceId = dbVoiceMap[agentId] || dbVoiceMap[0]
        // TLS — the API key travels in the query string, so never use plain ws://
        const ws = new WebSocket(
          `wss://api.60db.ai/ws/tts?apiKey=${encodeURIComponent(apiKey)}`,
        )
        const contextId = `xspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        /** Resolve on the first server frame matching `match`; reject on error. */
        const waitFor = (match: (data: any) => boolean, what: string): Promise<void> =>
          new Promise((resolve, reject) => {
            const onMessage = (raw: RawData): void => {
              try {
                const data = JSON.parse(String(raw))
                if (data.error) {
                  cleanup()
                  reject(new Error(data.error.message ?? `60db TTS ${what} failed`))
                } else if (match(data)) {
                  cleanup()
                  resolve()
                }
              } catch {
                // Ignore non-JSON frames
              }
            }
            const onError = (err: Error): void => {
              cleanup()
              reject(err)
            }
            const cleanup = (): void => {
              ws.off('message', onMessage)
              ws.off('error', onError)
            }
            ws.on('message', onMessage)
            ws.on('error', onError)
          })

        // Bridge WS frames into an async queue the generator can pull from.
        type StreamItem = Buffer | { error: Error } | { done: true }
        const queue: StreamItem[] = []
        let waiter: ((item: StreamItem) => void) | null = null
        const push = (item: StreamItem): void => {
          if (waiter) {
            const resolve = waiter
            waiter = null
            resolve(item)
          } else {
            queue.push(item)
          }
        }
        const next = (): Promise<StreamItem> =>
          queue.length > 0
            ? Promise.resolve(queue.shift()!)
            : new Promise((resolve) => {
                waiter = resolve
              })

        try {
          await new Promise<void>((resolve, reject) => {
            const onOpen = (): void => {
              cleanup()
              resolve()
            }
            const onError = (err: Error): void => {
              cleanup()
              reject(err)
            }
            const cleanup = (): void => {
              ws.off('open', onOpen)
              ws.off('error', onError)
            }
            ws.on('open', onOpen)
            ws.on('error', onError)
          })
          await waitFor((d) => !!d.connection_established, 'connection')

          ws.send(
            JSON.stringify({
              create_context: {
                context_id: contextId,
                voice_id: voiceId,
                audio_config: {
                  audio_encoding: 'LINEAR16',
                  sample_rate_hertz: 24_000,
                },
                speaking_rate: config.speed ?? 1.0,
              },
            }),
          )
          await waitFor((d) => !!d.context_created, 'context creation')

          ws.send(JSON.stringify({ send_text: { context_id: contextId, text } }))
          ws.send(JSON.stringify({ flush_context: { context_id: contextId } }))

          ws.on('message', (raw: RawData) => {
            try {
              const data = JSON.parse(String(raw))
              if (data.audio_chunk?.audioContent) {
                push(Buffer.from(data.audio_chunk.audioContent, 'base64'))
              } else if (data.flush_completed) {
                // Close the context so the server tears the session down.
                try {
                  ws.send(JSON.stringify({ close_context: { context_id: contextId } }))
                } catch {
                  // Socket may already be closing
                }
                push({ done: true })
              } else if (data.error) {
                push({ error: new Error(data.error.message ?? '60db TTS stream failed') })
              }
            } catch {
              // Ignore non-JSON frames
            }
          })
          ws.on('error', (err: Error) => push({ error: err }))
          ws.on('close', () => push({ done: true }))

          while (true) {
            const item = await next()
            if (Buffer.isBuffer(item)) {
              // Chunks are raw LINEAR16 PCM (24 kHz, mono, signed 16-bit LE)
              // and can be concatenated directly.
              yield item
            } else if ('error' in item) {
              throw item.error
            } else {
              break
            }
          }
        } finally {
          // Tear the socket down even if the consumer abandons iteration early.
          try {
            ws.close()
          } catch {
            // Already closed
          }
        }
      },

      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },

      estimateCost(characterCount: number): number {
        return characterCount * (TTS_PRICING['60db-tts'] ?? 0)
      },

      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
          const res = await axios.get('https://api.60db.ai/voices', {
            headers: { Authorization: `Bearer ${apiKey!}` },
            timeout: 5000,
          })
          return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
        } catch (err: any) {
          return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
        }
      },
    }
  }

  // provider === 'google'
  if (provider === 'google') {
    const googleVoiceMap: Record<number, string> = {
      ...DEFAULT_GOOGLE_VOICE_MAP,
      ...voiceMap,
    }
    const metrics = createTTSMetrics()
    const log = getAppLogger('tts')

    return {
      name: 'google-tts',

      async synthesize(text: string, agentId: number = 0): Promise<Buffer | null> {
        if (!apiKey) return null
        const start = Date.now()

        const voiceName = googleVoiceMap[agentId] ?? googleVoiceMap[0]
        // Derive languageCode from voice name (e.g. 'en-US-Studio-O' → 'en-US')
        const languageCode = voiceName.split('-').slice(0, 2).join('-')
        const m = getMetrics()
        const labels = { provider: 'google' }

        try {
          const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
            {
              input: { text },
              voice: { languageCode, name: voiceName },
              audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: config.speed ?? 1.0,
                pitch: 0.0,
              },
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30_000,
            },
          )

          const latencyMs = Date.now() - start
          metrics.requestCount++
          metrics.successCount++
          metrics.avgLatencyMs =
            (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
          m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
          log.debug({ provider: 'google', voiceName, latencyMs, chars: text.length }, 'TTS synthesis completed')

          const audioContent: string = response.data.audioContent
          return Buffer.from(audioContent, 'base64')
        } catch (err) {
          metrics.requestCount++
          metrics.errorCount++
          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
          log.error({ err, provider: 'google' }, 'TTS synthesis failed')
          throw err
        }
      },

      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },

      estimateCost(characterCount: number): number {
        return characterCount * (TTS_PRICING['google-tts'] ?? 0)
      },

      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
          const res = await axios.get(
            `https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(apiKey!)}`,
            { timeout: 5_000 },
          )
          return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
        } catch (err: any) {
          return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
        }
      },
    }
  }

  // provider === 'gemini'
  // Uses the Generative Language API (generativelanguage.googleapis.com), which an
  // AI Studio key can reach directly. Unlike 'google', this needs no GCP project,
  // no OAuth, and no Cloud Text-to-Speech API enablement.
  if (provider === 'gemini') {
    const geminiVoiceMap: Record<number, string> = {
      ...DEFAULT_GEMINI_VOICE_MAP,
      ...voiceMap,
    }
    const model = config.model || 'gemini-2.5-flash-preview-tts'
    const metrics = createTTSMetrics()
    const log = getAppLogger('tts')

    return {
      name: 'gemini-tts',

      async synthesize(text: string, agentId: number = 0): Promise<Buffer | null> {
        if (!apiKey) return null
        const start = Date.now()

        const voiceName = geminiVoiceMap[agentId] ?? geminiVoiceMap[0]
        const m = getMetrics()
        const labels = { provider: 'gemini' }

        try {
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              contents: [{ parts: [{ text }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                },
              },
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 60_000,
            },
          )

          const part = response.data?.candidates?.[0]?.content?.parts?.find(
            (p: any) => p?.inlineData?.data,
          )
          if (!part) {
            throw new Error('Gemini TTS returned no audio data')
          }

          const latencyMs = Date.now() - start
          metrics.requestCount++
          metrics.successCount++
          metrics.avgLatencyMs =
            (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
          m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
          log.debug({ provider: 'gemini', voiceName, latencyMs, chars: text.length }, 'TTS synthesis completed')

          // Gemini returns raw signed 16-bit PCM (mimeType 'audio/L16;codec=pcm;rate=24000').
          // injectAudio() decodes via the browser's decodeAudioData, which needs a
          // container — so wrap the PCM in a WAV header before handing it back.
          const pcm = Buffer.from(part.inlineData.data, 'base64')
          const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType ?? '')
          const sampleRate = rateMatch ? Number(rateMatch[1]) : 24_000
          return pcmToWav(pcm, sampleRate)
        } catch (err) {
          metrics.requestCount++
          metrics.errorCount++
          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
          log.error({ err, provider: 'gemini' }, 'TTS synthesis failed')
          throw err
        }
      },

      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },

      estimateCost(characterCount: number): number {
        return characterCount * (TTS_PRICING['gemini-tts'] ?? 0)
      },

      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
          const res = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey!)}`,
            { timeout: 5_000 },
          )
          return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
        } catch (err: any) {
          return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
        }
      },
    }
  }

  // provider === 'groq'
  if (provider === 'groq') {
    const groqVoiceMap: Record<number, string> = {
      ...DEFAULT_GROQ_VOICE_MAP,
      ...voiceMap,
    }
    const metrics = createTTSMetrics()
    const log = getAppLogger('tts')

    return {
      name: 'groq-tts',

      async synthesize(
        text: string,
        agentId: number = 0,
      ): Promise<Buffer | null> {
        if (!apiKey) return null
        const start = Date.now()

        const voice = groqVoiceMap[agentId] || 'Charon-PlayAI'
        const m = getMetrics()
        const labels = { provider: 'groq' }

        try {
          const response = await axios.post(
            'https://api.groq.com/openai/v1/audio/speech',
            {
              model: 'playai-tts',
              input: text,
              voice,
              response_format: 'mp3',
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              responseType: 'arraybuffer',
            },
          )

          const latencyMs = Date.now() - start
          metrics.requestCount++
          metrics.successCount++
          metrics.avgLatencyMs =
            (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
          m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
          log.debug({ provider: 'groq', latencyMs, chars: text.length }, 'TTS synthesis completed')

          return Buffer.from(response.data)
        } catch (err) {
          metrics.requestCount++
          metrics.errorCount++
          m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
          m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
          log.error({ err, provider: 'groq' }, 'TTS synthesis failed')
          throw err
        }
      },

      getMetrics(): ProviderMetrics {
        return { ...metrics }
      },

      estimateCost(characterCount: number): number {
        return characterCount * (TTS_PRICING['groq-tts'] ?? 0)
      },

      async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
          const res = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 5000,
          })
          return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
        } catch (err: any) {
          return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
        }
      },
    }
  }

  // provider === 'openai'
  const oaiVoiceMap: Record<number, string> = {
    ...DEFAULT_OPENAI_VOICE_MAP,
    ...voiceMap,
  }
  const metrics = createTTSMetrics()
  const log = getAppLogger('tts')

  return {
    name: 'openai-tts',

    async synthesize(
      text: string,
      agentId: number = 0,
    ): Promise<Buffer | null> {
      if (!apiKey) return null
      const start = Date.now()

      const voice = oaiVoiceMap[agentId] || 'alloy'
      const m = getMetrics()
      const labels = { provider: 'openai' }

      try {
        const response = await axios.post(
          'https://api.openai.com/v1/audio/speech',
          {
            model: 'tts-1',
            input: text,
            voice,
            response_format: 'mp3',
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
          },
        )

        const latencyMs = Date.now() - start
        metrics.requestCount++
        metrics.successCount++
        metrics.avgLatencyMs =
          (metrics.avgLatencyMs * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount

        m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
        m.histogram('xspace_tts_latency_ms', latencyMs, 'TTS request latency', labels)
        m.histogram('xspace_tts_characters', text.length, 'Characters synthesized', labels)
        log.debug({ provider: 'openai', latencyMs, chars: text.length }, 'TTS synthesis completed')

        return Buffer.from(response.data)
      } catch (err) {
        metrics.requestCount++
        metrics.errorCount++
        m.counter('xspace_tts_requests_total', 'Total TTS requests', labels)
        m.counter('xspace_tts_errors_total', 'TTS request errors', labels)
        log.error({ err, provider: 'openai' }, 'TTS synthesis failed')
        throw err
      }
    },

    getMetrics(): ProviderMetrics {
      return { ...metrics }
    },

    estimateCost(characterCount: number): number {
      return characterCount * (TTS_PRICING['openai-tts'] ?? 0)
    },

    async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
      const start = Date.now()
      try {
        const res = await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 5000,
        })
        return { ok: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start }
      } catch (err: any) {
        return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
      }
    },
  }
}

/**
 * Creates a TTS provider with automatic fallback.
 * If the primary provider fails, each fallback is tried in order.
 */
export function createTTSWithFallback(config: TTSConfig): TTSProvider {
  const fallbackConfigs = config.fallback
  if (!fallbackConfigs || fallbackConfigs.length === 0) {
    return createTTS(config)
  }

  const primary = createTTS({ ...config, fallback: undefined })
  const fallbacks = fallbackConfigs.map((fc) => createTTS({ ...fc, fallback: undefined }))
  const all = [primary, ...fallbacks]
  const log = getAppLogger('tts')

  return {
    name: `${primary.name}+fallback`,

    async synthesize(text: string, agentId?: number): Promise<Buffer | null> {
      for (let i = 0; i < all.length; i++) {
        const provider = all[i]
        try {
          const result = await provider.synthesize(text, agentId)
          if (result !== null) {
            if (i > 0) {
              log.warn({ provider: provider.name, attempt: i + 1 }, 'TTS succeeded on fallback provider')
            }
            return result
          }
        } catch (err) {
          log.warn(
            { err, provider: provider.name, attempt: i + 1, remaining: all.length - i - 1 },
            'TTS provider failed, trying next fallback',
          )
        }
      }
      // All providers exhausted
      log.error({ providers: all.map((p) => p.name) }, 'All TTS providers failed')
      throw new Error(`All TTS providers failed: ${all.map((p) => p.name).join(' → ')}`)
    },

    async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
      return primary.checkHealth()
    },

    getMetrics(): ProviderMetrics {
      return primary.getMetrics()
    },

    estimateCost(characterCount: number): number {
      return primary.estimateCost(characterCount)
    },
  }
}


