import type { Person, Business } from '@/lib/types'
import { effectiveAge } from '@/lib/age'

export default function FamilyTree({
  householdName,
  people,
  businesses,
}: {
  householdName: string
  people: Person[]
  businesses: Business[]
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">{householdName}</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person) => {
          const age = effectiveAge(person)
          return (
          <div
            key={person.id}
            className={`rounded-lg border p-4 shadow-sm ${
              person.status === 'deceased' ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="font-medium text-slate-900">
              {person.name}
              {person.status === 'deceased' && <span className="ml-2 text-xs font-normal text-slate-400">(deceased)</span>}
            </p>
            <p className="text-xs text-slate-500">
              {[age != null && `${age} yrs`, person.employmentStatus]
                .filter(Boolean)
                .join(' · ') || 'No details yet'}
            </p>
            {person.monthlyIncome != null && (
              <p className="mt-1 text-xs text-slate-500">
                Income: ${person.monthlyIncome.toLocaleString()}/mo
              </p>
            )}
            {person.responsibilities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {person.responsibilities.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>

      {businesses.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-500">Family business</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <div
                key={b.id}
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm"
              >
                <p className="font-medium text-slate-900">{b.name}</p>
                <p className="text-xs text-slate-500">
                  {[b.industry, b.employeeCount && `${b.employeeCount} employees`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {b.revenueBracket && (
                  <p className="mt-1 text-xs text-slate-500">Revenue: {b.revenueBracket}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
