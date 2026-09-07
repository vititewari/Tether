'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'
import { matchHousehold } from '@/lib/matching'
import { buildPrefillFacts } from '@/lib/actionCard'
import ActionCardModal from '@/components/ActionCardModal'
import type {
  CitizenshipStatus,
  EmploymentStatus,
  Household,
  HousingType,
  Person,
  PersonRelationship,
  SchemeMatch,
} from '@/lib/types'
import { HOUSING_TYPES, HOUSING_TYPE_LABELS } from '@/lib/types'

// Every field the matcher can flag as missing, split by whether it's a
// household-wide fact or a specific person's. Onboarding now collects all of
// these up front — this page only ever prompts for genuine gaps (old
// households from before these fields existed, or a field someone skipped).
const HOUSEHOLD_FIELD_LABELS = new Set(['housing type', 'properties owned', 'residential annual value'])
const PERSON_FIELD_LABELS = new Set([
  'citizenship status',
  'age',
  'employment status',
  'monthly income',
  'working hours per month',
  'birth order',
])

interface HouseholdDraft {
  housingType: HousingType | ''
  propertiesOwned: string
  residentialAnnualValue: string
}

interface PersonDraft {
  dateOfBirth: string
  employmentStatus: EmploymentStatus | ''
  citizenshipStatus: CitizenshipStatus | ''
  relationship: PersonRelationship | ''
  monthlyIncome: string
  workingHoursPerMonth: string
  birthOrder: string
}

type ExplainState = { status: 'idle' | 'loading' | 'done' | 'error'; text?: string }

function formatDDMM(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00Z').getTime()
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
}

function personToDraft(p: Person): PersonDraft {
  return {
    dateOfBirth: p.dateOfBirth ?? '',
    employmentStatus: p.employmentStatus ?? '',
    citizenshipStatus: p.citizenshipStatus ?? '',
    relationship: p.relationship ?? '',
    monthlyIncome: p.monthlyIncome != null ? String(p.monthlyIncome) : '',
    workingHoursPerMonth: p.workingHoursPerMonth != null ? String(p.workingHoursPerMonth) : '',
    birthOrder: p.birthOrder != null ? String(p.birthOrder) : '',
  }
}

