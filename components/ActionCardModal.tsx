'use client'

import { useState } from 'react'
import type { PrefillFact } from '@/lib/actionCard'
import { downloadSummaryPdf } from '@/lib/generateSummaryPdf'

type DraftState = { status: 'idle' | 'loading' | 'done' | 'error'; subject?: string; body?: string; error?: string }

export default function ActionCardModal({
  title,
  purpose,
  recipientType,
  benefitOrTaskDescription,
  facts,
  requiredDocuments,
  sourceUrl,
  showEmailDraft = true,
  applyAction,
  onClose,
}: {
  title: string
  purpose: string
  recipientType?: string
  benefitOrTaskDescription: string
  facts: PrefillFact[]
  requiredDocuments: string[]
  sourceUrl?: string
  // Whether the email-draft section makes sense here at all — most tasks and
  // every scheme in this dataset aren't actually applied for by email (see
  // lib/schemes.ts and lib/tasks.ts taskSuggestsEmail), so callers decide.
  showEmailDraft?: boolean
  // For Opportunities: how you actually apply for this scheme (a real
  // Singpass/LifeSG portal, a school/kindergarten, or "fully automatic") —
  // researched per scheme, never invented.
  applyAction?: { instructions: string; url: string | null }
  onClose: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [draft, setDraft] = useState<DraftState>({ status: 'idle' })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy draft')

  async function handleGenerateDraft() {
    setDraft({ status: 'loading' })
    try {
      const response = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, recipientType, benefitOrTaskDescription, facts }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Failed to draft email.')
      setSubject(data.subject)
      setBody(data.body)
      setDraft({ status: 'done', subject: data.subject, body: data.body })
    } catch (err: any) {
      setDraft({ status: 'error', error: err?.message ?? 'Something went wrong.' })
    }
  }

  function handleOpenMailClient() {
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, '_blank')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopyLabel('Copied ✓')
    setTimeout(() => setCopyLabel('Copy draft'), 2000)
  }

  async function handleDownloadPdf() {
    await downloadSummaryPdf({
      title,
      subtitle: purpose,
      facts,
      requiredDocuments,
      sourceUrl,
      fileName: `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-summary.pdf`,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
        <div className="border-b border-slate-200 p-5">
          <div className="mb-3 flex items-start justify-between">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>

          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">⚠️ AI-drafted — not verified, not sent, not official.</p>
            <p className="mt-1">
              Everything below is generated from information already in your family graph. AI can get things wrong
              or leave out something important. Read every field carefully and correct anything that's wrong before
              you use it — you are responsible for what you actually send or submit.
            </p>
          </div>

          <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
            I understand this was drafted by AI and I'll review it fully before using it.
          </label>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {applyAction && (
            <div className="mb-5">
              <p className="mb-2 text-sm font-medium text-slate-700">How to apply</p>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm text-slate-700">{applyAction.instructions}</p>
                {applyAction.url && (
                  <a
                    href={applyAction.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Open application →
                  </a>
                )}
              </div>
            </div>
          )}

          {showEmailDraft && (
            <div className="mb-5">
              <p className="mb-2 text-sm font-medium text-slate-700">Email draft</p>
              {draft.status === 'idle' && (
                <button
                  onClick={handleGenerateDraft}
                  disabled={!acknowledged}
                  className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Draft an email
                </button>
              )}
              {draft.status === 'loading' && <p className="text-sm text-slate-400">Drafting…</p>}
              {draft.status === 'error' && (
                <p className="text-sm text-red-600">{draft.error ?? 'Could not draft an email.'}</p>
              )}
              {draft.status === 'done' && (
                <div className="space-y-2">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenMailClient}
                      disabled={!acknowledged}
                      className="flex-1 rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      Open in Mail App
                    </button>
                    <button
                      onClick={handleCopy}
                      disabled={!acknowledged}
                      className="flex-1 rounded-md border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {copyLabel}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    You choose the recipient and press send yourself, from your own email — nothing is sent for you.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Application summary (PDF)</p>
            <button
              onClick={handleDownloadPdf}
              disabled={!acknowledged}
              className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Download summary PDF
            </button>
            <p className="mt-1 text-xs text-slate-400">
              A prep sheet with the details already on file — not the official form. Use it alongside the real
              application.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
