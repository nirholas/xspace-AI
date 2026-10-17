// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 nirholas (https://github.com/nirholas/xspace-agent) [§32]

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTTS } from '../../../src/pipeline/tts'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

// Fake 60db TTS WebSocket server: auto-plays the server side of the protocol
// (open → connection_established → context_created → chunks → flush_completed).
vi.mock('ws', () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = []
    url: string
    sent: string[] = []
    private listeners: Record<string, Array<(...args: any[]) => void>> = {}

    constructor(url: string) {
      this.url = url
      FakeWebSocket.instances.push(this)
      queueMicrotask(() => {
        this.emit('open')
        // Nested microtask so the client can attach its message listener
        // after the open promise resolves, before the greeting frame arrives.
        queueMicrotask(() => {
          this.emit(
            'message',
            JSON.stringify({
              connection_established: { service: 'tts', user_id: 1, credit_balance: 9.97 },
            }),
          )
        })
      })
    }

    on(event: string, cb: (...args: any[]) => void): void {
      ;(this.listeners[event] ??= []).push(cb)
    }

    off(event: string, cb: (...args: any[]) => void): void {
      this.listeners[event] = (this.listeners[event] ?? []).filter((f) => f !== cb)
    }

    send(data: string): void {
      this.sent.push(data)
      const msg = JSON.parse(data)
      if (msg.create_context) {
        queueMicrotask(() => {
          this.emit(
            'message',
            JSON.stringify({ context_created: { context_id: msg.create_context.context_id } }),
          )
        })
      } else if (msg.flush_context) {
        queueMicrotask(() => {
          this.emit(
            'message',
            JSON.stringify({
              audio_chunk: {
                context_id: msg.flush_context.context_id,
                audioContent: Buffer.from('chunk-a').toString('base64'),
              },
            }),
          )
          this.emit(
            'message',
            JSON.stringify({
              audio_chunk: {
                context_id: msg.flush_context.context_id,
                audioContent: Buffer.from('chunk-b').toString('base64'),
              },
            }),
          )
          this.emit(
            'message',
            JSON.stringify({ flush_completed: { context_id: msg.flush_context.context_id } }),
          )
        })
      } else if (msg.close_context) {
        queueMicrotask(() => {
          this.emit('message', JSON.stringify({ context_closed: { context_id: msg.close_context.context_id } }))
          this.emit('close')
        })
      }
    }

    close(): void {
      /* connection teardown handled via close_context */
    }

    emit(event: string, ...args: any[]): void {
      ;(this.listeners[event] ?? []).forEach((cb) => cb(...args))
    }
  }

  return { default: FakeWebSocket }
})

import axios from 'axios'

