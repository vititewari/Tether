export type EmploymentStatus =
  | 'employed'
  | 'self-employed'
  | 'student'
  | 'retired'
  | 'unemployed'
  | 'other'

export const RESPONSIBILITY_OPTIONS = [
  'insurance',
  'bills',
  'government matters',
  'healthcare admin',
  'business',
  'property',
] as const

export type Responsibility = (typeof RESPONSIBILITY_OPTIONS)[number]

export type CitizenshipStatus = 'citizen' | 'pr' | 'other'

export type PersonRelationship = 'self' | 'spouse' | 'child' | 'other'

export const HOUSING_TYPES = [
  'hdb_1_2',
  'hdb_3',
  'hdb_4',
  'hdb_5',
  'hdb_exec_or_multigen',
  'private_property',
] as const

export type HousingType = (typeof HOUSING_TYPES)[number]

export const HOUSING_TYPE_LABELS: Record<HousingType, string> = {
  hdb_1_2: 'HDB 1–2 room',
  hdb_3: 'HDB 3-room',
  hdb_4: 'HDB 4-room',
  hdb_5: 'HDB 5-room',
  hdb_exec_or_multigen: 'HDB Executive / Multi-Generation',
  private_property: 'Private property',
}

export interface Household {
  id: string
  ownerId: string
  name: string
  createdAt: number
  // Opportunity Discovery profile fields — collected during onboarding;
  // nullable because households created before this field existed won't have
  // it, and /opportunities prompts for anything still missing.
  housingType: HousingType | null
  propertiesOwned: number | null
  residentialAnnualValue: number | null
  // Chat ingestion — Telegram linking. A short one-time code shown in the
  // app; the Telegram bot matches it against a household to link a chat.
  telegramLinkCode: string | null
  telegramChatId: string | null
}

// Stored as a subcollection: households/{householdId}/people/{personId}
export interface Person {
  id: string
  name: string
  // Legacy manual entry — kept only as a fallback for people added before
  // dateOfBirth existed. Never written by new forms; never trust it over a
  // present dateOfBirth. Use effectiveAge() from lib/age.ts, not this field
  // directly, everywhere age is actually needed.
  age: number | null
  // Source of truth for age going forward — lets age move on its own each
  // year instead of going stale like a stored integer would.
  dateOfBirth: string | null // ISO date
  employmentStatus: EmploymentStatus | null
  incomeBracket: string | null
  responsibilities: string[]
  preferences: Record<string, unknown>
  createdAt: number
  // Opportunity Discovery profile fields — collected during onboarding; see
  // note on Household above.
  citizenshipStatus: CitizenshipStatus | null
  relationship: PersonRelationship | null
  monthlyIncome: number | null
  workingHoursPerMonth: number | null
  // Birth order among children in the household, e.g. 3 = third child born —
  // only meaningful when relationship === 'child'. Used by schemes like the
  // Large Families Scheme that key off "3rd or subsequent child".
  birthOrder: number | null
  // Life Events (Module 5) — set to 'deceased' by a death event. Deceased
  // people are excluded from Opportunity Discovery matching but kept on
  // record so their documents/tasks keep a name to point back to.
  status: 'active' | 'deceased' | null
}

// Stored as a subcollection: households/{householdId}/businesses/{businessId}
export interface Business {
  id: string
  name: string
  industry: string | null
  employeeCount: number | null
  revenueBracket: string | null
  createdAt: number
}

export type DocumentType =
  | 'insurance_policy'
  | 'bill'
  | 'licence'
  | 'identity_document'
  | 'property_document'
  | 'employment_document'
  | 'other'

export interface ExtractedDocument {
  id: string
  fileName: string
  storagePath: string
  // Firebase Storage download URL, captured at upload time — null for
  // documents uploaded before this field existed (the UI falls back to
  // fetching it on demand via storagePath in that case).
  fileUrl: string | null
  documentType: DocumentType
  summary: string
  linkedPersonId: string | null
  linkedPersonName: string | null
  renewalDate: string | null
  actionRequired: boolean
  actionDescription: string | null
  uploadedAt: number
}

// ---- Admin Tasks (Module 3) ----

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'open' | 'done' | 'dismissed'

// Stored as a subcollection: households/{householdId}/tasks/{taskId}
export interface Task {
  id: string
  title: string
  description: string | null
  dueDate: string | null // ISO date
  relatedPersonId: string | null
  relatedPersonName: string | null
  sourceDocumentId: string | null
  sourceDocumentName: string | null
  assignedPersonId: string | null
  assignedPersonName: string | null
  priority: TaskPriority
  status: TaskStatus
  createdAt: number
}

