// Telegram ingestion channel — long-polls the Bot API (no public URL needed,
// unlike webhooks) and mirrors the exact web-chat pipeline in
// app/chat/page.tsx: classify via /api/chat-ingest, then apply the SAME
// deterministic task/note logic from lib/tasks.ts. Runs as a standalone
// process using the Firebase Admin SDK, since it has to write to a household
// on a user's behalf without their browser open.
//
// Run with: npm run telegram-bot
// Requires: TELEGRAM_BOT_TOKEN (.env.local), FIREBASE_SERVICE_ACCOUNT_PATH
// (path to a downloaded service account JSON — see README), and the Next.js
// dev server running (this script calls its /api/chat-ingest route).

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { PDFParse } from 'pdf-parse'
import { buildTaskFromChat, buildTaskFromDocument } from '../lib/tasks'
import type { DocumentType, Person } from '../lib/types'

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  insurance_policy: 'Insurance',
  bill: 'Bill',
  licence: 'Licence',
  identity_document: 'Identity',
  property_document: 'Property',
  employment_document: 'Employment',
  other: 'Other',
}

// .env.local isn't auto-loaded outside of Next.js — parse it manually.
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env.local')
  process.exit(1)
}
if (!SERVICE_ACCOUNT_PATH || !existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Missing or invalid FIREBASE_SERVICE_ACCOUNT_PATH — set it in .env.local to the downloaded service account JSON file path.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
initializeApp({ credential: cert(serviceAccount), storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET })
const db = getFirestore()
const bucket = getStorage().bucket()

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

async function tg(method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

async function sendMessage(chatId: number | string, text: string) {
  await tg('sendMessage', { chat_id: String(chatId), text })
}

interface HouseholdDoc {
  id: string
  name: string
  telegramChatId: string | null
  telegramLinkCode: string | null
}

async function findHouseholdByChatId(chatId: number): Promise<HouseholdDoc | null> {
  const snap = await db.collection('households').where('telegramChatId', '==', String(chatId)).limit(1).get()
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as any) }
}

async function findHouseholdByLinkCode(code: string): Promise<HouseholdDoc | null> {
  const snap = await db.collection('households').where('telegramLinkCode', '==', code).limit(1).get()
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as any) }
}

async function getPeople(householdId: string): Promise<Person[]> {
  const snap = await db.collection('households').doc(householdId).collection('people').get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Person[]
}

async function appendChatMessage(householdId: string, role: 'user' | 'agent', text: string, inputKind: 'text' | 'file') {
  await db
    .collection('households')
    .doc(householdId)
    .collection('chatMessages')
    .add({ role, text, inputKind, createdAt: FieldValue.serverTimestamp() })
}

async function handleTextMessage(household: HouseholdDoc, text: string) {
  await appendChatMessage(household.id, 'user', text, 'text')
  const people = await getPeople(household.id)

  const res = await fetch(`${APP_URL}/api/chat-ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, existingPeopleNames: people.map((p) => p.name) }),
  })
  const data = await res.json()

  let reply: string
  if (!res.ok) {
    reply = `Sorry, I couldn't process that: ${data.error ?? 'unknown error'}`
  } else {
    const matchedPerson = data.personName
      ? people.find(
          (p) =>
            p.name.toLowerCase() === data.personName.toLowerCase() ||
            p.name.toLowerCase().includes(data.personName.toLowerCase())
        )
      : undefined

    if (data.actionNeeded) {
      const taskFields = buildTaskFromChat(
        {
          actionDescription: data.actionDescription ?? data.summary ?? text,
          personName: matchedPerson?.name ?? data.personName ?? null,
          responsibility: data.responsibility ?? null,
          dueDate: data.dueDate ?? null,
        },
        people
      )
      await db
        .collection('households')
        .doc(household.id)
        .collection('tasks')
        .add({ ...taskFields, createdAt: FieldValue.serverTimestamp() })
      reply = `Got it — added a task: "${taskFields.title}"${
        taskFields.assignedPersonName ? ` (assigned to ${taskFields.assignedPersonName})` : ''
      }.`
    } else {
      const noteFields = {
        text: data.summary ?? text,
        personId: matchedPerson?.id ?? null,
        personName: matchedPerson?.name ?? data.personName ?? null,
        source: 'chat' as const,
      }
      await db
        .collection('households')
        .doc(household.id)
        .collection('notes')
        .add({ ...noteFields, createdAt: FieldValue.serverTimestamp() })
      reply = `Noted${noteFields.personName ? ` for ${noteFields.personName}` : ''} — nothing pending, so no task needed. Got a receipt or PDF? Send it here and I'll file it.`
    }
  }

  await sendMessage(household.telegramChatId!, reply)
  await appendChatMessage(household.id, 'agent', reply, 'text')
}

