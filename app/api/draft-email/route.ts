import { NextRequest, NextResponse } from 'next/server'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

// Server-side only, same reasoning as extract-document/route.ts — AWS
// credentials never reach the browser.
//
// This route drafts an email for the USER to review and send themselves —
// nothing is ever sent on their behalf (see components/ActionCardModal.tsx,
// which opens the user's own mail client with this draft loaded). The model
// is only ever given facts the user already entered into their own family
// graph; it is explicitly forbidden from inventing anything else, and must
// leave a bracketed placeholder for any detail it wasn't given.

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
})

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

interface DraftEmailRequestBody {
  purpose: string // e.g. "Applying for MOE Financial Assistance Scheme (FAS)"
  recipientType: string // e.g. "the school's financial assistance office"
  benefitOrTaskDescription: string
  facts: Array<{ label: string; value: string }>
}

export async function POST(req: NextRequest) {
  let body: DraftEmailRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { purpose, recipientType, benefitOrTaskDescription, facts } = body

  if (!purpose || typeof purpose !== 'string') {
    return NextResponse.json({ error: 'Missing purpose.' }, { status: 400 })
  }

  const factLines = (facts ?? []).map((f) => `- ${f.label}: ${f.value}`).join('\n') || '(none on file)'

  const systemPrompt = `You draft a single professional email for a Singapore household to send about a government scheme application or a household admin task. The user will review and personally send this themselves — you are not sending anything.

STRICT RULES:
1. Use ONLY the facts listed under "Facts on file" below. Do not state or imply any other specific fact (names, dates, amounts, policy numbers, school names, addresses, reference numbers) even if plausible.
2. For any detail a complete email would need but that isn't in the facts list, insert a clearly bracketed placeholder, e.g. [child's school name], [policy number], [your address] — never guess a value.
3. Address it generically: "Dear Sir/Madam," or "To Whom It May Concern," — never invent a recipient's name.
4. Do not claim the recipient has already confirmed anything, and do not promise an outcome — this is a request or notification, not a confirmation of eligibility or approval.
5. Keep it concise and professional — 3-6 short paragraphs at most.
6. Respond with ONLY a JSON object: {"subject": "...", "body": "..."} — no markdown fences, no preamble, no explanation outside the JSON.`

  const userPrompt = `Purpose: ${purpose}
Recipient: ${recipientType}
Context: ${benefitOrTaskDescription}

Facts on file:
${factLines}

Draft the email now.`

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { temperature: 0.3, maxTokens: 800 },
    })

    const response = await client.send(command)
    const rawText = response.output?.message?.content?.[0]?.text ?? ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
      throw new Error('Unexpected response shape from model.')
    }

    return NextResponse.json({ subject: parsed.subject, body: parsed.body })
  } catch (err: any) {
    console.error('Bedrock email draft failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Draft failed. Check your AWS credentials and region.' },
      { status: 500 }
    )
  }
}
