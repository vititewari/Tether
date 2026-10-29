'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collection, query, where, limit, getDocs } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useAuth } from '@/lib/AuthProvider'
import { auth, db } from '@/lib/firebaseClient'
import type { Household, Person, Business } from '@/lib/types'
import FamilyTree from '@/components/FamilyTree'
import HouseIllustration from '@/components/HouseIllustration'
import { DocumentIcon, FinanceIcon, FamilyIcon, BillsIcon, TasksIcon, BenefitsIcon } from '@/components/RoomIcons'
import { calculateRoomMetrics, calculateDocumentHealth } from '@/lib/roomHealth'
import type { Task } from '@/lib/taskTypes'

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    async function loadData() {
      try {
        const q = query(collection(db, 'households'), where('ownerId', '==', user!.uid), limit(1))
        const snapshot = await getDocs(q)

        if (snapshot.empty) {
          router.replace('/onboarding')
          return
        }

        const householdDoc = snapshot.docs[0]
        const householdData: Household = {
          id: householdDoc.id,
          ...(householdDoc.data() as Omit<Household, 'id'>),
        }
        setHousehold(householdData)

        const [peopleSnap, businessSnap, tasksSnap, docsSnap] = await Promise.all([
          getDocs(collection(db, 'households', householdData.id, 'people')),
          getDocs(collection(db, 'households', householdData.id, 'businesses')),
          getDocs(collection(db, 'households', householdData.id, 'tasks')),
          getDocs(collection(db, 'households', householdData.id, 'documents')),
        ])

        setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
        setBusinesses(
          businessSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Business, 'id'>) }))
        )
        setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })))
        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load this page.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, authLoading, router])

  async function handleLogout() {
    await signOut(auth)
    router.replace('/login')
  }

  if (loading || authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading your family graph…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
               <h1 className="text-2xl font-semibold">Family Graph</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Chat
          </Link>
          <Link
            href="/edit-details"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Edit Details
          </Link>
          <Link
            href="/tasks"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Tasks
          </Link>
          <Link
            href="/opportunities"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Opportunities
          </Link>
          <Link
            href="/documents"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Smart Upload
          </Link>
          <Link
            href="/life-events"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Life Events
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </div>

      {household && (
        <>
          <HouseIllustration
            rooms={[
              {
                id: 'documents',
                title: 'Documents',
                subtitle: 'All your papers, in one place',
                icon: <DocumentIcon />,
                metrics: calculateDocumentHealth(documents),
                onClick: () => router.push('/documents'),
              },
              {
                id: 'finance-insurance',
                title: 'Finances & Insurance',
                subtitle: 'Policies, accounts, overview',
                icon: <FinanceIcon />,
                metrics: calculateRoomMetrics(tasks.filter((t) => t.category === 'finance' || t.category === 'insurance'), new Date()),
                onClick: () => router.push('/tasks?categories=finance,insurance'),
              },
              {
                id: 'family',
                title: 'Family',
                subtitle: 'Profiles, roles, responsibilities',
                icon: <FamilyIcon />,
                metrics: calculateRoomMetrics(tasks.filter((t) => t.category === 'education' || t.category === 'health' || t.category === 'identity'), new Date()),
                onClick: () => {},
              },
              {
                id: 'bills-payments',
                title: 'Bills & Payments',
                subtitle: 'Due dates and payment history',
                icon: <BillsIcon />,
                metrics: calculateRoomMetrics(tasks.filter((t) => t.isPayment), new Date()),
                onClick: () => router.push('/tasks?isPayment=true'),
              },
              {
                id: 'tasks',
                title: 'Tasks',
                subtitle: 'To-dos and upcoming work',
                icon: <TasksIcon />,
                metrics: calculateRoomMetrics(tasks.filter((t) => t.category === 'other' || !t.category), new Date()),
                onClick: () => router.push('/tasks'),
              },
              {
                id: 'benefits',
                title: 'Benefits & Grants',
                subtitle: 'Schemes you qualify for',
                icon: <BenefitsIcon />,
                metrics: { state: 'thriving', totalTasks: 0, overdueCount: 0, dueWithin7: 0, maxOverduesDays: null, financialImpact: 0, urgentTask: null },
                onClick: () => router.push('/opportunities'),
              },
            ]}
          />

          <div className="mt-8">
            <FamilyTree
              householdName={household.name}
              people={people}
              businesses={businesses}
            />
          </div>
        </>
      )}
    </main>
  )
}
