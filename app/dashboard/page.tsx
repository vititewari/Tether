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

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [household, setHousehold] = useState<Household | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/login')
      return
    }

    async function loadData() {
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

      const [peopleSnap, businessSnap] = await Promise.all([
        getDocs(collection(db, 'households', householdData.id, 'people')),
        getDocs(collection(db, 'households', householdData.id, 'businesses')),
      ])

      setPeople(peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })))
      setBusinesses(
        businessSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Business, 'id'>) }))
      )
      setLoading(false)
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
               <h1 className="text-2xl font-semibold">Family Graph</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Smart Upload
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
        <FamilyTree
          householdName={household.name}
          people={people}
          businesses={businesses}
        />
      )}
    </main>
  )
}
