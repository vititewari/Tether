'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, query, where, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/AuthProvider'
import { db, storage } from '@/lib/firebaseClient'
import { extractTextFromFile } from '@/lib/pdfText'
import type { Household, Person, ExtractedDocument, DocumentType } from '@/lib/types'

type UploadStage = 'idle' | 'reading' | 'classifying' | 'saving' | 'done' | 'error'

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  insurance_policy: 'Insurance',
  bill: 'Bill',
  licence: 'Licence',
  identity_document: 'Identity',
  property_document: 'Property',
  employment_document: 'Employment',
  other: 'Other',
}

export default function DocumentsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [documents, setDocuments] = useState<ExtractedDocument[]>([])
  const [loading, setLoading] = useState(true)

  const [stage, setStage] = useState<UploadStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ExtractedDocument | null>(null)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    async function loadData() {
      const q = query(collection(db, 'households'), where('ownerId', '==', user!.uid), limit(1))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        router.replace('/onboarding')
        return
      }

      const householdDoc = snapshot.docs[0]
      const householdData: Household = {
        id: householdDoc.id,
        ...(householdDoc.data() as Omit<Household, 'id'>),
      }
      setHousehold(householdData)

      const [peopleSnap, docsSnap] = await Promise.all([
        getDocs(collection(db, 'households', householdData.id, 'people')),
        getDocs(collection(db, 'households', householdData.id, 'documents')),
      ])

      setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
      setDocuments(
        docsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExtractedDocument, 'id'>) }))
      )
      setLoading(false)
    }

    loadData()
  }, [user, authLoading, router])

  async function handleFile(file: File) {
    if (!household) return
    setError(null)
    setLastResult(null)

    try {
      setStage('reading')
      const text = await extractTextFromFile(file)

      setStage('classifying')
      const response = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          existingPeopleNames: people.map((p) => p.name),
        }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Extraction failed.')
      }

      const extracted = await response.json()

      const matchedPerson = people.find(
        (p) =>
          extracted.linkedPersonName &&
          (p.name.toLowerCase().includes(extracted.linkedPersonName.toLowerCase()) ||
            extracted.linkedPersonName.toLowerCase().includes(p.name.toLowerCase()))
      )

      setStage('saving')
      const storagePath = `households/${household.id}/documents/${Date.now()}-${file.name}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file)

      const docRef = await addDoc(collection(db, 'households', household.id, 'documents'), {
        fileName: file.name,
        storagePath,
        documentType: extracted.documentType ?? 'other',
        summary: extracted.summary ?? '',
        linkedPersonId: matchedPerson?.id ?? null,
        linkedPersonName: extracted.linkedPersonName ?? null,
        renewalDate: extracted.renewalDate ?? null,
        actionRequired: Boolean(extracted.actionRequired),
        actionDescription: extracted.actionDescription ?? null,
        uploadedAt: serverTimestamp(),
      })

      const newDoc: ExtractedDocument = {
        id: docRef.id,
        fileName: file.name,
        storagePath,
        documentType: extracted.documentType ?? 'other',
        summary: extracted.summary ?? '',
        linkedPersonId: matchedPerson?.id ?? null,
        linkedPersonName: extracted.linkedPersonName ?? null,
        renewalDate: extracted.renewalDate ?? null,
        actionRequired: Boolean(extracted.actionRequired),
        actionDescription: extracted.actionDescription ?? null,
        uploadedAt: Date.now(),
      }

      setDocuments((prev) => [newDoc, ...prev])
      setLastResult(newDoc)
      setStage('done')
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.')
      setStage('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function personName(personId: string | null): string | null {
    return people.find((p) => p.id === personId)?.name ?? null
  }

  if (loading || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Smart Upload</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mb-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragActive ? 'border-slate-500 bg-slate-50' : 'border-slate-300'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <p className="font-medium text-slate-700">Drop anything here</p>
        <p className="mt-1 text-sm text-slate-500">or click to choose a PDF or .txt file</p>
      </label>

      {stage !== 'idle' && stage !== 'done' && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {stage === 'reading' && 'Reading document…'}
          {stage === 'classifying' && 'Classifying and extracting details…'}
          {stage === 'saving' && 'Filing document…'}
          {stage === 'error' && (
            <span className="text-red-600">{error ?? 'Something went wrong.'}</span>
          )}
        </div>
      )}

      {stage === 'done' && lastResult && (
        <div className="mb-8 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">
            ✓ {DOCUMENT_TYPE_LABELS[lastResult.documentType]}
            {personName(lastResult.linkedPersonId) && ` → ${personName(lastResult.linkedPersonId)}`}
          </p>
          <p className="text-emerald-800">{lastResult.summary}</p>
          {!lastResult.linkedPersonId && lastResult.linkedPersonName && (
            <p className="text-amber-700">
              Mentions &ldquo;{lastResult.linkedPersonName}&rdquo; — no exact match in your family
              graph, filed under the household instead.
            </p>
          )}
          {lastResult.actionRequired && (
            <p className="text-emerald-800">
              🔔 Action needed: {lastResult.actionDescription}
              {lastResult.renewalDate && ` (by ${lastResult.renewalDate})`}
            </p>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-500">All documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{doc.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {DOCUMENT_TYPE_LABELS[doc.documentType]}
                    {personName(doc.linkedPersonId) && ` · ${personName(doc.linkedPersonId)}`}
                    {doc.renewalDate && ` · due ${doc.renewalDate}`}
                  </p>
                </div>
                {doc.actionRequired && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    Action needed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}