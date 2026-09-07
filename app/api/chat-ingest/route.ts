import { NextRequest, NextResponse } from 'next/server'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { RESPONSIBILITY_OPTIONS } from '@/lib/types'
import { resolveRelativeDate } from '@/lib/relativeDate'

// Server-side only, same reasoning as extract-document/route.ts — AWS
// credentials never reach the browser.
//
// This is the classification step behind the chat/voice-note ingestion
// channel: "Kai went to the doctor today, bill was $120" gets turned into
// structured fields. The model NEVER decides whether something becomes a
// task on its own authority beyond flagging actionNeeded from the text
// itself — the page then applies deterministic logic (lib/tasks.ts) to
// actually create the Task or Note record.

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
})

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

interface ChatIngestRequestBody {
  text: string
  existingPeopleNames: string[]
}

export async function POST(req: NextRequest) {
  let body: ChatIngestRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { text, existingPeopleNames } = body

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'No message provided.' }, { status: 400 })
  }

  const systemPrompt = `You classify a short casual message a household member sent about something that happened — an event, an expense, a reminder. Respond with ONLY a JSON object — no preamble, no markdown fences.

The JSON must have exactly this shape:
{
  "personName": the full name of the person the message is about, chosen from this list if there's a reasonable match: ${JSON.stringify(existingPeopleNames)}. If no one in the list matches, extract whatever name is mentioned in the message itself, or null if none is mentioned.
  "summary": a one-sentence plain-English summary of what the message says,
  "actionNeeded": true ONLY if the message itself implies something still needs to be done in the future (pay a bill, renew something, follow up, submit something, respond to someone) — false if it's purely informational about something that already happened, with nothing pending,
  "actionDescription": if actionNeeded is true, a short imperative phrase describing the action (e.g. "Pay doctor's bill — Kai"); otherwise null,
  "responsibility": if actionNeeded is true, which single category this falls under, chosen from exactly this list: ${JSON.stringify(RESPONSIBILITY_OPTIONS)} — pick the closest match (e.g. a medical bill is "healthcare admin"), or null if none fit,
  "dueDate": an ISO date string (YYYY-MM-DD) ONLY if the message explicitly mentions a date or a resolvable relative date (e.g. "by Friday") — otherwise null. Never invent a date that isn't implied by the text.
}

Do not invent any fact not present in the message — if the message doesn't mention an amount, a date, or a specific action, leave those fields null/false rather than guessing. If the message names a relative date (e.g. "Friday", "next week"), resolve it against today's date given below; otherwise leave dueDate null.`

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt = `Today's date: ${today}\nMessage: "${text.trim()}"`

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { temperature: 0, maxTokens: 400 },
    })

    const response = await client.send(command)
    const rawText = response.output?.message?.content?.[0]?.text ?? ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    // Override the model's own date arithmetic with a deterministic
    // resolution whenever the message names something we can compute exactly
    // (weekday, "tomorrow", "today") — LLMs get this wrong often enough
    // (verified: "by Friday" asked on a Thursday came back as Saturday) that
    // it isn't worth trusting for a value that ends up as a task's due date.
    const resolvedDate = resolveRelativeDate(text)
    if (resolvedDate) parsed.dueDate = resolvedDate

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Bedrock chat ingest failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Could not process that message. Check your AWS credentials and region.' },
      { status: 500 }
    )
  }
}
