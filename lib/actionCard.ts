import type { CitizenshipStatus, Household, Person, PersonRelationship } from './types'
import { effectiveAge } from './age'

export interface PrefillFact {
  label: string
  value: string
}

const CITIZENSHIP_LABELS: Record<CitizenshipStatus, string> = {
  citizen: 'Singapore Citizen',
  pr: 'Permanent Resident',
  other: 'Other',
}

const RELATIONSHIP_LABELS: Record<PersonRelationship, string> = {
  self: 'Self',
  spouse: 'Spouse',
  child: 'Child',
  other: 'Other',
}

// Every fact here is read directly off a Firestore field the user themselves
// entered — nothing computed or guessed. This list is what gets handed to
// the email-draft LLM and the summary PDF, so anything NOT on file simply
// doesn't appear here rather than being invented downstream.
export function buildPrefillFacts(household: Household, person: Person | null): PrefillFact[] {
  const facts: PrefillFact[] = [{ label: 'Household', value: household.name }]

  if (person) {
    facts.push({ label: 'Name', value: person.name })
    const age = effectiveAge(person)
    if (age != null) facts.push({ label: 'Age', value: String(age) })
    if (person.citizenshipStatus) facts.push({ label: 'Citizenship', value: CITIZENSHIP_LABELS[person.citizenshipStatus] })
    if (person.relationship) facts.push({ label: 'Relationship to household', value: RELATIONSHIP_LABELS[person.relationship] })
    if (person.employmentStatus) facts.push({ label: 'Employment status', value: person.employmentStatus })
    if (person.monthlyIncome != null) facts.push({ label: 'Monthly income', value: `$${person.monthlyIncome.toLocaleString()}` })
  }

  if (household.housingType) facts.push({ label: 'Housing type', value: household.housingType.replace(/_/g, ' ') })

  return facts
}
