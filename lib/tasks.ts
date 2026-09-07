import type { DocumentType, ExtractedDocument, Person, Responsibility, Task, TaskPriority } from './types'

export interface ChatActionResult {
  actionDescription: string
  personName: string | null
  responsibility: Responsibility | null
  dueDate: string | null
}

// Which household responsibility a document type falls under — drives
// auto-assignment to whoever ticked that responsibility during onboarding.
const RESPONSIBILITY_FOR_DOCUMENT_TYPE: Record<DocumentType, Responsibility | null> = {
  insurance_policy: 'insurance',
  bill: 'bills',
  licence: 'government matters',
  identity_document: 'government matters',
  property_document: 'property',
  employment_document: 'business',
  other: null,
}

export function responsibilityForDocumentType(type: DocumentType): Responsibility | null {
  return RESPONSIBILITY_FOR_DOCUMENT_TYPE[type]
}

// First household member who claimed this responsibility, if any. Deliberately
// simple — if several people share a responsibility, the task list still lets
// anyone reassign it to another candidate.
export function assigneeForResponsibility(responsibility: Responsibility | null, people: Person[]): Person | null {
  if (!responsibility) return null
  return people.find((p) => p.responsibilities.includes(responsibility)) ?? null
}

export function priorityForDueDate(dueDate: string | null): TaskPriority {
  if (!dueDate) return 'medium'
  const days = Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days <= 30) return 'high'
  if (days <= 90) return 'medium'
  return 'low'
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate + 'T00:00:00').getTime() < Date.now()
}

// Plain-English reason for who a task landed on (or didn't) — shown in the
// assignment popup so the auto-assignment isn't a black box.
export function assignmentReason(documentType: DocumentType, assignee: Person | null): string {
  const responsibility = responsibilityForDocumentType(documentType)
  if (!responsibility) return 'This document type has no obvious owner, so it was left unassigned.'
  if (!assignee) return `No one has claimed "${responsibility}" as a responsibility yet, so it was left unassigned.`
  return `because they've claimed "${responsibility}" as a responsibility`
}

// Whether a task is actually about contacting/notifying someone — the only
// case where drafting an email makes sense. Deterministic keyword check
// rather than an LLM guess, same reasoning as the rest of this file: most
// tasks (pay a bill, renew a licence) aren't emails at all, so the option
// should only show up where it's genuinely the next step — e.g. the
// "File claim / notify insurer" tasks a death life event generates.
const EMAIL_KEYWORDS = ['notify', 'insurer', 'claim', 'contact', 'inform']

export function taskSuggestsEmail(task: Pick<Task, 'title' | 'description'>): boolean {
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase()
  return EMAIL_KEYWORDS.some((kw) => text.includes(kw))
}

// Builds the fields for a task auto-generated from a Smart Upload result —
// caller still needs to attach id/createdAt when writing to Firestore.
export function buildTaskFromDocument(document: ExtractedDocument, people: Person[]) {
  const responsibility = responsibilityForDocumentType(document.documentType)
  const assignee = assigneeForResponsibility(responsibility, people)

  return {
    title: document.actionDescription ?? `Follow up on ${document.fileName}`,
    description: document.summary || null,
    dueDate: document.renewalDate,
    relatedPersonId: document.linkedPersonId,
    relatedPersonName: document.linkedPersonName,
    sourceDocumentId: document.id,
    sourceDocumentName: document.fileName,
    assignedPersonId: assignee?.id ?? null,
    assignedPersonName: assignee?.name ?? null,
    priority: priorityForDueDate(document.renewalDate),
    status: 'open' as const,
  }
}

// Builds task fields from a chat message the classifier decided implies a
// pending action (e.g. "bill was $120, need to pay by Friday") — same
// assignment logic as document-triggered tasks, just sourced from a message
// instead of a file.
export function buildTaskFromChat(result: ChatActionResult, people: Person[]) {
  const assignee = assigneeForResponsibility(result.responsibility, people)
  const relatedPerson = result.personName
    ? people.find((p) => p.name.toLowerCase() === result.personName!.toLowerCase())
    : undefined

  return {
    title: result.actionDescription,
    description: null,
    dueDate: result.dueDate,
    relatedPersonId: relatedPerson?.id ?? null,
    relatedPersonName: relatedPerson?.name ?? result.personName,
    sourceDocumentId: null,
    sourceDocumentName: null,
    assignedPersonId: assignee?.id ?? null,
    assignedPersonName: assignee?.name ?? null,
    priority: priorityForDueDate(result.dueDate),
    status: 'open' as const,
  }
}
