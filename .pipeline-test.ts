import 'dotenv/config'
import { writeFileSync } from 'fs'
import { createSTT } from '/workspaces/xspace-AI/packages/core/src/pipeline/stt'
import { createLLM } from '/workspaces/xspace-AI/packages/core/src/pipeline/llm'
import { createTTSWithFallback } from '/workspaces/xspace-AI/packages/core/src/pipeline/tts'

const key = process.env.GOOGLE_API_KEY!

async function main() {
  const tts = createTTSWithFallback({
    provider: 'gemini',
    apiKey: key,
    model: process.env.TTS_MODEL,
  })
  const stt = createSTT({ provider: 'gemini', apiKey: key, model: process.env.STT_MODEL })
  const llm = createLLM({ provider: 'gemini', apiKey: key, model: process.env.GEMINI_MODEL })

  // 1. Health
  console.log('--- health ---')
  console.log('tts:', await tts.checkHealth())
  console.log('stt:', await stt.checkHealth())

  // 2. Synthesize a question as if a human in the Space asked it
  const question = 'Hey, quick question for you: what actually is an X Space?'
  console.log('\n--- TTS (simulating a speaker) ---')
  let t0 = Date.now()
  const spoken = await tts.synthesize(question, 0)
  console.log(`bytes=${spoken?.length} latency=${Date.now() - t0}ms`)
  if (!spoken) throw new Error('TTS returned null')
  writeFileSync('/tmp/claude-1000/-workspaces-xspace-AI/474427ea-8e64-4af2-b50f-b2370635f597/scratchpad/question.wav', spoken)

  // 3. Transcribe it back — this is the real STT path
  console.log('\n--- STT ---')
  t0 = Date.now()
  const { text } = await stt.transcribe(spoken, 'audio/wav')
  console.log(`latency=${Date.now() - t0}ms text="${text}"`)

  // 4. LLM answers it
  console.log('\n--- LLM (streaming) ---')
  t0 = Date.now()
  let answer = ''
  let firstTokenMs = 0
  for await (const chunk of llm.streamResponse(0, text || question, process.env.SYSTEM_PROMPT!)) {
    if (!firstTokenMs) firstTokenMs = Date.now() - t0
    answer += chunk
  }
  console.log(`ttft=${firstTokenMs}ms total=${Date.now() - t0}ms`)
  console.log(`answer="${answer}"`)

  // 5. Speak the answer
  console.log('\n--- TTS (agent reply) ---')
  t0 = Date.now()
  const reply = await tts.synthesize(answer, 0)
  console.log(`bytes=${reply?.length} latency=${Date.now() - t0}ms`)
  writeFileSync('/tmp/claude-1000/-workspaces-xspace-AI/474427ea-8e64-4af2-b50f-b2370635f597/scratchpad/reply.wav', reply!)

  console.log('\nFULL LOOP OK')
}

main().catch((e) => {
  console.error('FAILED:', e?.response?.data ?? e)
  process.exit(1)
})
