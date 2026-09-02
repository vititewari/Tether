import { NextRequest, NextResponse } from 'next/server'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

// This runs server-side only. AWS credentials never reach the browser —
// that's the whole reason this is a separate API route instead of a direct
// client-side call, the same way Bedrock calls were scoped in the
// architecture discussion.

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    sessionToken: process.env.AWS_SESSION_TOKEN, // required for sandbox/temporary credentials
  },
})

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

const DOCUMENT_TYPES = [
  'insurance_policy',
  'bill',
  'licence',
  'identity_document',
  'property_document',
  'employment_document',
  'other',
]

interface ExtractRequestBody {
  text: string
  existingPeopleNames: string[]
}

export async function POST(req: NextRequest) {
  let body: ExtractRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { text, existingPeopleNames } = body

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'No document text provided.' }, { status: 400 })
  }

  // Truncate very long documents to keep this fast/cheap — a few thousand
  // characters is plenty for classification purposes.
  const truncatedText = text.slice(0, 8000)

  const systemPrompt = `You are a document classification assistant for a family administration app.
Given the raw text of an uploaded document, extract structured information and respond with ONLY a JSON object — no preamble, no markdown fences, no explanation.

The JSON must have exactly this shape:
{
  "documentType": one of ${JSON.stringify(DOCUMENT_TYPES)},
  "summary": a one-sentence plain-English summary of what this document is,
  "linkedPersonName": the full name of the person this document most likely belongs to, chosen from this list if there's a reasonable match: ${JSON.stringify(existingPeopleNames)}. If no person in the list matches, still extract the name mentioned in the document itself (or null if none is mentioned).
  "renewalDate": an ISO date string (YYYY-MM-DD) if the document mentions a renewal, expiry, or due date, otherwise null,
  "actionRequired": true if this document implies the household needs to do something (renew, pay, respond, submit), otherwise false,
  "actionDescription": a short phrase describing the required action if actionRequired is true, otherwise null
}`

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: [{ text: `Document text:\n\n${truncatedText}` }],
        },
      ],
      inferenceConfig: { temperature: 0, maxTokens: 500 },
    })

    const response = await client.send(command)
    const rawText = response.output?.message?.content?.[0]?.text ?? ''

    const cleaned = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Bedrock extraction failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Extraction failed. Check your AWS credentials and region.' },
      { status: 500 }
    )
  }
}