import type { EmploymentStatus, ExtractedDocument, LifeEventType, Person, Task, TaskPriority } from './types'

export const LIFE_EVENT_TYPES: LifeEventType[] = [
  'birth',
  'marriage',
  'new_job',
  'job_loss',
  'retirement',
  'moving',
  'starting_business',
  'death',
]

export const LIFE_EVENT_LABELS: Record<LifeEventType, string> = {
  birth: 'New child',
  marriage: 'Marriage',
  new_job: 'New job',
  job_loss: 'Job loss',
  retirement: 'Retirement',
  moving: 'Moving',
  starting_business: 'Starting a business',
  death: 'Death in the family',
}

export const LIFE_EVENT_DESCRIPTIONS: Record<LifeEventType, string> = {
  birth: 'Add a new child and re-check childcare and education support.',
  marriage: 'Add a spouse to the household.',
  new_job: "Update someone's employment status and re-check income-based support.",
  job_loss: "Update someone's employment status and re-check income-based support.",
  retirement: "Update someone's employment status and re-check retirement support.",
  moving: 'Flag housing details for review — they drive several eligibility rules.',
  starting_business: 'Flag the household for business-related support to add later.',
  death: "Reassign their open tasks, flag their documents for follow-up, and re-check the household's support.",
}

// Which life events need an existing person selected vs. a new person's name.
export function lifeEventNeedsExistingPerson(type: LifeEventType): boolean {
  return type === 'new_job' || type === 'job_loss' || type === 'retirement' || type === 'death'
}

export function lifeEventNeedsNewPersonName(type: LifeEventType): boolean {
  return type === 'birth' || type === 'marriage'
}

export interface LifeEventInput {
  type: LifeEventType
  affectedPersonId: string | null
  newPersonName: string | null
}

export interface PersonUpdate {
  personId: string
  update: Partial<Person>
}

export interface TaskUpdate {
  taskId: string
  update: Partial<Task>
}

export interface LifeEventPlan {
  personUpdates: PersonUpdate[]
  newPerson: Omit<Person, 'id'> | null
  taskUpdates: TaskUpdate[]
  newTasks: Array<Omit<Task, 'id'>>
  summaryLines: string[]
}

function emptyPersonDraft(overrides: Partial<Omit<Person, 'id'>>): Omit<Person, 'id'> {
  return {
    name: '',
    age: null,
    dateOfBirth: null,
    employmentStatus: null,
    incomeBracket: null,
    responsibilities: [],
    preferences: {},
    createdAt: Date.now(),
    citizenshipStatus: null,
    relationship: null,
    monthlyIncome: null,
    workingHoursPerMonth: null,
    birthOrder: null,
    status: 'active',
    ...overrides,
  }
}

function newTaskDraft(overrides: Partial<Omit<Task, 'id'>> & Pick<Task, 'title'>): Omit<Task, 'id'> {
  return {
    description: null,
    dueDate: null,
    relatedPersonId: null,
    relatedPersonName: null,
    sourceDocumentId: null,
    sourceDocumentName: null,
    assignedPersonId: null,
    assignedPersonName: null,
    priority: 'medium' as TaskPriority,
    status: 'open',
    createdAt: Date.now(),
    ...overrides,
  }
}