// ---- Opportunity Discovery (Module 4) ----

export type SchemeCategory =
  | 'education'
  | 'childcare'
  | 'income_support'
  | 'retirement'
  | 'business'
  | 'family'
  | 'vouchers'
  | 'utilities'

// Who the eligibility rule is evaluated against: the household as a whole,
// any adult member, or any child member.
export type SchemeAppliesTo = 'household' | 'adult' | 'child'

// Deliberately data, not code — a rules-based matcher reads this declaratively
// so the LLM is never in the loop for the eligibility decision itself.
export interface EligibilityRule {
  citizenship?: CitizenshipStatus[]
  minAge?: number
  maxAge?: number
  // Approximate birth year bounds, derived from the person's `age` at
  // evaluation time. Government cutoffs are usually exact dates; without
  // collecting date of birth this is a best-effort proxy — schemes using it
  // carry a caveat.
  minBirthYear?: number
  maxBirthYear?: number
  employmentStatuses?: EmploymentStatus[]
  minMonthlyIncome?: number
  maxMonthlyIncome?: number
  maxHouseholdIncome?: number
  maxPerCapitaIncome?: number
  minWorkingHoursPerMonth?: number
  housingTypes?: HousingType[]
  maxPropertiesOwned?: number
  maxAnnualValue?: number
  // e.g. 3 => this person must be the 3rd or later child born into the family.
  minBirthOrder?: number
  // At least one household member must be a Singapore Citizen (checked across
  // all people regardless of whose rule is being evaluated).
  requiresHouseholdCitizen?: boolean
}

// How a household actually applies — researched per scheme (see lib/schemes.ts).
// None of the 15 schemes in this dataset have a real fillable PDF form to
// autofill: they're either a Singpass/LifeSG web portal, fully automatic,
// or handled in person through a school/kindergarten/mentor partner. This
// drives the Opportunities "Start application" action honestly rather than
// pretending a document exists where it doesn't.
export type ApplicationChannel = 'portal' | 'school' | 'kindergarten' | 'business_process' | 'automatic'

export interface Scheme {
  id: string
  name: string
  category: SchemeCategory
  description: string
  appliesTo: SchemeAppliesTo
  eligibility: EligibilityRule
  requiredDocuments: string[]
  benefit: string
  isAutomatic: boolean
  sourceUrl: string
  lastVerified: string // ISO date
  caveats?: string[]
  // Present for time-limited vouchers so the UI can flag "expiring soon".
  voucherExpiry?: string // ISO date
  applicationChannel: ApplicationChannel
  // The real place to apply — a Singpass/LifeSG portal URL when one exists,
  // otherwise an informational page. Null only for fully automatic schemes.
  applicationUrl: string | null
  applicationInstructions: string
}

export type MatchStatus = 'matches' | 'insufficient_data' | 'not_eligible'

export interface SchemeMatch {
  scheme: Scheme
  status: MatchStatus
  matchedPersonId: string | null
  matchedPersonName: string | null
  missingFields: string[]
}

// ---- Life Events (Module 5) ----

export type LifeEventType =
  | 'birth'
  | 'marriage'
  | 'new_job'
  | 'job_loss'
  | 'moving'
  | 'retirement'
  | 'starting_business'
  | 'death'

// Stored as a subcollection: households/{householdId}/lifeEvents/{eventId}.
// A record of what changed and what the agent did in response — the "what
// happened, and what did we do about it" trail for the household.
export interface LifeEvent {
  id: string
  type: LifeEventType
  affectedPersonId: string | null
  affectedPersonName: string | null
  summaryLines: string[]
  newlyMatchedSchemeNames: string[]
  createdAt: number
}

// ---- Chat ingestion ----

// A purely informational log with no pending action — e.g. "Kai went to the
// doctor today" with nothing to pay or follow up on. Kept separate from Task
// so the task list never fills up with things nobody has to actually do.
// Stored as a subcollection: households/{householdId}/notes/{noteId}
export interface Note {
  id: string
  text: string
  personId: string | null
  personName: string | null
  source: 'chat'
  createdAt: number
}

export type ChatMessageRole = 'user' | 'agent'
export type ChatInputKind = 'text' | 'file' | 'audio'

// Stored as a subcollection: households/{householdId}/chatMessages/{messageId}
export interface ChatMessage {
  id: string
  role: ChatMessageRole
  text: string
  inputKind: ChatInputKind
  createdAt: number
}