import type { EligibilityRule, Household, MatchStatus, Person, Scheme, SchemeMatch } from './types'
import { SCHEMES } from './schemes'
import { effectiveAge } from './age'

// Deterministic, rules-based matcher. No LLM involved — every decision here
// is a plain comparison against EligibilityRule fields. The only job left for
// an LLM (see app/api/explain-opportunity) is turning an already-decided
// 'matches' result into a plain-English explanation.

interface EvalContext {
  household: Household
  people: Person[]
  householdIncome: number | null
  perCapitaIncome: number | null
  householdHasCitizen: boolean
}

interface EvalResult {
  status: MatchStatus
  missing: string[]
}

function buildContext(household: Household, people: Person[]): EvalContext {
  const withIncome = people.filter((p) => p.monthlyIncome != null)
  const householdIncome =
    withIncome.length > 0 ? withIncome.reduce((sum, p) => sum + (p.monthlyIncome ?? 0), 0) : null
  const perCapitaIncome =
    householdIncome != null && people.length > 0 ? householdIncome / people.length : null

  return {
    household,
    people,
    householdIncome,
    perCapitaIncome,
    householdHasCitizen: people.some((p) => p.citizenshipStatus === 'citizen'),
  }
}

// Government schemes typically test "household income OR per-capita income,
// whichever is more favourable" rather than requiring both — e.g. MOE FAS is
// GHI ≤ $4,000 OR PCI ≤ $1,000.
function checkIncomeCeiling(rule: EligibilityRule, ctx: EvalContext): 'pass' | 'fail' | 'unknown' {
  const checks: Array<'pass' | 'fail' | 'unknown'> = []

  if (rule.maxHouseholdIncome != null) {
    checks.push(
      ctx.householdIncome == null
        ? 'unknown'
        : ctx.householdIncome <= rule.maxHouseholdIncome
        ? 'pass'
        : 'fail'
    )
  }
  if (rule.maxPerCapitaIncome != null) {
    checks.push(
      ctx.perCapitaIncome == null ? 'unknown' : ctx.perCapitaIncome <= rule.maxPerCapitaIncome ? 'pass' : 'fail'
    )
  }

  if (checks.length === 0) return 'pass'
  if (checks.includes('pass')) return 'pass'
  if (checks.includes('unknown')) return 'unknown'
  return 'fail'
}

function checkHouseholdLevelFields(rule: EligibilityRule, ctx: EvalContext): EvalResult {
  const missing: string[] = []

  if (rule.housingTypes && rule.housingTypes.length > 0) {
    if (ctx.household.housingType == null) missing.push('housing type')
    else if (!rule.housingTypes.includes(ctx.household.housingType)) return { status: 'not_eligible', missing: [] }
  }

  if (rule.maxPropertiesOwned != null) {
    if (ctx.household.propertiesOwned == null) missing.push('properties owned')
    else if (ctx.household.propertiesOwned > rule.maxPropertiesOwned) return { status: 'not_eligible', missing: [] }
  }

  if (rule.maxAnnualValue != null) {
    if (ctx.household.residentialAnnualValue == null) missing.push('residential annual value')
    else if (ctx.household.residentialAnnualValue > rule.maxAnnualValue) return { status: 'not_eligible', missing: [] }
  }

  const incomeCeiling = checkIncomeCeiling(rule, ctx)
  if (incomeCeiling === 'fail') return { status: 'not_eligible', missing: [] }
  if (incomeCeiling === 'unknown') missing.push('household income')

  return { status: missing.length > 0 ? 'insufficient_data' : 'matches', missing }
}