// Pure planning function — computes what SHOULD change, without touching
// Firestore. The caller (the page) is responsible for actually writing the
// plan, so this stays easy to reason about and to preview before applying.
export function planLifeEvent(
  input: LifeEventInput,
  people: Person[],
  documents: ExtractedDocument[],
  tasks: Task[]
): LifeEventPlan {
  const plan: LifeEventPlan = { personUpdates: [], newPerson: null, taskUpdates: [], newTasks: [], summaryLines: [] }
  const livingPeople = people.filter((p) => p.status !== 'deceased')

  switch (input.type) {
    case 'birth': {
      const name = input.newPersonName?.trim() || 'New child'
      const birthOrder = livingPeople.filter((p) => p.relationship === 'child').length + 1
      const today = new Date().toISOString().slice(0, 10)
      plan.newPerson = emptyPersonDraft({ name, dateOfBirth: today, relationship: 'child', birthOrder })
      plan.summaryLines.push(`Added ${name} as a new child (birth order ${birthOrder}).`)
      plan.summaryLines.push('Re-checked Opportunity Discovery for childcare and education support.')
      break
    }

    case 'marriage': {
      const name = input.newPersonName?.trim() || 'New spouse'
      plan.newPerson = emptyPersonDraft({ name, relationship: 'spouse' })
      plan.summaryLines.push(`Added ${name} as a spouse.`)
      plan.summaryLines.push("Re-checked Opportunity Discovery now that the household's composition changed.")
      break
    }

    case 'new_job':
    case 'job_loss':
    case 'retirement': {
      const person = livingPeople.find((p) => p.id === input.affectedPersonId)
      if (person) {
        const employmentStatus: EmploymentStatus =
          input.type === 'new_job' ? 'employed' : input.type === 'job_loss' ? 'unemployed' : 'retired'
        plan.personUpdates.push({ personId: person.id, update: { employmentStatus } })
        plan.summaryLines.push(`Updated ${person.name}'s employment status to "${employmentStatus}".`)
        plan.summaryLines.push('Re-checked Opportunity Discovery for income-based support.')
      }
      break
    }

    case 'moving': {
      plan.summaryLines.push(
        'Housing type, properties owned, or home value may have changed — update them on Edit Details so Opportunity Discovery stays accurate.'
      )
      break
    }

    case 'starting_business': {
      plan.summaryLines.push(
        "Add the business under Edit Details — business-specific schemes (e.g. Startup SG Founder) can't be re-checked until it's on record."
      )
      break
    }

    case 'death': {
      const person = livingPeople.find((p) => p.id === input.affectedPersonId)
      if (person) {
        plan.personUpdates.push({ personId: person.id, update: { status: 'deceased' } })
        plan.summaryLines.push(`Marked ${person.name} as deceased.`)

        const linkedDocs = documents.filter((d) => d.linkedPersonId === person.id)
        for (const doc of linkedDocs) {
          if (doc.documentType === 'insurance_policy') {
            plan.newTasks.push(
              newTaskDraft({
                title: `File claim / notify insurer — ${doc.fileName}`,
                description: `Insurance policy linked to ${person.name}. Contact the provider to start a claim or update the nominee.`,
                relatedPersonId: person.id,
                relatedPersonName: person.name,
                sourceDocumentId: doc.id,
                sourceDocumentName: doc.fileName,
                priority: 'high',
              })
            )
          } else {
            plan.newTasks.push(
              newTaskDraft({
                title: `Review document — ${doc.fileName}`,
                description: `Previously linked to ${person.name}. Check whether it needs to be reassigned, closed, or updated.`,
                relatedPersonId: person.id,
                relatedPersonName: person.name,
                sourceDocumentId: doc.id,
                sourceDocumentName: doc.fileName,
                priority: 'medium',
              })
            )
          }
        }
        if (linkedDocs.length > 0) {
          plan.summaryLines.push(
            `Found ${linkedDocs.length} document(s) linked to ${person.name} — generated a follow-up task for each.`
          )
        }

        const survivors = livingPeople.filter((p) => p.id !== person.id)
        const nextOfKin =
          survivors.find((p) => p.relationship === 'self' || p.relationship === 'spouse') ?? survivors[0] ?? null

        const affectedTasks = tasks.filter((t) => t.status === 'open' && t.assignedPersonId === person.id)
        for (const t of affectedTasks) {
          plan.taskUpdates.push({
            taskId: t.id,
            update: { assignedPersonId: nextOfKin?.id ?? null, assignedPersonName: nextOfKin?.name ?? null },
          })
        }
        if (affectedTasks.length > 0) {
          plan.summaryLines.push(
            `Reassigned ${affectedTasks.length} open task(s) from ${person.name} to ${nextOfKin?.name ?? 'unassigned'}.`
          )
        }

        plan.summaryLines.push("Re-checked Opportunity Discovery now that the household's composition changed.")
      }
      break
    }
  }

  return plan
}

// Applies a plan's person mutations locally (no Firestore) so the caller can
// preview newly-surfaced Opportunity Discovery matches before committing.
export function applyPlanToPeopleLocally(people: Person[], plan: LifeEventPlan): Person[] {
  let next = people.map((p) => {
    const update = plan.personUpdates.find((u) => u.personId === p.id)
    return update ? { ...p, ...update.update } : p
  })
  if (plan.newPerson) {
    next = [...next, { id: '__preview__', ...plan.newPerson }]
  }
  return next
}
