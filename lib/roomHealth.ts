import { Task } from './taskTypes';

export type RoomState = 'thriving' | 'attention' | 'crumbling';

export interface RoomMetrics {
  state: RoomState;
  totalTasks: number;
  overdueCount: number;
  dueWithin7: number;
  maxOverduesDays: number | null;
  financialImpact: number;
  urgentTask: Task | null;
}

export function calculateRoomSeverity(
  totalTasks: number,
  overdueCount: number,
  dueWithin7: number,
  maxOverduesDays: number | null,
): RoomState {
  if (totalTasks === 0) return 'thriving';
  if (overdueCount >= 3 || (maxOverduesDays !== null && maxOverduesDays >= 30)) {
    return 'crumbling';
  }
  if (overdueCount >= 1 || dueWithin7 >= 2) {
    return 'attention';
  }
  return 'thriving';
}

export function calculateRoomMetrics(tasks: Task[], now: Date): RoomMetrics {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'dismissed');

  let overdueCount = 0;
  let dueWithin7 = 0;
  let maxOverduesDays: number | null = null;
  let totalFinancialImpact = 0;
  let urgentTask: Task | null = null;

  for (const task of open) {
    const days = daysUntil(task.dueDate, now);

    if (days !== null && days < 0) {
      overdueCount++;
      if (maxOverduesDays === null || days < maxOverduesDays) {
        maxOverduesDays = days;
      }
    }

    if (days !== null && days >= 0 && days <= 7) {
      dueWithin7++;
    }

    if (task.financialImpact) {
      totalFinancialImpact += task.financialImpact;
    }

    if (!urgentTask) {
      urgentTask = task;
    } else if (
      daysUntil(task.dueDate, now) !== null &&
      daysUntil(urgentTask.dueDate, now) !== null &&
      daysUntil(task.dueDate, now)! < daysUntil(urgentTask.dueDate, now)!
    ) {
      urgentTask = task;
    }
  }

  return {
    state: calculateRoomSeverity(open.length, overdueCount, dueWithin7, maxOverduesDays),
    totalTasks: open.length,
    overdueCount,
    dueWithin7,
    maxOverduesDays,
    financialImpact: totalFinancialImpact,
    urgentTask,
  };
}

function daysUntil(dueDate: string | null, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const diff = due.getTime() - now.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export interface DocumentMetrics {
  state: RoomState;
  totalDocuments: number;
  failedCount: number;
  uncategorizedCount: number;
}

export function calculateDocumentHealth(
  docs: Array<{ documentType?: string | null; extractionFailed?: boolean }>,
): DocumentMetrics {
  if (docs.length === 0) {
    return { state: 'thriving', totalDocuments: 0, failedCount: 0, uncategorizedCount: 0 };
  }

  const failedCount = docs.filter((d) => d.extractionFailed).length;
  const uncategorizedCount = docs.filter((d) => !d.documentType || d.documentType === 'other').length;

  const failureRatio = failedCount / docs.length;
  const uncategorizedRatio = uncategorizedCount / docs.length;

  let state: RoomState;

  if (failureRatio >= 0.4 || failedCount >= 2) {
    state = 'crumbling';
  } else if (uncategorizedRatio >= 0.5 || uncategorizedCount >= 2) {
    state = 'attention';
  } else {
    state = 'thriving';
  }

  return { state, totalDocuments: docs.length, failedCount, uncategorizedCount };
}
