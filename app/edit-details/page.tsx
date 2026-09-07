'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, addDoc, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import type { CitizenshipStatus, EmploymentStatus, Household, HousingType, Person, PersonRelationship } from '@/lib/types'
import { HOUSING_TYPES, HOUSING_TYPE_LABELS, RESPONSIBILITY_OPTIONS } from '@/lib/types'
import { computeAge } from '@/lib/age'

interface HouseholdDraft {
  name: string
  housingType: HousingType | ''
  propertiesOwned: string
  residentialAnnualValue: string
}

interface PersonDraft {
  name: string
  dateOfBirth: string
  employmentStatus: EmploymentStatus | ''
  citizenshipStatus: CitizenshipStatus | ''
  relationship: PersonRelationship | ''
  monthlyIncome: string
  workingHoursPerMonth: string
  birthOrder: string
  responsibilities: string[]
}

const EMPTY_PERSON_DRAFT: PersonDraft = {
  name: '',
  dateOfBirth: '',
  employmentStatus: '',
  citizenshipStatus: '',
  relationship: '',
  monthlyIncome: '',
  workingHoursPerMonth: '',
  birthOrder: '',
  responsibilities: [],
}

function personToDraft(p: Person): PersonDraft {
  return {
    name: p.name,
    dateOfBirth: p.dateOfBirth ?? '',
    employmentStatus: p.employmentStatus ?? '',
    citizenshipStatus: p.citizenshipStatus ?? '',
    relationship: p.relationship ?? '',
    monthlyIncome: p.monthlyIncome != null ? String(p.monthlyIncome) : '',
    workingHoursPerMonth: p.workingHoursPerMonth != null ? String(p.workingHoursPerMonth) : '',
    birthOrder: p.birthOrder != null ? String(p.birthOrder) : '',
    responsibilities: p.responsibilities ?? [],
  }
}

function draftToUpdate(draft: PersonDraft) {
  return {
    name: draft.name,
    dateOfBirth: draft.dateOfBirth || null,
    employmentStatus: draft.employmentStatus || null,
    citizenshipStatus: draft.citizenshipStatus || null,
    relationship: draft.relationship || null,
    monthlyIncome: draft.monthlyIncome ? Number(draft.monthlyIncome) : null,
    workingHoursPerMonth: draft.workingHoursPerMonth ? Number(draft.workingHoursPerMonth) : null,
    birthOrder: draft.birthOrder ? Number(draft.birthOrder) : null,
    responsibilities: draft.responsibilities,
  }
}

