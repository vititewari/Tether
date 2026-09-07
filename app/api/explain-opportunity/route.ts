import { NextRequest, NextResponse } from 'next/server'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

// Server-side only, same reasoning as extract-document/route.ts — AWS
// credentials never reach the browser.
//
// IMPORTANT: eligibility has ALREADY been decided deterministically by
// lib/matching.ts before this route is ever called. The model's only job is
// to phrase *why* a match already found is relevant, in plain English — it
// is never asked to judge eligibility, and the prompt below deliberately
// gives it no ability to do so (no eligibility rules are even included).

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
})

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

interface ExplainRequestBody {
  schemeName: string
  benefit: string
  matchedPersonName: string | null
  householdName: string
}

export async function POST(req: NextRequest) {
  let body: ExplainRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { schemeName, benefit, matchedPersonName, householdName } = body

  if (!schemeName || typeof schemeName !== 'string') {
    return NextResponse.json({ error: 'Missing scheme name.' }, { status: 400 })
  }

  const systemPrompt = `You write a single short, plain-English sentence explaining why a Singapore government scheme might be relevant to a household. A separate rules engine has ALREADY determined this household matches — your only job is to phrase that in a friendly, concrete way.

You are given only a scheme name, a benefit description, a household name, and optionally a matched family member's name — nothing else about that person or household. Do NOT state or imply any specific fact about them (age, birth year, income, employment, family size, eligibility tier, etc.) that isn't literally given to you here — even a plausible-sounding one. If the benefit text describes multiple tiers or conditions (e.g. "$600, or $800 for seniors"), describe the benefit generally without asserting which tier applies to this person. Do not add caveats about eligibility, do not second-guess the match, do not mention documents or application steps. Respond with ONLY the sentence — no preamble, no quotes, no markdown.`

  const userPrompt = `Scheme: ${schemeName}
Benefit: ${benefit}
Household: ${householdName}
${matchedPersonName ? `Matched family member: ${matchedPersonName}` : 'Matched at the household level.'}

Write the one-sentence explanation.`

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { temperature: 0.3, maxTokens: 150 },
    })

    const response = await client.send(command)
    const text = response.output?.message?.content?.[0]?.text?.trim() ?? ''

    return NextResponse.json({ explanation: text })
  } catch (err: any) {
    console.error('Bedrock explanation failed:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Explanation failed. Check your AWS credentials and region.' },
      { status: 500 }
    )
  }
}