function checkPerson(rule: EligibilityRule, person: Person, ctx: EvalContext): EvalResult {
  const missing: string[] = []

  if (rule.citizenship && rule.citizenship.length > 0) {
    if (person.citizenshipStatus == null) missing.push('citizenship status')
    else if (!rule.citizenship.includes(person.citizenshipStatus)) return { status: 'not_eligible', missing: [] }
  }

  const age = effectiveAge(person)

  if (rule.minAge != null || rule.maxAge != null) {
    if (age == null) missing.push('age')
    else {
      if (rule.minAge != null && age < rule.minAge) return { status: 'not_eligible', missing: [] }
      if (rule.maxAge != null && age > rule.maxAge) return { status: 'not_eligible', missing: [] }
    }
  }

  if (rule.minBirthYear != null || rule.maxBirthYear != null) {
    if (age == null) missing.push('age')
    else {
      // Exact when dateOfBirth is on file; otherwise approximated from age.
      const birthYear = person.dateOfBirth
        ? new Date(person.dateOfBirth + 'T00:00:00').getFullYear()
        : new Date().getFullYear() - age
      if (rule.minBirthYear != null && birthYear < rule.minBirthYear) return { status: 'not_eligible', missing: [] }
      if (rule.maxBirthYear != null && birthYear > rule.maxBirthYear) return { status: 'not_eligible', missing: [] }
    }
  }

  if (rule.employmentStatuses && rule.employmentStatuses.length > 0) {
    if (person.employmentStatus == null) missing.push('employment status')
    else if (!rule.employmentStatuses.includes(person.employmentStatus)) return { status: 'not_eligible', missing: [] }
  }

  if (rule.minMonthlyIncome != null || rule.maxMonthlyIncome != null) {
    if (person.monthlyIncome == null) missing.push('monthly income')
    else {
      if (rule.minMonthlyIncome != null && person.monthlyIncome < rule.minMonthlyIncome)
        return { status: 'not_eligible', missing: [] }
      if (rule.maxMonthlyIncome != null && person.monthlyIncome > rule.maxMonthlyIncome)
        return { status: 'not_eligible', missing: [] }
    }
  }

  if (rule.minWorkingHoursPerMonth != null) {
    if (person.workingHoursPerMonth == null) missing.push('working hours per month')
    else if (person.workingHoursPerMonth < rule.minWorkingHoursPerMonth) return { status: 'not_eligible', missing: [] }
  }

  if (rule.minBirthOrder != null) {
    if (person.birthOrder == null) missing.push('birth order')
    else if (person.birthOrder < rule.minBirthOrder) return { status: 'not_eligible', missing: [] }
  }

  const householdLevel = checkHouseholdLevelFields(rule, ctx)
  if (householdLevel.status === 'not_eligible') return householdLevel
  missing.push(...householdLevel.missing)

  return { status: missing.length > 0 ? 'insufficient_data' : 'matches', missing }
}

function checkHousehold(rule: EligibilityRule, ctx: EvalContext): EvalResult {
  const missing: string[] = []

  if (rule.requiresHouseholdCitizen && !ctx.householdHasCitizen) {
    // Could be genuinely ineligible, or just missing citizenship data for
    // everyone in the household — don't conflate "unknown" with "no".
    const anyUnknown = ctx.people.some((p) => p.citizenshipStatus == null)
    if (anyUnknown) missing.push('citizenship status')
    else return { status: 'not_eligible', missing: [] }
  }

  const householdLevel = checkHouseholdLevelFields(rule, ctx)
  if (householdLevel.status === 'not_eligible') return householdLevel
  missing.push(...householdLevel.missing)

  return { status: missing.length > 0 ? 'insufficient_data' : 'matches', missing }
}

function matchScheme(scheme: Scheme, ctx: EvalContext): SchemeMatch {
  if (scheme.appliesTo === 'household') {
    const result = checkHousehold(scheme.eligibility, ctx)
    return {
      scheme,
      status: result.status,
      matchedPersonId: null,
      matchedPersonName: null,
      missingFields: result.missing,
    }
  }

  // A person with no `relationship` set (common for pre-existing family
  // graph data) is treated as an ambiguous candidate for either an 'adult'
  // or 'child' scheme — the scheme's own age bounds do the real filtering.
  const candidates = ctx.people.filter((p) => {
    if (scheme.appliesTo === 'child') return p.relationship !== 'self' && p.relationship !== 'spouse'
    return p.relationship !== 'child'
  })

  let best: { result: EvalResult; person: Person } | null = null
  for (const person of candidates) {
    const result = checkPerson(scheme.eligibility, person, ctx)
    if (result.status === 'matches') {
      best = { result, person }
      break
    }
    if (result.status === 'insufficient_data' && (!best || best.result.status !== 'insufficient_data')) {
      best = { result, person }
    }
  }

  if (!best) {
    return { scheme, status: 'not_eligible', matchedPersonId: null, matchedPersonName: null, missingFields: [] }
  }

  return {
    scheme,
    status: best.result.status,
    matchedPersonId: best.person.id,
    matchedPersonName: best.person.name,
    missingFields: best.result.missing,
  }
}

export function matchHousehold(household: Household, people: Person[]): SchemeMatch[] {
  // A deceased person is no longer part of the living household — excluded
  // from every downstream calculation (candidate matching, income totals,
  // per-capita denominator, citizen-presence checks).
  const livingPeople = people.filter((p) => p.status !== 'deceased')
  const ctx = buildContext(household, livingPeople)
  return SCHEMES.map((scheme) => matchScheme(scheme, ctx))
}
