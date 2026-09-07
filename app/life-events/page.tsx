'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import { matchHousehold } from '@/lib/matching'
import {
  applyPlanToPeopleLocally,
  lifeEventNeedsExistingPerson,
  lifeEventNeedsNewPersonName,
  LIFE_EVENT_DESCRIPTIONS,
  LIFE_EVENT_LABELS,
  LIFE_EVENT_TYPES,
  planLifeEvent,
  type LifeEventPlan,
} from '@/lib/lifeEvents'
import type { ExtractedDocument, Household, LifeEvent, LifeEventType, Person, Task } from '@/lib/types'

export default function LifeEventsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [documents, setDocuments] = useState<ExtractedDocument[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [history, setHistory] = useState<LifeEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedType, setSelectedType] = useState<LifeEventType | null>(null)
  const [affectedPersonId, setAffectedPersonId] = useState('')
  const [newPersonName, setNewPersonName] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ summaryLines: string[]; newlyMatchedSchemeNames: string[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

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
          housingType: rawHousehold.housingType ?? null,
          propertiesOwned: rawHousehold.propertiesOwned ?? null,
          residentialAnnualValue: rawHousehold.residentialAnnualValue ?? null,
        }
        setHousehold(householdData)

        const [peopleSnap, docsSnap, tasksSnap, eventsSnap] = await Promise.all([
          getDocs(collection(db, 'households', householdData.id, 'people')),
          getDocs(collection(db, 'households', householdData.id, 'documents')),
          getDocs(collection(db, 'households', householdData.id, 'tasks')),
          getDocs(collection(db, 'households', householdData.id, 'lifeEvents')),
        ])

        setPeople(
          peopleSnap.docs.map((d) => {
            const raw = d.data() as Omit<Person, 'id'>
            return { id: d.id, ...raw, status: raw.status ?? 'active' }
          })
        )
        setDocuments(
          docsSnap.docs.map((d) => {
            const raw = d.data() as Omit<ExtractedDocument, 'id'>
            return { id: d.id, ...raw, fileUrl: raw.fileUrl ?? null }
          })
        )
        setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })))
        setHistory(
          eventsSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<LifeEvent, 'id'>) }))
            .sort((a, b) => b.createdAt - a.createdAt)
        )
      } catch (err: any) {
        setLoadError(
          err?.message ?? 'Could not load this page — make sure the latest Firestore rules have been published.'
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  const livingPeople = people.filter((p) => p.status !== 'deceased')

  function resetForm() {
    setSelectedType(null)
    setAffectedPersonId('')
    setNewPersonName('')
    setResult(null)
  }

  async function handleApply() {
    if (!household || !selectedType) return
    setApplying(true)
    setApplyError(null)
    try {
      const plan: LifeEventPlan = planLifeEvent(
        { type: selectedType, affectedPersonId: affectedPersonId || null, newPersonName: newPersonName || null },
        people,
        documents,
        tasks
      )

      const beforeMatches = new Set(
        matchHousehold(household, people)
          .filter((m) => m.status === 'matches')
          .map((m) => m.scheme.id)
      )
      const peopleAfter = applyPlanToPeopleLocally(people, plan)
      const afterMatches = matchHousehold(household, peopleAfter).filter((m) => m.status === 'matches')
      const newlyMatched = afterMatches.filter((m) => !beforeMatches.has(m.scheme.id))

      // Apply the plan for real.
      await Promise.all(plan.personUpdates.map((u) => updateDoc(doc(db, 'households', household.id, 'people', u.personId), u.update)))
      await Promise.all(plan.taskUpdates.map((u) => updateDoc(doc(db, 'households', household.id, 'tasks', u.taskId), u.update)))
      const createdTasks = await Promise.all(
        plan.newTasks.map((t) => addDoc(collection(db, 'households', household.id, 'tasks'), { ...t, createdAt: serverTimestamp() }))
      )
      let createdPerson: Person | null = null
      if (plan.newPerson) {
        const personRef = await addDoc(collection(db, 'households', household.id, 'people'), plan.newPerson)
        createdPerson = { id: personRef.id, ...plan.newPerson }
      }

      const affectedPerson = people.find((p) => p.id === affectedPersonId)
      const eventFields = {
        type: selectedType,
        affectedPersonId: createdPerson?.id ?? affectedPerson?.id ?? null,
        affectedPersonName: createdPerson?.name ?? affectedPerson?.name ?? null,
        summaryLines: plan.summaryLines,
        newlyMatchedSchemeNames: newlyMatched.map((m) => m.scheme.name),
      }
      const eventRef = await addDoc(collection(db, 'households', household.id, 'lifeEvents'), {
        ...eventFields,
        createdAt: serverTimestamp(),
      })

      // Reflect everything in local state.
      setPeople((prev) => {
        let next = prev.map((p) => {
          const u = plan.personUpdates.find((x) => x.personId === p.id)
          return u ? { ...p, ...u.update } : p
        })
        if (createdPerson) next = [...next, createdPerson]
        return next
      })
      setTasks((prev) => {
        let next = prev.map((t) => {
          const u = plan.taskUpdates.find((x) => x.taskId === t.id)
          return u ? { ...t, ...u.update } : t
        })
        next = [
          ...next,
          ...plan.newTasks.map((t, i) => ({ id: createdTasks[i].id, ...t, createdAt: Date.now() })),
        ]
        return next
      })
      setHistory((prev) => [{ id: eventRef.id, ...eventFields, createdAt: Date.now() }, ...prev])
      setResult({ summaryLines: plan.summaryLines, newlyMatchedSchemeNames: newlyMatched.map((m) => m.scheme.name) })
    } catch (err: any) {
      setApplyError(
        err?.message ??
          'Something went wrong applying this life event. Some changes may have already been saved — check Tasks and the Family Graph before retrying.'
      )
    } finally {
      setApplying(false)
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
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Life Events</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <p className="mb-6 text-sm text-slate-500">
        Something changed? Tell us what happened and we'll walk the family graph — reassigning tasks, flagging
        documents, and re-checking Opportunity Discovery — so nothing falls through the cracks.
      </p>

      {applyError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{applyError}</div>
      )}

      {!selectedType ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LIFE_EVENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type)
                setResult(null)
              }}
              className={`rounded-lg border p-3 text-left text-sm font-medium hover:bg-slate-50 ${
                type === 'death' ? 'border-slate-300 text-slate-700' : 'border-slate-200 text-slate-700'
              }`}
            >
              {LIFE_EVENT_LABELS[type]}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium text-slate-900">{LIFE_EVENT_LABELS[selectedType]}</p>
            <button onClick={resetForm} className="text-xs text-slate-500 hover:underline">
              Change
            </button>
          </div>
          <p className="mb-3 text-sm text-slate-500">{LIFE_EVENT_DESCRIPTIONS[selectedType]}</p>

          {!result && (
            <>
              {lifeEventNeedsExistingPerson(selectedType) && (
                <select
                  value={affectedPersonId}
                  onChange={(e) => setAffectedPersonId(e.target.value)}
                  className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Who does this apply to?</option>
                  {livingPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {lifeEventNeedsNewPersonName(selectedType) && (
                <input
                  placeholder={selectedType === 'birth' ? "Child's name" : "Spouse's name"}
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              )}

              <button
                onClick={handleApply}
                disabled={
                  applying ||
                  (lifeEventNeedsExistingPerson(selectedType) && !affectedPersonId) ||
                  (lifeEventNeedsNewPersonName(selectedType) && !newPersonName.trim())
                }
                className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {applying ? 'Applying…' : 'Apply this life event'}
              </button>
            </>
          )}

          {result && (
            <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-medium text-emerald-900">Here's what changed:</p>
              <ul className="list-inside list-disc space-y-1 text-emerald-800">
                {result.summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {result.newlyMatchedSchemeNames.length > 0 && (
                <div>
                  <p className="font-medium text-emerald-900">Newly relevant:</p>
                  <ul className="list-inside list-disc text-emerald-800">
                    {result.newlyMatchedSchemeNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <Link href="/opportunities" className="mt-1 inline-block text-xs font-medium text-emerald-900 underline">
                    View in Opportunities →
                  </Link>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Link href="/tasks" className="text-xs font-medium text-emerald-900 underline">
                  View Tasks →
                </Link>
                <button onClick={resetForm} className="text-xs font-medium text-emerald-900 underline">
                  Record another event
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-500">History</h2>
          <div className="space-y-2">
            {history.map((event) => (
              <details key={event.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-900">
                  {LIFE_EVENT_LABELS[event.type]}
                  {event.affectedPersonName && ` — ${event.affectedPersonName}`}
                </summary>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
                  {event.summaryLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
