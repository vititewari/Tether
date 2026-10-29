'use client';

import { useMemo } from 'react';
import HouseIllustration from '@/components/HouseIllustration';
import {
  DocumentIcon,
  FinanceIcon,
  FamilyIcon,
  BillsIcon,
  TasksIcon,
  BenefitsIcon,
} from '@/components/RoomIcons';
import type { RoomMetrics } from '@/lib/roomHealth';
import type { Task } from '@/lib/taskTypes';

export default function DesignPage() {
  const now = new Date();

  const mockTasks: Task[] = [
    {
      id: '1',
      householdId: 'test',
      title: 'Review life insurance',
      description: 'Check coverage and beneficiaries',
      category: 'insurance',
      dueDate: '2026-11-15',
      source: { type: 'document', refId: null },
      relatedPersonId: null,
      relatedPersonName: null,
      assigneeId: null,
      assigneeName: null,
      assignmentReason: '',
      status: 'open',
      priority: 'high',
      escalationLevel: 0,
      reassignedByAgent: false,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    },
  ];

  const thrivingMetrics: RoomMetrics = {
    state: 'thriving',
    totalTasks: 0,
    overdueCount: 0,
    dueWithin7: 0,
    maxOverduesDays: null,
    financialImpact: 0,
    urgentTask: null,
  };

  const attentionMetrics: RoomMetrics = {
    state: 'attention',
    totalTasks: 3,
    overdueCount: 1,
    dueWithin7: 2,
    maxOverduesDays: -2,
    financialImpact: 500,
    urgentTask: mockTasks[0],
  };

  const crumblingMetrics: RoomMetrics = {
    state: 'crumbling',
    totalTasks: 5,
    overdueCount: 3,
    dueWithin7: 1,
    maxOverduesDays: -35,
    financialImpact: 5000,
    urgentTask: mockTasks[0],
  };

  const buildHouse = (metrics: RoomMetrics) => [
    { id: 'documents', title: 'Documents', subtitle: 'All your papers, in one place', icon: <DocumentIcon />, metrics, onClick: () => {} },
    { id: 'finance-insurance', title: 'Finances & Insurance', subtitle: 'Policies, accounts, overview', icon: <FinanceIcon />, metrics, onClick: () => {} },
    { id: 'family', title: 'Family', subtitle: 'Profiles, roles, responsibilities', icon: <FamilyIcon />, metrics, onClick: () => {} },
    { id: 'bills-payments', title: 'Bills & Payments', subtitle: 'Due dates and payment history', icon: <BillsIcon />, metrics, onClick: () => {} },
    { id: 'tasks', title: 'Tasks', subtitle: 'To-dos and upcoming work', icon: <TasksIcon />, metrics, onClick: () => {} },
    { id: 'benefits', title: 'Benefits & Grants', subtitle: 'Schemes you qualify for', icon: <BenefitsIcon />, metrics, onClick: () => {} },
  ];

  return (
    <div style={{ padding: '40px 20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '12px', textAlign: 'center' }}>
        Tether House States Design System
      </h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '50px', fontSize: '14px' }}>
        Click on rooms to see their states and metrics
      </p>

      <Section title="Thriving House (All Clear)" color="#10b981">
        <HouseIllustration rooms={buildHouse(thrivingMetrics)} />
      </Section>

      <Section title="Attention House (Warning)" color="#f59e0b">
        <HouseIllustration rooms={buildHouse(attentionMetrics)} />
      </Section>

      <Section title="Crumbling House (Critical)" color="#ef4444">
        <HouseIllustration rooms={buildHouse(crumblingMetrics)} />
      </Section>

      <Section title="Mixed House (Realistic View)" color="#8b5cf6">
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
          A realistic household with rooms in different states
        </p>
        <HouseIllustration
          rooms={[
            { id: 'documents', title: 'Documents', subtitle: 'All your papers, in one place', icon: <DocumentIcon />, metrics: thrivingMetrics, onClick: () => {} },
            { id: 'finance-insurance', title: 'Finances & Insurance', subtitle: 'Policies, accounts, overview', icon: <FinanceIcon />, metrics: crumblingMetrics, onClick: () => {} },
            { id: 'family', title: 'Family', subtitle: 'Profiles, roles, responsibilities', icon: <FamilyIcon />, metrics: attentionMetrics, onClick: () => {} },
            { id: 'bills-payments', title: 'Bills & Payments', subtitle: 'Due dates and payment history', icon: <BillsIcon />, metrics: thrivingMetrics, onClick: () => {} },
            { id: 'tasks', title: 'Tasks', subtitle: 'To-dos and upcoming work', icon: <TasksIcon />, metrics: attentionMetrics, onClick: () => {} },
            { id: 'benefits', title: 'Benefits & Grants', subtitle: 'Schemes you qualify for', icon: <BenefitsIcon />, metrics: crumblingMetrics, onClick: () => {} },
          ]}
        />
      </Section>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color }} />
        <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}
