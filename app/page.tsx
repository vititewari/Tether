'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { useAuth } from '@/lib/AuthProvider'
import { db } from '@/lib/firebaseClient'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.replace('/login')
      return
    }

    // Logged in — check whether a household already exists for this user.
    const q = query(collection(db, 'households'), where('ownerId', '==', user.uid), limit(1))
    getDocs(q).then((snapshot) => {
      if (!snapshot.empty) {
        router.replace('/dashboard')
      } else {
        router.replace('/onboarding')
      }
    })
  }, [user, loading, router])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Loading…</p>
    </main>
  )
}
