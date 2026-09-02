import type { Person, Business } from '@/lib/types'

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
        {people.map((person) => (
          <div
            key={person.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-slate-900">{person.name}</p>
            <p className="text-xs text-slate-500">
              {[person.age && `${person.age} yrs`, person.employmentStatus]
                .filter(Boolean)
                .join(' · ') || 'No details yet'}
            </p>
            {person.incomeBracket && (
              <p className="mt-1 text-xs text-slate-500">Income: {person.incomeBracket}</p>
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
        ))}
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
