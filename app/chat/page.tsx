'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/AuthProvider'
import { db, storage } from '@/lib/firebaseClient'
import { extractTextFromFile } from '@/lib/pdfText'
import { buildTaskFromChat, buildTaskFromDocument } from '@/lib/tasks'
import type { ChatMessage, DocumentType, ExtractedDocument, Household, Person, Task } from '@/lib/types'

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  insurance_policy: 'Insurance',
  bill: 'Bill',
  licence: 'Licence',
  identity_document: 'Identity',
  property_document: 'Property',
  employment_document: 'Employment',
  other: 'Other',
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [inputText, setInputText] = useState('')
  const [thinking, setThinking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    async function loadData() {
      try {
        const q = query(collection(db, 'households'), where('ownerId', '==', user!.uid), limit(1))
        const snapshot = await getDocs(q)

        if (snapshot.empty) {
          router.replace('/onboarding')
          return
        }

        const householdDoc = snapshot.docs[0]
        const rawHousehold = householdDoc.data() as Omit<Household, 'id'>
        const householdData: Household = {
          id: householdDoc.id,
          ...rawHousehold,
          telegramLinkCode: rawHousehold.telegramLinkCode ?? null,
          telegramChatId: rawHousehold.telegramChatId ?? null,
        }
        setHousehold(householdData)

        const [peopleSnap, messagesSnap] = await Promise.all([
          getDocs(collection(db, 'households', householdData.id, 'people')),
          getDocs(query(collection(db, 'households', householdData.id, 'chatMessages'), orderBy('createdAt', 'asc'))),
        ])

        setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
        setMessages(messagesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })))
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this page.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  // Live-listen on the household doc so the moment the Telegram bot links a
  // chat (a background process, not this browser session), the "Connected"
  // state shows up here without needing a manual refresh.
  useEffect(() => {
    if (!household) return
    const unsubscribe = onSnapshot(doc(db, 'households', household.id), (snap) => {
      const data = snap.data() as Omit<Household, 'id'> | undefined
      if (!data) return
      setHousehold((prev) => (prev ? { ...prev, telegramChatId: data.telegramChatId ?? null, telegramLinkCode: data.telegramLinkCode ?? null } : prev))
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function handleGenerateLinkCode() {
    if (!household) return
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    await updateDoc(doc(db, 'households', household.id), { telegramLinkCode: code })
    setHousehold((prev) => (prev ? { ...prev, telegramLinkCode: code } : prev))
  }

  async function handleDisconnectTelegram() {
    if (!household) return
    await updateDoc(doc(db, 'households', household.id), { telegramChatId: null, telegramLinkCode: null })
    setHousehold((prev) => (prev ? { ...prev, telegramChatId: null, telegramLinkCode: null } : prev))
  }

  async function appendMessage(role: ChatMessage['role'], text: string, inputKind: ChatMessage['inputKind']) {
    if (!household) return
    const fields = { role, text, inputKind, createdAt: Date.now() }
    const ref = await addDoc(collection(db, 'households', household.id, 'chatMessages'), {
      ...fields,
      createdAt: serverTimestamp(),
    })
    setMessages((prev) => [...prev, { id: ref.id, ...fields }])
  }

  function findPerson(name: string | null): Person | undefined {
    if (!name) return undefined
    return people.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() || p.name.toLowerCase().includes(name.toLowerCase())
    )
  }

  async function handleSendText() {
    const text = inputText.trim()
    if (!text || !household || thinking) return
    setInputText('')
    await appendMessage('user', text, 'text')
    setThinking(true)

    try {
      const response = await fetch('/api/chat-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, existingPeopleNames: people.map((p) => p.name) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not process that message.')

      const matchedPerson = findPerson(data.personName)

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
        await addDoc(collection(db, 'households', household.id, 'tasks'), {
          ...taskFields,
          createdAt: serverTimestamp(),
        })
        await appendMessage(
          'agent',
          `Got it — added a task: "${taskFields.title}"${
            taskFields.assignedPersonName ? ` (assigned to ${taskFields.assignedPersonName})` : ''
          }. View it in Tasks.`,
          'text'
        )
      } else {
        const noteFields = {
          text: data.summary ?? text,
          personId: matchedPerson?.id ?? null,
          personName: matchedPerson?.name ?? data.personName ?? null,
          source: 'chat' as const,
        }
        await addDoc(collection(db, 'households', household.id, 'notes'), {
          ...noteFields,
          createdAt: serverTimestamp(),
        })
        await appendMessage(
          'agent',
          `Noted${noteFields.personName ? ` for ${noteFields.personName}` : ''} — nothing pending, so no task needed. Got a receipt or PDF for this? Drop it here and I'll file it properly.`,
          'text'
        )
      }
    } catch (err: any) {
      await appendMessage('agent', `Sorry, I couldn't process that: ${err?.message ?? 'something went wrong.'}`, 'text')
    } finally {
      setThinking(false)
    }
  }

  async function handleSendFile(file: File) {
    if (!household || thinking) return
    await appendMessage('user', `📎 ${file.name}`, 'file')
    setThinking(true)

    try {
      const text = await extractTextFromFile(file)
      const response = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, existingPeopleNames: people.map((p) => p.name) }),
      })
      const extracted = await response.json()
      if (!response.ok) throw new Error(extracted.error ?? 'Extraction failed.')

      const matchedPerson = findPerson(extracted.linkedPersonName)
      const storagePath = `households/${household.id}/documents/${Date.now()}-${file.name}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file)
      const fileUrl = await getDownloadURL(storageRef)

      const documentType: DocumentType = extracted.documentType ?? 'other'
      const docFields = {
        fileName: file.name,
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
      const docRef = await addDoc(collection(db, 'households', household.id, 'documents'), {
        ...docFields,
        uploadedAt: serverTimestamp(),
      })
      const newDoc: ExtractedDocument = { id: docRef.id, ...docFields, uploadedAt: Date.now() }

      let taskNote = ''
      if (newDoc.actionRequired) {
        const taskFields = buildTaskFromDocument(newDoc, people)
        await addDoc(collection(db, 'households', household.id, 'tasks'), {
          ...taskFields,
          createdAt: serverTimestamp(),
        })
        taskNote = ` I've also added a task: "${taskFields.title}".`
      }

      await appendMessage(
        'agent',
        `Filed as ${DOCUMENT_TYPE_LABELS[documentType]}${matchedPerson ? ` → ${matchedPerson.name}` : ''}. ${newDoc.summary}${taskNote}`,
        'text'
      )
    } catch (err: any) {
      await appendMessage('agent', `Sorry, I couldn't process that file: ${err?.message ?? 'something went wrong.'}`, 'text')
    } finally {
      setThinking(false)
    }
  }

  if (loading || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tether Agent</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        Type what happened, or drop a PDF — I'll file it and tell you what I did.
      </p>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        {household?.telegramChatId ? (
          <div className="flex items-center justify-between">
            <span className="text-emerald-700">✓ Connected to Telegram — message @tether_direct_bot anytime.</span>
            <button onClick={handleDisconnectTelegram} className="text-slate-400 underline hover:text-slate-600">
              Disconnect
            </button>
          </div>
        ) : household?.telegramLinkCode ? (
          <p className="text-slate-600">
            Message <span className="font-medium">@tether_direct_bot</span> on Telegram with the code{' '}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-medium">{household.telegramLinkCode}</span>{' '}
            to connect.
          </p>
        ) : (
          <button onClick={handleGenerateLinkCode} className="text-slate-600 underline hover:text-slate-900">
            Connect Telegram →
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Try: &ldquo;Kai went to the doctor today, bill was $120&rdquo; or drop a PDF below.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400">Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleSendFile(file)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={thinking}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Attach a PDF or text file"
        >
          📎
        </button>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendText()
            }
          }}
          placeholder="Message the agent…"
          rows={1}
          className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          onClick={handleSendText}
          disabled={thinking || !inputText.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </main>
  )
}
