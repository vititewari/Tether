'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import { RESPONSIBILITY_OPTIONS, EmploymentStatus } from '@/lib/types'

type Step = 'household' | 'people' | 'business' | 'done'

interface DraftPerson {
  name: string
  age: string
  employmentStatus: EmploymentStatus | ''
  incomeBracket: string
  responsibilities: string[]
}

const EMPTY_PERSON: DraftPerson = {
  name: '',
  age: '',
  employmentStatus: '',
  incomeBracket: '',
  responsibilities: [],
}

const INCOME_BRACKETS = ['0-2,000', '2,000-4,000', '4,000-6,000', '6,000-10,000', '10,000+']

export default function OnboardingPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<Step>('household')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 1: household
  const [householdName, setHouseholdName] = useState('')
  const [householdId, setHouseholdId] = useState<string | null>(null)

  // Step 2: people
  const [addedPeople, setAddedPeople] = useState<string[]>([])
  const [draftPerson, setDraftPerson] = useState<DraftPerson>(EMPTY_PERSON)

  // Step 3: business
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [revenueBracket, setRevenueBracket] = useState('')

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)

    try {
      const docRef = await addDoc(collection(db, 'households'), {
        name: householdName,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      })
      setHouseholdId(docRef.id)
      setStep('people')
    } catch (err: any) {
      setError(err?.message ?? 'Could not create household.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleResponsibility(r: string) {
    setDraftPerson((prev) => ({
      ...prev,
      responsibilities: prev.responsibilities.includes(r)
        ? prev.responsibilities.filter((x) => x !== r)
        : [...prev.responsibilities, r],
    }))
  }

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!householdId) return
    setError(null)
    setSubmitting(true)

    try {
      await addDoc(collection(db, 'households', householdId, 'people'), {
        name: draftPerson.name,
        age: draftPerson.age ? Number(draftPerson.age) : null,
        employmentStatus: draftPerson.employmentStatus || null,
        incomeBracket: draftPerson.incomeBracket || null,
        responsibilities: draftPerson.responsibilities,
        preferences: {},
        createdAt: serverTimestamp(),
      })
      setAddedPeople((prev) => [...prev, draftPerson.name])
      setDraftPerson(EMPTY_PERSON)
    } catch (err: any) {
      setError(err?.message ?? 'Could not add person.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault()
    if (!householdId) return
    setError(null)
    setSubmitting(true)

    try {
      await addDoc(collection(db, 'households', householdId, 'businesses'), {
        name: businessName,
        industry: industry || null,
        employeeCount: employeeCount ? Number(employeeCount) : null,
        revenueBracket: revenueBracket || null,
        createdAt: serverTimestamp(),
      })
      setStep('done')
    } catch (err: any) {
      setError(err?.message ?? 'Could not save business.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <StepIndicator step={step} />

        {step === 'household' && (
          <form onSubmit={handleCreateHousehold} className="space-y-4">
            <h1 className="text-xl font-semibold">Who are we helping manage?</h1>
            <p className="text-sm text-slate-500">Give your household a name.</p>
            <input
              required
              placeholder="e.g. The Lim Family"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'people' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold">Add family members</h1>
              <p className="text-sm text-slate-500">
                Add each person, their responsibilities, and any preferences. Add as many as you need, then continue.
              </p>
            </div>

            {addedPeople.length > 0 && (
              <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
                {addedPeople.map((name, i) => (
                  <li key={i} className="text-slate-700">
                    ✓ {name}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddPerson} className="space-y-4">
              <input
                required
                placeholder="Name"
                value={draftPerson.name}
                onChange={(e) => setDraftPerson({ ...draftPerson, name: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />

              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="Age"
                  value={draftPerson.age}
                  onChange={(e) => setDraftPerson({ ...draftPerson, age: e.target.value })}
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <select
                  value={draftPerson.employmentStatus}
                  onChange={(e) =>
                    setDraftPerson({
                      ...draftPerson,
                      employmentStatus: e.target.value as EmploymentStatus,
                    })
                  }
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Employment status</option>
                  <option value="employed">Employed</option>
                  <option value="self-employed">Self-employed</option>
                  <option value="student">Student</option>
                  <option value="retired">Retired</option>
                  <option value="unemployed">Unemployed</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <select
                value={draftPerson.incomeBracket}
                onChange={(e) =>
                  setDraftPerson({ ...draftPerson, incomeBracket: e.target.value })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="">Income bracket (optional)</option>
                {INCOME_BRACKETS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Responsibilities</p>
                <div className="grid grid-cols-2 gap-2">
                  {RESPONSIBILITY_OPTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={draftPerson.responsibilities.includes(r)}
                        onChange={() => toggleResponsibility(r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              >
                {submitting ? 'Adding…' : '+ Add this person'}
              </button>
            </form>

            <button
              onClick={() => setStep('business')}
              disabled={addedPeople.length === 0}
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'business' && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">Does your household own a business?</h1>

            {hasBusiness === null && (
              <div className="flex gap-3">
                <button
                  onClick={() => setHasBusiness(true)}
                  className="flex-1 rounded-md border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setStep('done')}
                  className="flex-1 rounded-md border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  No, skip
                </button>
              </div>
            )}

            {hasBusiness && (
              <form onSubmit={handleSaveBusiness} className="space-y-4">
                <input
                  required
                  placeholder="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  placeholder="Industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Employee count"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                    className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                  <input
                    placeholder="Revenue bracket"
                    value={revenueBracket}
                    onChange={(e) => setRevenueBracket(e.target.value)}
                    className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Continue'}
                </button>
              </form>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold">Household set up ✓</h1>
            <p className="text-sm text-slate-500">Your family graph is ready.</p>
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = ['household', 'people', 'business', 'done']
  const currentIndex = steps.indexOf(step)

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${
            i <= currentIndex ? 'bg-slate-900' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}
