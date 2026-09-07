'use client'

import type { Person, Task } from '@/lib/types'

export default function TaskAssignedModal({
  task,
  people,
  reason,
  onChangeAssignee,
  onClose,
}: {
  task: Task
  people: Person[]
  reason: string
  onChangeAssignee: (personId: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <p className="mb-1 text-sm font-medium text-slate-900">Task created</p>
        <p className="mb-4 text-sm text-slate-600">
          &ldquo;{task.title}&rdquo; was assigned to{' '}
          <span className="font-medium text-slate-900">{task.assignedPersonName ?? 'no one'}</span> {reason}.
        </p>

        <label className="mb-1 block text-xs font-medium text-slate-500">Assign to</label>
        <select
          value={task.assignedPersonId ?? ''}
          onChange={(e) => onChangeAssignee(e.target.value)}
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          onClick={onClose}
          className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
