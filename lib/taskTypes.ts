export type TaskCategory =
  | 'insurance'
  | 'education'
  | 'business'
  | 'housing'
  | 'health'
  | 'identity'
  | 'finance'
  | 'other';

export const TASK_CATEGORIES: TaskCategory[] = [
  'insurance',
  'education',
  'business',
  'housing',
  'health',
  'identity',
  'finance',
  'other',
];

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskSourceType = 'document' | 'opportunity' | 'life_event' | 'manual';

export interface TaskSource {
  type: TaskSourceType;
  refId: string | null;
  label?: string | null;
}

export type TaskHistoryAction =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'escalated'
  | 'status_changed'
  | 'completed';

export interface TaskHistoryEntry {
  at: string;
  action: TaskHistoryAction;
  reason: string;
  actor: 'agent' | 'user';
  from?: string | null;
  to?: string | null;
}

export interface Task {
  id: string;
  householdId: string;
  title: string;
  description: string;
  category: TaskCategory;
  dueDate: string | null;
  source: TaskSource;
  relatedPersonId: string | null;
  relatedPersonName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignmentReason: string;
  status: TaskStatus;
  priority: TaskPriority;
  escalationLevel: number;
  reassignedByAgent: boolean;
  history: TaskHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  financialImpact?: number | null;
  isPayment?: boolean;
  paymentFrequency?: 'once' | 'monthly' | 'yearly';
}

export type NewTask = Omit<Task, 'id'>;