export default function OpportunitiesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [householdDraft, setHouseholdDraft] = useState<HouseholdDraft>({
    housingType: '',
    propertiesOwned: '',
    residentialAnnualValue: '',
  })
  const [peopleDrafts, setPeopleDrafts] = useState<Record<string, PersonDraft>>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const [explanations, setExplanations] = useState<Record<string, ExplainState>>({})

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
        setHouseholdDraft({
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

  const matches = useMemo<SchemeMatch[]>(() => {
    if (!household) return []
    return matchHousehold(household, people)
  }, [household, people])

  const actionable = matches
    .filter((m) => m.status === 'matches' && !m.scheme.isAutomatic)
    .sort((a, b) => {
      const aExpiry = a.scheme.voucherExpiry ?? '9999-12-31'
      const bExpiry = b.scheme.voucherExpiry ?? '9999-12-31'
      return aExpiry.localeCompare(bExpiry)
    })
  const automatic = matches.filter((m) => m.status === 'matches' && m.scheme.isAutomatic)
  const needsInfo = matches.filter((m) => m.status === 'insufficient_data')

  // Only ask for what's genuinely still missing — onboarding already collects
  // all of this, so most households will never see anything here.
  const { householdMissing, personMissing } = useMemo(() => {
    const householdMissing = new Set<string>()
    const personMissing: Record<string, Set<string>> = {}

    const addPersonField = (personId: string, field: string) => {
      if (!personMissing[personId]) personMissing[personId] = new Set()
      personMissing[personId].add(field)
    }

    let needsHouseholdIncome = false
    needsInfo.forEach((m) => {
      m.missingFields.forEach((f) => {
        if (f === 'household income') {
          needsHouseholdIncome = true
        } else if (HOUSEHOLD_FIELD_LABELS.has(f)) {
          householdMissing.add(f)
        } else if (PERSON_FIELD_LABELS.has(f) && m.matchedPersonId) {
          addPersonField(m.matchedPersonId, f)
        }
      })
    })

    // "household income" means nobody's monthly income is on file yet — ask
    // every person, since the matcher can't tell whose is missing.
    if (needsHouseholdIncome) {
      people.forEach((p) => {
        if (p.monthlyIncome == null) addPersonField(p.id, 'monthly income')
      })
    }

    return { householdMissing, personMissing }
  }, [needsInfo, people])

  const hasMissingInfo = householdMissing.size > 0 || Object.keys(personMissing).length > 0

  async function handleSaveProfile() {
    if (!household) return
    setSavingProfile(true)
    try {
      const householdUpdate = {
        housingType: householdDraft.housingType || null,
        propertiesOwned: householdDraft.propertiesOwned ? Number(householdDraft.propertiesOwned) : null,
        residentialAnnualValue: householdDraft.residentialAnnualValue
          ? Number(householdDraft.residentialAnnualValue)
          : null,
      }
      await updateDoc(doc(db, 'households', household.id), householdUpdate)

      await Promise.all(
        Object.keys(personMissing).map((personId) => {
          const draft = peopleDrafts[personId]
          if (!draft) return Promise.resolve()
          return updateDoc(doc(db, 'households', household.id, 'people', personId), {
            dateOfBirth: draft.dateOfBirth || null,
            employmentStatus: draft.employmentStatus || null,
            citizenshipStatus: draft.citizenshipStatus || null,
            relationship: draft.relationship || null,
            monthlyIncome: draft.monthlyIncome ? Number(draft.monthlyIncome) : null,
            workingHoursPerMonth: draft.workingHoursPerMonth ? Number(draft.workingHoursPerMonth) : null,
            birthOrder: draft.birthOrder ? Number(draft.birthOrder) : null,
          })
        })
      )

      setHousehold({ ...household, ...householdUpdate })
      setPeople((prev) =>
        prev.map((p) => {
          if (!personMissing[p.id]) return p
          const draft = peopleDrafts[p.id]
          if (!draft) return p
          return {
            ...p,
            dateOfBirth: draft.dateOfBirth || null,
            employmentStatus: (draft.employmentStatus || null) as EmploymentStatus | null,
            citizenshipStatus: (draft.citizenshipStatus || null) as CitizenshipStatus | null,
            relationship: (draft.relationship || null) as PersonRelationship | null,
            monthlyIncome: draft.monthlyIncome ? Number(draft.monthlyIncome) : null,
            workingHoursPerMonth: draft.workingHoursPerMonth ? Number(draft.workingHoursPerMonth) : null,
            birthOrder: draft.birthOrder ? Number(draft.birthOrder) : null,
          }
        })
      )
      setProfileOpen(false)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleExplain(match: SchemeMatch) {
    if (!household) return
    setExplanations((prev) => ({ ...prev, [match.scheme.id]: { status: 'loading' } }))
    try {
      const response = await fetch('/api/explain-opportunity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemeName: match.scheme.name,
          benefit: match.scheme.benefit,
          matchedPersonName: match.matchedPersonName,
          householdName: household.name,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Failed to generate explanation.')
      setExplanations((prev) => ({ ...prev, [match.scheme.id]: { status: 'done', text: data.explanation } }))
    } catch {
      setExplanations((prev) => ({ ...prev, [match.scheme.id]: { status: 'error' } }))
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
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Back to Family Graph
        </Link>
      </div>

      <p className="mb-6 text-sm text-slate-500">
        Matches below are found by checking your household against published scheme rules — not decided by AI.
        Always verify against the official source before applying.
      </p>

      {hasMissingInfo && (
        <div className="mb-8 rounded-lg border border-slate-200 bg-white">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
          >
            <span>
              A few details we still need{' '}
              <span className="ml-1 text-amber-600">({needsInfo.length} schemes need this)</span>
            </span>
            <span className="text-slate-400">{profileOpen ? '−' : '+'}</span>
          </button>

          {profileOpen && (
            <div className="space-y-6 border-t border-slate-200 p-4">
              {householdMissing.size > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Household</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {householdMissing.has('housing type') && (
                      <select
                        value={householdDraft.housingType}
                        onChange={(e) =>
                          setHouseholdDraft({ ...householdDraft, housingType: e.target.value as HousingType | '' })
                        }
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                      >
                        <option value="">Housing type</option>
                        {HOUSING_TYPES.map((h) => (
                          <option key={h} value={h}>
                            {HOUSING_TYPE_LABELS[h]}
                          </option>
                        ))}
                      </select>
                    )}
                    {householdMissing.has('properties owned') && (
                      <input
                        type="number"
                        placeholder="Properties owned"
                        value={householdDraft.propertiesOwned}
                        onChange={(e) => setHouseholdDraft({ ...householdDraft, propertiesOwned: e.target.value })}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                      />
                    )}
                    {householdMissing.has('residential annual value') && (
                      <input
                        type="number"
                        placeholder="Home annual value ($)"
                        value={householdDraft.residentialAnnualValue}
                        onChange={(e) =>
                          setHouseholdDraft({ ...householdDraft, residentialAnnualValue: e.target.value })
                        }
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              )}

              {Object.keys(personMissing).length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-slate-700">Family members</p>
                  {people
                    .filter((p) => personMissing[p.id])
                    .map((p) => {
                      const draft = peopleDrafts[p.id] ?? personToDraft(p)
                      const missing = personMissing[p.id]
                      return (
                        <div key={p.id} className="rounded-md border border-slate-200 p-3">
                          <p className="mb-2 text-sm font-medium text-slate-900">{p.name}</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {missing.has('age') && (
                              <input
                                type="date"
                                aria-label="Date of birth"
                                value={draft.dateOfBirth}
                                onChange={(e) =>
                                  setPeopleDrafts({ ...peopleDrafts, [p.id]: { ...draft, dateOfBirth: e.target.value } })
                                }
                                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                              />
                            )}
                            {missing.has('employment status') && (
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
                            )}
                            {missing.has('citizenship status') && (
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
                            )}
                            {missing.has('monthly income') && (
                              <input
                                type="number"
                                placeholder="Monthly income ($)"
                                value={draft.monthlyIncome}
                                onChange={(e) =>
                                  setPeopleDrafts({
                                    ...peopleDrafts,
                                    [p.id]: { ...draft, monthlyIncome: e.target.value },
                                  })
                                }
                                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                              />
                            )}
                            {missing.has('working hours per month') && (
                              <input
                                type="number"
                                placeholder="Working hours/month"
                                value={draft.workingHoursPerMonth}
                                onChange={(e) =>
                                  setPeopleDrafts({
                                    ...peopleDrafts,
                                    [p.id]: { ...draft, workingHoursPerMonth: e.target.value },
                                  })
                                }
                                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                              />
                            )}
                            {missing.has('birth order') && (
                              <input
                                type="number"
                                placeholder="Birth order (e.g. 3 = 3rd child)"
                                value={draft.birthOrder}
                                onChange={(e) =>
                                  setPeopleDrafts({
                                    ...peopleDrafts,
                                    [p.id]: { ...draft, birthOrder: e.target.value },
                                  })
                                }
                                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}

              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}

      <Section title="Might apply">
        {actionable.length === 0 ? (
          <EmptyNote
            text={
              hasMissingInfo
                ? 'No matches yet — fill in the details above for more accurate results.'
                : 'No matches found for your household.'
            }
          />
        ) : (
          actionable.map((m) => (
            <MatchCard
              key={m.scheme.id}
              match={m}
              explain={explanations[m.scheme.id]}
              onExplain={handleExplain}
              household={household!}
              people={people}
            />
          ))
        )}
      </Section>

      <Section title="Already automatic — nothing to do here">
        {automatic.length === 0 ? (
          <EmptyNote text="None found yet." />
        ) : (
          automatic.map((m) => <AutomaticCard key={m.scheme.id} match={m} />)
        )}
      </Section>

      {needsInfo.length > 0 && (
        <Section title="Need more info to check">
          {needsInfo.map((m) => (
            <NeedsInfoCard key={m.scheme.id} match={m} />
          ))}
        </Section>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-medium text-slate-500">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-slate-400">{text}</p>
}

function MatchCard({
  match,
  explain,
  onExplain,
  household,
  people,
}: {
  match: SchemeMatch
  explain: ExplainState | undefined
  onExplain: (match: SchemeMatch) => void
  household: Household
  people: Person[]
}) {
  const { scheme } = match
  const expiring = scheme.voucherExpiry != null && daysUntil(scheme.voucherExpiry) <= 180
  const [showActionCard, setShowActionCard] = useState(false)
  const matchedPerson = people.find((p) => p.id === match.matchedPersonId) ?? null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="font-medium text-slate-900">{scheme.name}</p>
        {expiring && (
          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            Expires {scheme.voucherExpiry}
          </span>
        )}
      </div>
      {match.matchedPersonName && <p className="text-xs text-slate-500">For {match.matchedPersonName}</p>}
      <p className="mt-2 text-sm text-slate-700">{scheme.benefit}</p>

      <p className="mt-3 text-xs text-slate-500">
        Might apply — <a href={scheme.sourceUrl} target="_blank" rel="noreferrer" className="underline">source</a>,
        checked {formatDDMM(scheme.lastVerified)} — verify before applying.
      </p>

      {explain?.status === 'done' && explain.text && (
        <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm text-slate-600">{explain.text}</p>
      )}
      {explain?.status === 'error' && (
        <p className="mt-2 text-sm text-red-600">Could not generate an explanation.</p>
      )}
      {(!explain || explain.status === 'idle') && (
        <button
          onClick={() => onExplain(match)}
          className="mt-2 text-xs font-medium text-slate-600 underline"
        >
          Why might this apply?
        </button>
      )}
      {explain?.status === 'loading' && <p className="mt-2 text-xs text-slate-400">Thinking…</p>}

      {scheme.requiredDocuments.length > 0 && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Commonly required documents</summary>
          <ul className="mt-1 list-inside list-disc">
            {scheme.requiredDocuments.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}

      <button
        onClick={() => setShowActionCard(true)}
        className="mt-3 w-full rounded-md border border-slate-300 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Prepare application
      </button>

      {showActionCard && (
        <ActionCardModal
          title={scheme.name}
          purpose={`Applying for ${scheme.name}`}
          benefitOrTaskDescription={scheme.benefit}
          facts={buildPrefillFacts(household, matchedPerson)}
          requiredDocuments={scheme.requiredDocuments}
          sourceUrl={scheme.sourceUrl}
          showEmailDraft={false}
          applyAction={{ instructions: scheme.applicationInstructions, url: scheme.applicationUrl }}
          onClose={() => setShowActionCard(false)}
        />
      )}
    </div>
  )
}

function AutomaticCard({ match }: { match: SchemeMatch }) {
  const { scheme } = match
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="font-medium text-emerald-900">{scheme.name}</p>
      <p className="mt-1 text-sm text-emerald-800">{scheme.benefit}</p>
      <p className="mt-2 text-xs text-emerald-700">
        No action needed — already credited automatically.{' '}
        <a href={scheme.sourceUrl} target="_blank" rel="noreferrer" className="underline">
          Source
        </a>
        , checked {formatDDMM(scheme.lastVerified)}.
      </p>
    </div>
  )
}

function NeedsInfoCard({ match }: { match: SchemeMatch }) {
  const { scheme } = match
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900">{scheme.name}</p>
      <p className="mt-1 text-sm text-slate-500">
        Add {match.missingFields.join(', ')} to your profile above to check this one.
      </p>
    </div>
  )
}
