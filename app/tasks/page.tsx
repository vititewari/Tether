'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import { isOverdue, taskSuggestsEmail } from '@/lib/tasks'
import { buildPrefillFacts } from '@/lib/actionCard'
import ActionCardModal from '@/components/ActionCardModal'
import type { Household, Person, Task, TaskPriority } from '@/lib/types'

const PRIORITY_LABELS: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' }
const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

interface NewTaskDraft {
  title: string
  dueDate: string
  relatedPersonId: string
  assignedPersonId: string
  priority: TaskPriority
}

const EMPTY_DRAFT: NewTaskDraft = { title: '', dueDate: '', relatedPersonId: '', assignedPersonId: '', priority: 'medium' }

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const [addingTask, setAddingTask] = useState(false)
  const [draft, setDraft] = useState<NewTaskDraft>(EMPTY_DRAFT)
  const [savingTask, setSavingTask] = useState(false)

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
        const householdData: Household = { id: householdDoc.id, ...(householdDoc.data() as Omit<Household, 'id'>) }
        setHousehold(householdData)

        const [peopleSnap, tasksSnap] = await Promise.all([
          getDocs(collection(db, 'households', householdData.id, 'people')),
          getDocs(collection(db, 'households', householdData.id, 'tasks')),
        ])

        setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
        setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })))
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this page.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  const openTasks = tasks
    .filter((t) => t.status === 'open')
    .sort((a, b) => {
      const aOverdue = isOverdue(a.dueDate)
      const bOverdue = isOverdue(b.dueDate)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      const aDue = a.dueDate ?? '9999-12-31'
      const bDue = b.dueDate ?? '9999-12-31'
      return aDue.localeCompare(bDue)
    })
  const completedTasks = tasks.filter((t) => t.status !== 'open')

  function personName(id: string | null): string | null {
    return people.find((p) => p.id === id)?.name ?? null
  }

  async function setTaskStatus(task: Task, status: Task['status']) {
    if (!household) return
    setBusyTaskId(task.id)
    try {
      await updateDoc(doc(db, 'households', household.id, 'tasks', task.id), { status })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
    } finally {
      setBusyTaskId(null)
    }
  }

  async function reassignTask(task: Task, personId: string) {
    if (!household) return
    const name = personId ? personName(personId) : null
    setBusyTaskId(task.id)
    try {
      await updateDoc(doc(db, 'households', household.id, 'tasks', task.id), {
        assignedPersonId: personId || null,
        assignedPersonName: name,
      })
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, assignedPersonId: personId || null, assignedPersonName: name } : t))
      )
    } finally {
      setBusyTaskId(null)
    }
  }

  async function handleAddTask() {
    if (!household || !draft.title.trim()) return
    setSavingTask(true)
    try {
      const relatedPerson = people.find((p) => p.id === draft.relatedPersonId)
      const assignedPerson = people.find((p) => p.id === draft.assignedPersonId)
      const fields = {
        title: draft.title.trim(),
        description: null,
        dueDate: draft.dueDate || null,
        relatedPersonId: relatedPerson?.id ?? null,
        relatedPersonName: relatedPerson?.name ?? null,
        sourceDocumentId: null,
        sourceDocumentName: null,
        assignedPersonId: assignedPerson?.id ?? null,
        assignedPersonName: assignedPerson?.name ?? null,
        priority: draft.priority,
        status: 'open' as const,
      }
      const docRef = await addDoc(collection(db, 'households', household.id, 'tasks'), {
        ...fields,
        createdAt: serverTimestamp(),
      })
      setTasks((prev) => [...prev, { id: docRef.id, ...fields, createdAt: Date.now() }])
      setDraft(EMPTY_DRAFT)
      setAddingTask(false)
    } finally {
      setSavingTask(false)
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <p className="mb-6 text-sm text-slate-500">
        Obligations detected from Smart Upload, plus anything you add yourself — automatically routed to whoever
        owns that responsibility.
      </p>

      <div className="mb-6 space-y-3">
        {openTasks.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing open right now.</p>
        ) : (
          openTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              people={people}
              household={household!}
              busy={busyTaskId === task.id}
              onDone={() => setTaskStatus(task, 'done')}
              onDismiss={() => setTaskStatus(task, 'dismissed')}
              onReassign={(personId) => reassignTask(task, personId)}
            />
          ))
        )}
      </div>

      {addingTask ? (
        <div className="mb-8 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">New task</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none sm:col-span-2"
            />
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <select
              value={draft.relatedPersonId}
              onChange={(e) => setDraft({ ...draft, relatedPersonId: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="">Related to (optional)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={draft.assignedPersonId}
              onChange={(e) => setDraft({ ...draft, assignedPersonId: e.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="">Assign to (optional)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAddTask}
              disabled={savingTask || !draft.title.trim()}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {savingTask ? 'Adding…' : '+ Add task'}
            </button>
            <button
              onClick={() => {
                setAddingTask(false)
                setDraft(EMPTY_DRAFT)
              }}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingTask(true)}
          className="mb-8 w-full rounded-md border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + Add a task
        </button>
      )}

      {completedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="mb-3 text-sm font-medium text-slate-500 hover:underline"
          >
            {showCompleted ? '− Hide' : '+ Show'} completed &amp; dismissed ({completedTasks.length})
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-500 line-through">{task.title}</p>
                    <p className="text-xs text-slate-400">
                      {task.status === 'done' ? 'Done' : 'Dismissed'}
                      {task.assignedPersonName && ` · ${task.assignedPersonName}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setTaskStatus(task, 'open')}
                    disabled={busyTaskId === task.id}
                    className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    Reopen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function TaskCard({
  task,
  people,
  household,
  busy,
  onDone,
  onDismiss,
  onReassign,
}: {
  task: Task
  people: Person[]
  household: Household
  busy: boolean
  onDone: () => void
  onDismiss: () => void
  onReassign: (personId: string) => void
}) {
  const overdue = isOverdue(task.dueDate)
  const [showActionCard, setShowActionCard] = useState(false)
  const relatedPerson = people.find((p) => p.id === task.relatedPersonId) ?? null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="font-medium text-slate-900">{task.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Overdue</span>}
          <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLES[task.priority]}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
      </div>

      {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}

      <p className="mt-2 text-xs text-slate-500">
        {task.dueDate && `Due ${task.dueDate}`}
        {task.relatedPersonName && ` · For ${task.relatedPersonName}`}
        {task.sourceDocumentName && ` · From ${task.sourceDocumentName}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={task.assignedPersonId ?? ''}
          onChange={(e) => onReassign(e.target.value)}
          disabled={busy}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={onDone}
          disabled={busy}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
        >
          Mark done
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          onClick={() => setShowActionCard(true)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Prepare application
        </button>
      </div>

      {showActionCard && (
        <ActionCardModal
          title={task.title}
          purpose={task.title}
          recipientType={
            `${task.title} ${task.description ?? ''}`.toLowerCase().includes('insur')
              ? "the insurer's claims department"
              : 'the relevant office'
          }
          benefitOrTaskDescription={task.description ?? task.title}
          facts={buildPrefillFacts(household, relatedPerson)}
          requiredDocuments={[]}
          showEmailDraft={taskSuggestsEmail(task)}
          onClose={() => setShowActionCard(false)}
        />
      )}
    </div>
  )
}
