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

export interface Household {
  id: string
  ownerId: string
  name: string
  createdAt: number
}

// Stored as a subcollection: households/{householdId}/people/{personId}
export interface Person {
  id: string
  name: string
  age: number | null
  employmentStatus: EmploymentStatus | null
  incomeBracket: string | null
  responsibilities: string[]
  preferences: Record<string, unknown>
  createdAt: number
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
  documentType: DocumentType
  summary: string
  linkedPersonId: string | null
  linkedPersonName: string | null
  renewalDate: string | null
  actionRequired: boolean
  actionDescription: string | null
  uploadedAt: number
}