export default function EditDetailsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  const [householdDraft, setHouseholdDraft] = useState<HouseholdDraft>({
    name: '',
    housingType: '',
    propertiesOwned: '',
    residentialAnnualValue: '',
  })
  const [peopleDrafts, setPeopleDrafts] = useState<Record<string, PersonDraft>>({})
  const [savingHousehold, setSavingHousehold] = useState(false)
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  const [addingPerson, setAddingPerson] = useState(false)
  const [newPerson, setNewPerson] = useState<PersonDraft>(EMPTY_PERSON_DRAFT)
  const [savingNewPerson, setSavingNewPerson] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
        const raw = householdDoc.data() as Omit<Household, 'id'>
        const householdData: Household = {
          id: householdDoc.id,
          ...raw,
          housingType: raw.housingType ?? null,
          propertiesOwned: raw.propertiesOwned ?? null,
          residentialAnnualValue: raw.residentialAnnualValue ?? null,
        }
        setHousehold(householdData)
        setHouseholdDraft({
          name: householdData.name,
          housingType: householdData.housingType ?? '',
          propertiesOwned: householdData.propertiesOwned != null ? String(householdData.propertiesOwned) : '',
          residentialAnnualValue:
            householdData.residentialAnnualValue != null ? String(householdData.residentialAnnualValue) : '',
        })

        const peopleSnap = await getDocs(collection(db, 'households', householdData.id, 'people'))
        const peopleData = peopleSnap.docs.map((d) => {
          const raw = d.data() as Omit<Person, 'id'>
          return {
            id: d.id,
            ...raw,
            citizenshipStatus: raw.citizenshipStatus ?? null,
            relationship: raw.relationship ?? null,
            monthlyIncome: raw.monthlyIncome ?? null,
            workingHoursPerMonth: raw.workingHoursPerMonth ?? null,
            birthOrder: raw.birthOrder ?? null,
          }
        })
        setPeople(peopleData)
        setPeopleDrafts(Object.fromEntries(peopleData.map((p) => [p.id, personToDraft(p)])))
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this page.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  function flash(label: string) {
    setSavedFlash(label)
    setTimeout(() => setSavedFlash((cur) => (cur === label ? null : cur)), 2000)
  }

  function toggleResponsibility(draft: PersonDraft, r: string): PersonDraft {
    return {
      ...draft,
      responsibilities: draft.responsibilities.includes(r)
        ? draft.responsibilities.filter((x) => x !== r)
        : [...draft.responsibilities, r],
    }
  }

  async function handleSaveHousehold() {
    if (!household) return
    setSavingHousehold(true)
    try {
      const update = {
        name: householdDraft.name,
        housingType: householdDraft.housingType || null,
        propertiesOwned: householdDraft.propertiesOwned ? Number(householdDraft.propertiesOwned) : null,
        residentialAnnualValue: householdDraft.residentialAnnualValue
          ? Number(householdDraft.residentialAnnualValue)
          : null,
      }
      await updateDoc(doc(db, 'households', household.id), update)
      setHousehold({ ...household, ...update })
      flash('household')
    } finally {
      setSavingHousehold(false)
    }
  }

  async function handleSavePerson(personId: string) {
    if (!household) return
    const draft = peopleDrafts[personId]
    if (!draft) return
    setSavingPersonId(personId)
    try {
      const update = draftToUpdate(draft)
      await updateDoc(doc(db, 'households', household.id, 'people', personId), update)
      setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, ...update } : p)))
      flash(personId)
    } finally {
      setSavingPersonId(null)
    }
  }

  async function handleAddPerson() {
    if (!household || !newPerson.name.trim()) return
    setSavingNewPerson(true)
    try {
      const docRef = await addDoc(collection(db, 'households', household.id, 'people'), {
        ...draftToUpdate(newPerson),
        age: null,
        incomeBracket: null,
        status: 'active',
        preferences: {},
        createdAt: serverTimestamp(),
      })
      const added: Person = {
        id: docRef.id,
        ...draftToUpdate(newPerson),
        age: null,
        incomeBracket: null,
        status: 'active',
        preferences: {},
        createdAt: Date.now(),
      }
      setPeople((prev) => [...prev, added])
      setPeopleDrafts((prev) => ({ ...prev, [added.id]: personToDraft(added) }))
      setNewPerson(EMPTY_PERSON_DRAFT)
      setAddingPerson(false)
    } finally {
      setSavingNewPerson(false)
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
        <h1 className="text-2xl font-semibold">Edit Details</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Household</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Household name"
            value={householdDraft.name}
            onChange={(e) => setHouseholdDraft({ ...householdDraft, name: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <select
            value={householdDraft.housingType}
            onChange={(e) => setHouseholdDraft({ ...householdDraft, housingType: e.target.value as HousingType | '' })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">Housing type</option>
            {HOUSING_TYPES.map((h) => (
              <option key={h} value={h}>
                {HOUSING_TYPE_LABELS[h]}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Properties owned"
            value={householdDraft.propertiesOwned}
            onChange={(e) => setHouseholdDraft({ ...householdDraft, propertiesOwned: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <input
            type="number"
            placeholder="Home annual value ($)"
            value={householdDraft.residentialAnnualValue}
            onChange={(e) => setHouseholdDraft({ ...householdDraft, residentialAnnualValue: e.target.value })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSaveHousehold}
          disabled={savingHousehold}
          className="mt-3 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {savingHousehold ? 'Saving…' : savedFlash === 'household' ? 'Saved ✓' : 'Save household'}
        </button>
      </section>

      <section className="space-y-4">
        <p className="text-sm font-medium text-slate-700">Family members</p>
        {people.map((p) => {
          const draft = peopleDrafts[p.id] ?? personToDraft(p)
          return (
            <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  placeholder="Name"
                  value={draft.name}
                  onChange={(e) => setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, name: e.target.value } })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="date"
                  aria-label="Date of birth"
                  value={draft.dateOfBirth}
                  onChange={(e) => setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, dateOfBirth: e.target.value } })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <select
                  value={draft.employmentStatus}
                  onChange={(e) =>
                    setPeopleDrafts({
                      ...peopleDrafts,
                      [p.id]: { ...draft, employmentStatus: e.target.value as EmploymentStatus | '' },
                    })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Employment status</option>
                  <option value="employed">Employed</option>
                  <option value="self-employed">Self-employed</option>
                  <option value="student">Student</option>
                  <option value="retired">Retired</option>
                  <option value="unemployed">Unemployed</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={draft.citizenshipStatus}
                  onChange={(e) =>
                    setPeopleDrafts({
                      ...peopleDrafts,
                      [p.id]: { ...draft, citizenshipStatus: e.target.value as CitizenshipStatus | '' },
                    })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Citizenship</option>
                  <option value="citizen">Singapore Citizen</option>
                  <option value="pr">Permanent Resident</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={draft.relationship}
                  onChange={(e) =>
                    setPeopleDrafts({
                      ...peopleDrafts,
                      [p.id]: { ...draft, relationship: e.target.value as PersonRelationship | '' },
                    })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Relationship</option>
                  <option value="self">Self</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="number"
                  placeholder="Monthly income ($)"
                  value={draft.monthlyIncome}
                  onChange={(e) =>
                    setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, monthlyIncome: e.target.value } })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Working hours/month"
                  value={draft.workingHoursPerMonth}
                  onChange={(e) =>
                    setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, workingHoursPerMonth: e.target.value } })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                />
                {draft.relationship === 'child' && (
                  <input
                    type="number"
                    placeholder="Birth order (e.g. 3 = 3rd child)"
                    value={draft.birthOrder}
                    onChange={(e) =>
                      setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, birthOrder: e.target.value } })
                    }
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                  />
                )}
              </div>
              {draft.dateOfBirth && (
                <p className="mt-1 text-xs text-slate-400">
                  Currently {computeAge(draft.dateOfBirth)} yrs — updates automatically every year.
                </p>
              )}

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-slate-500">Responsibilities</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {RESPONSIBILITY_OPTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.responsibilities.includes(r)}
                        onChange={() => setPeopleDrafts({ ...peopleDrafts, [p.id]: toggleResponsibility(draft, r) })}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSavePerson(p.id)}
                disabled={savingPersonId === p.id}
                className="mt-3 rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              >
                {savingPersonId === p.id ? 'Saving…' : savedFlash === p.id ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          )
        })}

        {addingPerson ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <p className="mb-2 text-sm font-medium text-slate-700">New family member</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                placeholder="Name"
                value={newPerson.name}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="date"
                aria-label="Date of birth"
                value={newPerson.dateOfBirth}
                onChange={(e) => setNewPerson({ ...newPerson, dateOfBirth: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
              <select
                value={newPerson.relationship}
                onChange={(e) => setNewPerson({ ...newPerson, relationship: e.target.value as PersonRelationship | '' })}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="">Relationship</option>
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleAddPerson}
                disabled={savingNewPerson || !newPerson.name.trim()}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingNewPerson ? 'Adding…' : '+ Add person'}
              </button>
              <button
                onClick={() => {
                  setAddingPerson(false)
                  setNewPerson(EMPTY_PERSON_DRAFT)
                }}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              You can fill in the rest of their details (income, citizenship, etc.) after adding them.
            </p>
          </div>
        ) : (
          <button
            onClick={() => setAddingPerson(true)}
            className="w-full rounded-md border border-dashed border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            + Add a family member
          </button>
        )}
      </section>
    </main>
  )
}
