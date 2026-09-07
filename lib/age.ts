import type { Person } from './types'

// Full years elapsed since dateOfBirth, as of right now — recomputed on every
// call, so it moves on its own each birthday instead of going stale like a
// stored integer would.
export function computeAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth + 'T00:00:00')
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const hadBirthdayThisYear =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate())
  if (!hadBirthdayThisYear) age--
  return age
}

// The age to actually use anywhere in the app — prefers a live computation
// from dateOfBirth, falling back to the legacy stored `age` for people added
// before dateOfBirth was collected.
export function effectiveAge(person: Pick<Person, 'dateOfBirth' | 'age'>): number | null {
  const computed = computeAge(person.dateOfBirth)
  return computed ?? person.age
}
