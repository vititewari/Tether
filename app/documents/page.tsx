'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  addDoc,
  deleteDoc,
  doc as firestoreDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { useAuth } from '@/lib/AuthProvider'
import { db, storage } from '@/lib/firebaseClient'
import { extractTextFromFile } from '@/lib/pdfText'
import { assignmentReason, buildTaskFromDocument } from '@/lib/tasks'
import type { Household, Person, ExtractedDocument, DocumentType, Task } from '@/lib/types'
import TaskAssignedModal from '@/components/TaskAssignedModal'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [stage, setStage] = useState<UploadStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [taskWarning, setTaskWarning] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ExtractedDocument | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)
  const [assignedPopup, setAssignedPopup] = useState<{ task: Task; reason: string } | null>(null)

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
        const householdData: Household = {
          id: householdDoc.id,
          ...(householdDoc.data() as Omit<Household, 'id'>),
        }
        setHousehold(householdData)

        const [peopleSnap, docsSnap, tasksSnap] = await Promise.all([
          getDocs(collection(db, 'households', householdData.id, 'people')),
          getDocs(collection(db, 'households', householdData.id, 'documents')),
          getDocs(collection(db, 'households', householdData.id, 'tasks')),
        ])

        setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
        setDocuments(
          docsSnap.docs.map((d) => {
            const raw = d.data() as Omit<ExtractedDocument, 'id'>
            return { id: d.id, ...raw, fileUrl: raw.fileUrl ?? null }
          })
        )
        setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })))
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this page.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  async function handleFile(file: File) {
    if (!household) return
    setError(null)
    setTaskWarning(null)
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
      const fileUrl = await getDownloadURL(storageRef)

      const docRef = await addDoc(collection(db, 'households', household.id, 'documents'), {
        fileName: file.name,
        storagePath,
        fileUrl,
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
        fileUrl,
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

      // Task creation is best-effort and separate from the try/catch above —
      // a hiccup here (e.g. a permissions issue) shouldn't make an otherwise
      // successful upload look like it failed.
      if (newDoc.actionRequired) {
        try {
          const taskFields = buildTaskFromDocument(newDoc, people)
          const taskRef = await addDoc(collection(db, 'households', household.id, 'tasks'), {
            ...taskFields,
            createdAt: serverTimestamp(),
          })
          const newTask: Task = { id: taskRef.id, ...taskFields, createdAt: Date.now() }
          setTasks((prev) => [...prev, newTask])
          const assignee = people.find((p) => p.id === newTask.assignedPersonId) ?? null
          setAssignedPopup({ task: newTask, reason: assignmentReason(newDoc.documentType, assignee) })
        } catch {
          setTaskWarning(
            `"${newDoc.fileName}" uploaded, but the task couldn't be created automatically — use "Add to Tasks" below.`
          )
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.')
      setStage('error')
    }
  }

  function taskForDocument(documentId: string): Task | undefined {
    return tasks.find((t) => t.sourceDocumentId === documentId)
  }

  async function handleCreateTaskFor(document: ExtractedDocument) {
    if (!household) return
    setBusyDocId(document.id)
    try {
      const taskFields = buildTaskFromDocument(document, people)
      const taskRef = await addDoc(collection(db, 'households', household.id, 'tasks'), {
        ...taskFields,
        createdAt: serverTimestamp(),
      })
      const newTask: Task = { id: taskRef.id, ...taskFields, createdAt: Date.now() }
      setTasks((prev) => [...prev, newTask])
      const assignee = people.find((p) => p.id === newTask.assignedPersonId) ?? null
      setAssignedPopup({ task: newTask, reason: assignmentReason(document.documentType, assignee) })
    } catch (err: any) {
      setError(err?.message ?? 'Could not create a task for this document.')
    } finally {
      setBusyDocId(null)
    }
  }

  async function handleChangePopupAssignee(personId: string) {
    if (!household || !assignedPopup) return
    const name = personId ? people.find((p) => p.id === personId)?.name ?? null : null
    const taskId = assignedPopup.task.id
    setAssignedPopup((prev) =>
      prev ? { ...prev, task: { ...prev.task, assignedPersonId: personId || null, assignedPersonName: name } } : prev
    )
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, assignedPersonId: personId || null, assignedPersonName: name } : t))
    )
    try {
      await updateDoc(firestoreDoc(db, 'households', household.id, 'tasks', taskId), {
        assignedPersonId: personId || null,
        assignedPersonName: name,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Could not update the assignee.')
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

  async function handleView(document: ExtractedDocument) {
    if (document.fileUrl) {
      window.open(document.fileUrl, '_blank', 'noopener,noreferrer')
      return
    }
    // Older documents uploaded before fileUrl was captured — fetch it now.
    setBusyDocId(document.id)
    try {
      const url = await getDownloadURL(ref(storage, document.storagePath))
      setDocuments((prev) => prev.map((d) => (d.id === document.id ? { ...d, fileUrl: url } : d)))
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Could not open this file — it may have been removed from storage.')
    } finally {
      setBusyDocId(null)
    }
  }

  async function handleDelete(document: ExtractedDocument) {
    if (!household) return
    if (!window.confirm(`Delete "${document.fileName}"? This can't be undone.`)) return

    setBusyDocId(document.id)
    try {
      await deleteObject(ref(storage, document.storagePath)).catch(() => {
        // File may already be gone from storage — still remove the record.
      })
      await deleteDoc(firestoreDoc(db, 'households', household.id, 'documents', document.id))
      setDocuments((prev) => prev.filter((d) => d.id !== document.id))
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete this document.')
    } finally {
      setBusyDocId(null)
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
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      </main>
    )
  }

  const needsActionCount = documents.filter((d) => {
    if (!d.actionRequired) return false
    const task = taskForDocument(d.id)
    return !task || task.status === 'open'
  }).length

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Smart Upload</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      {needsActionCount > 0 && (
        <Link
          href="/tasks"
          className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
        >
          <span>
            🔔 {needsActionCount} document{needsActionCount > 1 ? 's' : ''} need{needsActionCount === 1 ? 's' : ''}{' '}
            action
          </span>
          <span className="font-medium underline">View Tasks →</span>
        </Link>
      )}

      {taskWarning && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {taskWarning}
        </div>
      )}

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
              {lastResult.renewalDate && ` (by ${lastResult.renewalDate})`} —{' '}
              <Link href="/tasks" className="underline">
                added to Tasks
              </Link>
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
            {documents.map((docItem) => (
              <div
                key={docItem.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <button
                    onClick={() => handleView(docItem)}
                    disabled={busyDocId === docItem.id}
                    className="truncate text-left text-sm font-medium text-slate-900 hover:underline disabled:opacity-50"
                    title={docItem.fileName}
                  >
                    {docItem.fileName}
                  </button>
                  <p className="text-xs text-slate-500">
                    {DOCUMENT_TYPE_LABELS[docItem.documentType]}
                    {personName(docItem.linkedPersonId) && ` · ${personName(docItem.linkedPersonId)}`}
                    {docItem.renewalDate && ` · due ${docItem.renewalDate}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {docItem.actionRequired && (() => {
                    const task = taskForDocument(docItem.id)
                    if (task) {
                      return (
                        <Link
                          href="/tasks"
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-200"
                        >
                          {task.status === 'open' ? 'Action needed →' : 'Action needed ✓'}
                        </Link>
                      )
                    }
                    return (
                      <button
                        onClick={() => handleCreateTaskFor(docItem)}
                        disabled={busyDocId === docItem.id}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                      >
                        {busyDocId === docItem.id ? '…' : 'Action needed — Add to Tasks'}
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => handleDelete(docItem)}
                    disabled={busyDocId === docItem.id}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {busyDocId === docItem.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {assignedPopup && (
        <TaskAssignedModal
          task={assignedPopup.task}
          people={people}
          reason={assignedPopup.reason}
          onChangeAssignee={handleChangePopupAssignee}
          onClose={() => setAssignedPopup(null)}
        />
      )}
    </main>
  )
}