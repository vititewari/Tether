'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, addDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import {
  RESPONSIBILITY_OPTIONS,
  EmploymentStatus,
  HOUSING_TYPES,
  HOUSING_TYPE_LABELS,
  CitizenshipStatus,
  PersonRelationship,
  HousingType,
} from '@/lib/types'

type Step = 'household' | 'people' | 'housing' | 'business' | 'done'
const STEPS: Step[] = ['household', 'people', 'housing', 'business', 'done']

interface DraftPerson {
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

const EMPTY_PERSON: DraftPerson = {
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

export default function OnboardingPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState<Step>('household')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 1: household
  const [householdName, setHouseholdName] = useState('')
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [housingType, setHousingType] = useState<HousingType | ''>('')
  const [propertiesOwned, setPropertiesOwned] = useState('')
  const [residentialAnnualValue, setResidentialAnnualValue] = useState('')

  // Step 2: people
  const [addedPeople, setAddedPeople] = useState<string[]>([])
  const [draftPerson, setDraftPerson] = useState<DraftPerson>(EMPTY_PERSON)

  // Step 3: business
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [revenueBracket, setRevenueBracket] = useState('')

  function goBack() {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)

    try {
      if (householdId) {
        // Revisited via Back — update the existing household instead of
        // creating a second one.
        await updateDoc(doc(db, 'households', householdId), { name: householdName })
      } else {
        const docRef = await addDoc(collection(db, 'households'), {
          name: householdName,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          housingType: null,
          propertiesOwned: null,
          residentialAnnualValue: null,
        })
        setHouseholdId(docRef.id)
      }
      setStep('people')
    } catch (err: any) {
      setError(err?.message ?? 'Could not create household.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveHousing(e: React.FormEvent) {
    e.preventDefault()
    if (!householdId) return
    setError(null)
    setSubmitting(true)

    try {
      await updateDoc(doc(db, 'households', householdId), {
        housingType: housingType || null,
        propertiesOwned: propertiesOwned ? Number(propertiesOwned) : null,
        residentialAnnualValue: residentialAnnualValue ? Number(residentialAnnualValue) : null,
      })
      setStep('business')
    } catch (err: any) {
      setError(err?.message ?? 'Could not save housing details.')
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
        age: null,
        dateOfBirth: draftPerson.dateOfBirth || null,
        employmentStatus: draftPerson.employmentStatus || null,
        incomeBracket: null,
        citizenshipStatus: draftPerson.citizenshipStatus || null,
        relationship: draftPerson.relationship || null,
        monthlyIncome: draftPerson.monthlyIncome ? Number(draftPerson.monthlyIncome) : null,
        workingHoursPerMonth: draftPerson.workingHoursPerMonth ? Number(draftPerson.workingHoursPerMonth) : null,
        birthOrder: draftPerson.birthOrder ? Number(draftPerson.birthOrder) : null,
        status: 'active',
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
        {step !== 'household' && step !== 'done' && (
          <button onClick={goBack} className="text-sm text-slate-500 hover:underline">
            ← Back
          </button>
        )}
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
                  type="date"
                  aria-label="Date of birth"
                  value={draftPerson.dateOfBirth}
                  onChange={(e) => setDraftPerson({ ...draftPerson, dateOfBirth: e.target.value })}
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

              <div className="flex gap-3">
                <select
                  value={draftPerson.citizenshipStatus}
                  onChange={(e) =>
                    setDraftPerson({
                      ...draftPerson,
                      citizenshipStatus: e.target.value as CitizenshipStatus | '',
                    })
                  }
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Citizenship (optional)</option>
                  <option value="citizen">Singapore Citizen</option>
                  <option value="pr">Permanent Resident</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={draftPerson.relationship}
                  onChange={(e) =>
                    setDraftPerson({
                      ...draftPerson,
                      relationship: e.target.value as PersonRelationship | '',
                    })
                  }
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Relationship (optional)</option>
                  <option value="self">Self</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="Monthly income ($, optional)"
                  value={draftPerson.monthlyIncome}
                  onChange={(e) => setDraftPerson({ ...draftPerson, monthlyIncome: e.target.value })}
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Working hours/month (optional)"
                  value={draftPerson.workingHoursPerMonth}
                  onChange={(e) =>
                    setDraftPerson({ ...draftPerson, workingHoursPerMonth: e.target.value })
                  }
                  className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>

              {draftPerson.relationship === 'child' && (
                <input
                  type="number"
                  placeholder="Birth order (e.g. 3 = 3rd child, optional)"
                  value={draftPerson.birthOrder}
                  onChange={(e) => setDraftPerson({ ...draftPerson, birthOrder: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              )}

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
              onClick={() => setStep('housing')}
              disabled={addedPeople.length === 0}
              className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'housing' && (
          <form onSubmit={handleSaveHousing} className="space-y-4">
            <h1 className="text-xl font-semibold">Tell us about your home</h1>
            <p className="text-sm text-slate-500">
              Optional — helps us find relevant government schemes for you later.
            </p>
            <select
              value={housingType}
              onChange={(e) => setHousingType(e.target.value as HousingType | '')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="">Housing type</option>
              {HOUSING_TYPES.map((h) => (
                <option key={h} value={h}>
                  {HOUSING_TYPE_LABELS[h]}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="Properties owned"
                value={propertiesOwned}
                onChange={(e) => setPropertiesOwned(e.target.value)}
                className="w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Home annual value ($)"
                value={residentialAnnualValue}
                onChange={(e) => setResidentialAnnualValue(e.target.value)}
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
  const currentIndex = STEPS.indexOf(step)

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
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