describe('createTTS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('browser provider', () => {
    it('should return null for browser TTS', async () => {
      const tts = createTTS({ provider: 'browser' })
      const result = await tts.synthesize('Hello')
      expect(result).toBeNull()
    })
  })

  describe('OpenAI provider', () => {
    it('should call OpenAI API', async () => {
      const mockAudio = Buffer.from('fake-audio-data')
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: mockAudio })

      const tts = createTTS({ provider: 'openai', apiKey: 'test-key' })
      const result = await tts.synthesize('Hello world')

      expect(result).toBeInstanceOf(Buffer)
      expect(mockPost).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          model: 'tts-1',
          input: 'Hello world',
          voice: 'onyx',
          response_format: 'mp3',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
      )
    })

    it('should return null without API key', async () => {
      const tts = createTTS({ provider: 'openai' })
      const result = await tts.synthesize('Hello')
      expect(result).toBeNull()
    })

    it('should use per-agent voice mapping', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: Buffer.from('audio') })

      const tts = createTTS({
        provider: 'openai',
        apiKey: 'key',
        voiceMap: { 0: 'echo', 1: 'fable' },
      })

      await tts.synthesize('Hello', 0)
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ voice: 'echo' }),
        expect.anything(),
      )

      await tts.synthesize('Hello', 1)
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ voice: 'fable' }),
        expect.anything(),
      )
    })

    it('should fall back to alloy for unknown agent IDs', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: Buffer.from('audio') })

      const tts = createTTS({ provider: 'openai', apiKey: 'key' })
      await tts.synthesize('Hello', 99)

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ voice: 'alloy' }),
        expect.anything(),
      )
    })
  })

  describe('ElevenLabs provider', () => {
    it('should call ElevenLabs API', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: Buffer.from('audio') })

      const tts = createTTS({ provider: 'elevenlabs', apiKey: 'el-key' })
      const result = await tts.synthesize('Hello')

      expect(result).toBeInstanceOf(Buffer)
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('api.elevenlabs.io'),
        expect.objectContaining({
          text: 'Hello',
          model_id: 'eleven_multilingual_v2',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'xi-api-key': 'el-key',
          }),
        }),
      )
    })

    it('should return null without API key', async () => {
      const tts = createTTS({ provider: 'elevenlabs' })
      const result = await tts.synthesize('Hello')
      expect(result).toBeNull()
    })

    it('should use custom voice map for ElevenLabs', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: Buffer.from('audio') })

      const tts = createTTS({
        provider: 'elevenlabs',
        apiKey: 'key',
        voiceMap: { 0: 'custom-voice-id' },
      })

      await tts.synthesize('Hello', 0)
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('custom-voice-id'),
        expect.anything(),
        expect.anything(),
      )
    })
  })

  describe('60db provider', () => {
    it('should call 60db API and decode base64 audio', async () => {
      const mockPost = vi.mocked(axios.post)
      const audio = Buffer.from('fake-60db-audio')
      mockPost.mockResolvedValue({
        data: {
          success: true,
          audio_base64: audio.toString('base64'),
          sample_rate: 24000,
          duration_seconds: 1.2,
          encoding: 'mp3',
          output_format: 'mp3',
        },
      })

      const tts = createTTS({ provider: '60db', apiKey: '60db-key' })
      const result = await tts.synthesize('Hello world')

      expect(result).toEqual(audio)
      expect(mockPost).toHaveBeenCalledWith(
        'https://api.60db.ai/tts-synthesize',
        expect.objectContaining({
          text: 'Hello world',
          voice_id: 'fbb75ed2-975a-40c7-9e06-38e30524a9a1',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer 60db-key',
          }),
        }),
      )
    })

    it('should return null without API key', async () => {
      const tts = createTTS({ provider: '60db' })
      const result = await tts.synthesize('Hello')
      expect(result).toBeNull()
    })

    it('should use per-agent voice mapping', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({
        data: { success: true, audio_base64: Buffer.from('audio').toString('base64') },
      })

      const tts = createTTS({
        provider: '60db',
        apiKey: 'key',
        voiceMap: { 0: 'voice-zero', 1: 'voice-one' },
      })

      await tts.synthesize('Hello', 0)
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ voice_id: 'voice-zero' }),
        expect.anything(),
      )

      await tts.synthesize('Hello', 1)
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ voice_id: 'voice-one' }),
        expect.anything(),
      )
    })

    it('should throw when 60db returns no audio data', async () => {
      const mockPost = vi.mocked(axios.post)
      mockPost.mockResolvedValue({ data: { success: false, message: 'boom' } })

      const tts = createTTS({ provider: '60db', apiKey: 'key' })
      await expect(tts.synthesize('Hello')).rejects.toThrow('60db TTS returned no audio data')
    })

    it('should stream audio chunks over WebSocket', async () => {
      const { default: FakeWebSocket } = await import('ws')

      const tts = createTTS({ provider: '60db', apiKey: '60db-key' })
      const chunks: Buffer[] = []
      for await (const chunk of tts.synthesizeStream!('Hello streaming', 0)) {
        chunks.push(chunk)
      }

      expect(chunks.map((c) => c.toString())).toEqual(['chunk-a', 'chunk-b'])

      const socket = (FakeWebSocket as any).instances.at(-1) as any
      expect(socket.url).toBe('wss://api.60db.ai/ws/tts?apiKey=60db-key')

      const sent = socket.sent.map((s: string) => JSON.parse(s))
      expect(
        sent.some(
          (m: any) => m.create_context?.voice_id === 'fbb75ed2-975a-40c7-9e06-38e30524a9a1',
        ),
      ).toBe(true)
      expect(sent.some((m: any) => m.send_text?.text === 'Hello streaming')).toBe(true)
      expect(sent.some((m: any) => m.flush_context)).toBe(true)
      expect(sent.some((m: any) => m.close_context)).toBe(true)
    })
  })
})