async function handleDocumentMessage(household: HouseholdDoc, chatId: number, fileId: string, fileName: string) {
  await appendChatMessage(household.id, 'user', `📎 ${fileName}`, 'file')
  const people = await getPeople(household.id)

  try {
    const fileInfo = await tg('getFile', { file_id: fileId })
    const filePath = fileInfo.result?.file_path
    if (!filePath) throw new Error('Telegram could not provide this file.')
    const fileRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer())

    const lowerName = fileName.toLowerCase()
    let text: string
    let contentType: string
    if (lowerName.endsWith('.pdf')) {
      const parser = new PDFParse({ data: fileBuffer })
      const result = await parser.getText()
      text = result.text
      contentType = 'application/pdf'
    } else if (lowerName.endsWith('.txt')) {
      text = fileBuffer.toString('utf8')
      contentType = 'text/plain'
    } else {
      const reply = `Sorry, I can only read PDF and .txt files right now (got "${fileName}").`
      await sendMessage(chatId, reply)
      await appendChatMessage(household.id, 'agent', reply, 'text')
      return
    }

    const extractRes = await fetch(`${APP_URL}/api/extract-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, existingPeopleNames: people.map((p) => p.name) }),
    })
    const extracted = await extractRes.json()
    if (!extractRes.ok) throw new Error(extracted.error ?? 'Extraction failed.')

    const matchedPerson = extracted.linkedPersonName
      ? people.find(
          (p) =>
            p.name.toLowerCase() === extracted.linkedPersonName.toLowerCase() ||
            p.name.toLowerCase().includes(extracted.linkedPersonName.toLowerCase())
        )
      : undefined

    // Upload the actual file — set a download token by hand so the resulting
    // URL matches Firebase's own convention (the same shape getDownloadURL()
    // produces client-side), since the Admin SDK doesn't do this for you.
    const storagePath = `households/${household.id}/documents/${Date.now()}-${fileName}`
    const token = randomUUID()
    await bucket.file(storagePath).save(fileBuffer, {
      metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
    })
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`

    const documentType: DocumentType = extracted.documentType ?? 'other'
    const docFields = {
      fileName,
      storagePath,
      fileUrl,
      documentType,
      summary: extracted.summary ?? '',
      linkedPersonId: matchedPerson?.id ?? null,
      linkedPersonName: extracted.linkedPersonName ?? null,
      renewalDate: extracted.renewalDate ?? null,
      actionRequired: Boolean(extracted.actionRequired),
      actionDescription: extracted.actionDescription ?? null,
    }
    const docRef = await db
      .collection('households')
      .doc(household.id)
      .collection('documents')
      .add({ ...docFields, uploadedAt: FieldValue.serverTimestamp() })

    let taskNote = ''
    if (docFields.actionRequired) {
      const taskFields = buildTaskFromDocument({ id: docRef.id, ...docFields, uploadedAt: Date.now() }, people)
      await db
        .collection('households')
        .doc(household.id)
        .collection('tasks')
        .add({ ...taskFields, createdAt: FieldValue.serverTimestamp() })
      taskNote = ` I've also added a task: "${taskFields.title}".`
    }

    const reply = `Filed as ${DOCUMENT_TYPE_LABELS[documentType]}${matchedPerson ? ` → ${matchedPerson.name}` : ''}. ${docFields.summary}${taskNote}`
    await sendMessage(chatId, reply)
    await appendChatMessage(household.id, 'agent', reply, 'text')
  } catch (err: any) {
    console.error('Document handling error:', err)
    const reply = `Sorry, I couldn't process that file: ${err?.message ?? 'something went wrong.'}`
    await sendMessage(chatId, reply)
    await appendChatMessage(household.id, 'agent', reply, 'text')
  }
}

let offset = 0

async function poll() {
  const res = await tg('getUpdates', { offset, timeout: 25 })
  if (!res.ok) return

  for (const update of res.result) {
    offset = update.update_id + 1
    const msg = update.message
    if (!msg) continue
    const chatId: number = msg.chat.id
    const text: string | undefined = msg.text?.trim()

    const household = await findHouseholdByChatId(chatId)

    if (!household) {
      if (text) {
        const candidate = await findHouseholdByLinkCode(text.toUpperCase())
        if (candidate) {
          await db.collection('households').doc(candidate.id).update({ telegramChatId: String(chatId) })
          await sendMessage(
            chatId,
            `✅ Connected to ${candidate.name}! Tell me things like "Kai went to the doctor today, bill was $120" and I'll file it.`
          )
          continue
        }
      }
      await sendMessage(chatId, 'Hi! Get your link code from the Chat page in the Tether app and send it to me here to connect.')
      continue
    }

    if (msg.document) {
      try {
        await handleDocumentMessage(household, chatId, msg.document.file_id, msg.document.file_name ?? 'document')
      } catch (err) {
        console.error('Error handling document:', err)
        await sendMessage(chatId, 'Sorry, something went wrong processing that file — please try again.')
      }
      continue
    }

    if (text) {
      try {
        await handleTextMessage(household, text)
      } catch (err) {
        console.error('Error handling message:', err)
        await sendMessage(chatId, 'Sorry, something went wrong processing that — please try again.')
      }
    }
  }
}

async function main() {
  console.log('Telegram bot polling started. Waiting for messages...')
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await poll()
    } catch (err) {
      console.error('Poll error:', err)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

main()
