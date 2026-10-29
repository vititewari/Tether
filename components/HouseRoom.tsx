'use client';

import { ReactNode } from 'react';
import { RoomState, RoomMetrics } from '@/lib/roomHealth';
import { Task } from '@/lib/taskTypes';

interface HouseRoomProps {
  title: string;
  description: string;
  icon: ReactNode;
  state: RoomState;
  metrics: RoomMetrics;
  onClick: () => void;
}

export default function HouseRoom({
  title,
  description,
  icon,
  state,
  metrics,
}: HouseRoomProps) {
  const { totalTasks, overdueCount, financialImpact, urgentTask } = metrics;
  const decayLevel = state === 'thriving' ? 0 : state === 'attention' ? 1 : 2;

  const containerClasses = getContainerClasses(decayLevel);
  const iconClasses = getIconClasses(decayLevel);
  const textClasses = getTextClasses(decayLevel);

  const tooltipText = getTooltipText(title, urgentTask, metrics);

  return (
    <button
      type="button"
      onClick={() => {}}
      className={`relative flex flex-col items-center justify-center rounded-lg p-6 transition-all duration-300 ${containerClasses}`}
      title={tooltipText}
      aria-label={`${title}: ${tooltipText}`}
    >
      {decayLevel >= 1 && <DecayOverlay level={decayLevel} />}

      <div className="relative z-10 text-center">
        <div className={`mb-3 flex justify-center text-4xl ${iconClasses}`}>{icon}</div>
        <h3 className={`text-base font-semibold ${textClasses}`}>{title}</h3>
        <p className={`mt-1 text-xs ${textClasses} opacity-75`}>{description}</p>

        {totalTasks > 0 && (
          <div className="mt-3 inline-block rounded-full bg-black bg-opacity-10 px-2 py-1 text-xs font-medium">
            {overdueCount > 0 ? (
              <span className="text-rose-700">{overdueCount} overdue</span>
            ) : (
              <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {financialImpact > 0 && (
          <div className="mt-2 text-xs font-medium text-amber-700">
            ${financialImpact.toLocaleString()}
          </div>
        )}
      </div>

      <div
        className="absolute right-2 top-2 h-3 w-3 rounded-full"
        style={{ backgroundColor: getSeverityColor(state) }}
        aria-hidden="true"
      />
    </button>
  );
}

function DecayOverlay({ level }: { level: number }) {
  if (level === 0) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full rounded-lg"
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="dust" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={level === 1 ? 2 : 4} />
        </filter>
      </defs>

      <rect
        width="400"
        height="300"
        fill={level === 1 ? '#f3f4f6' : '#d4d4d8'}
        opacity={level === 1 ? 0.15 : 0.3}
      />
    </svg>
  );
}

function getContainerClasses(decayLevel: number): string {
  if (decayLevel === 0) {
    return 'bg-white shadow-md hover:shadow-lg border border-slate-200';
  }
  if (decayLevel === 1) {
    return 'bg-gradient-to-b from-[rgba(254,243,232,0.4)] to-[rgba(253,233,213,0.35)] shadow-sm hover:shadow-md border border-slate-300';
  }
  return 'bg-slate-200 shadow-lg hover:shadow-xl border border-slate-400 saturate-50';
}

function getIconClasses(decayLevel: number): string {
  if (decayLevel === 0) return 'text-slate-700';
  if (decayLevel === 1) return 'text-slate-500 opacity-85';
  return 'text-slate-600 opacity-60';
}

function getTextClasses(decayLevel: number): string {
  if (decayLevel === 0) return 'text-slate-900';
  if (decayLevel === 1) return 'text-slate-700';
  return 'text-slate-600';
}

function getSeverityColor(state: RoomState): string {
  if (state === 'thriving') return '#10b981';
  if (state === 'attention') return '#f59e0b';
  return '#ef4444';
}

function getTooltipText(title: string, urgentTask: Task | null, metrics: RoomMetrics): string {
  if (!urgentTask) {
    return `${title}: No tasks — all clear`;
  }

  const { overdueCount, financialImpact } = metrics;
  const days = Math.ceil(
    (new Date(urgentTask.dueDate || '').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  let tooltip = `${urgentTask.title}`;
  if (days < 0) {
    tooltip += ` — Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
  } else if (days === 0) {
    tooltip += ` — Due today`;
  } else {
    tooltip += ` — Due in ${days} day${days !== 1 ? 's' : ''}`;
  }

  if (overdueCount > 1) {
    tooltip += ` (+${overdueCount - 1} more overdue)`;
  }

  if (financialImpact > 0) {
    tooltip += ` • $${financialImpact.toLocaleString()} at risk`;
  }

  return tooltip;
}
