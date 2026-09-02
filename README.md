# Family Graph — MVP Module 1 (Firebase version)

The foundation of the Family Admin Agent. Lets a household sign up, add family
members and a family business, set each person's responsibilities, and view
the resulting household structure. Every other engine (Smart Upload, Admin
Tasks, Opportunity Discovery, Life Events) will read from this data.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind — frontend
- **Firebase Auth** — email/password login
- **Firestore** — database, called directly from the frontend via the
  Firebase JS SDK (no separate API server needed for this module)

## What's included

```
app/
  page.tsx            → root: redirects to /login, /onboarding, or /dashboard
  login/page.tsx       → email + password login
  signup/page.tsx       → email + password signup
  onboarding/page.tsx  → create household → add people → optional business
  dashboard/page.tsx    → renders the family graph
components/
  FamilyTree.tsx        → visual layout of people + business
lib/
  firebaseClient.ts     → Firebase app/auth/firestore initialization
  AuthProvider.tsx        → React context tracking the logged-in user
  types.ts               → TypeScript types matching the Firestore data model
firestore.rules          → security rules — paste into Firebase Console
```

## Data model

Firestore is document-based, not relational, so the structure is nested
rather than joined by foreign keys:

```
households/{householdId}
  ownerId, name, createdAt
  └── people/{personId}
        name, age, employmentStatus, incomeBracket, responsibilities[], preferences, createdAt
  └── businesses/{businessId}
        name, industry, employeeCount, revenueBracket, createdAt
```

One design note: the original spec listed "Add Person" and "Set
Responsibilities" as separate screens. For this MVP they're merged into a
single form during onboarding — same data, fewer clicks.

## Setup

### 1. Create a Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com) →
Add project. Free "Spark" plan is enough.

### 2. Enable Email/Password auth
**Build → Authentication → Get started → Sign-in method → Email/Password →
Enable.** Unlike some providers, Firebase does not require email
confirmation by default, so accounts work immediately after signup.

### 3. Create a Firestore database
**Build → Firestore Database → Create database.** Choose **Start in test
mode** for now (we'll lock it down with real rules next) and pick any
region.

### 4. Apply the security rules
**Firestore Database → Rules** tab → replace the contents with everything in
`firestore.rules` from this repo → **Publish**. This ensures each user can
only read/write their own household's data.

### 5. Register a web app and get your config
**Project Settings (gear icon) → General → scroll to "Your apps" → click the
`</>` (web) icon → register an app (any nickname).** Firebase shows you a
`firebaseConfig` object — you need the values inside it.

### 6. Configure environment variables
```bash
cp .env.local.example .env.local
```
Open `.env.local` and fill in the six values from step 5 (they map directly:
`apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`, etc).

### 7. Install dependencies
```bash
npm install
```

### 8. Run it
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

## Using it

1. You'll land on `/login` — click through to **Sign up**, create an account
   with email + password. You'll be signed in immediately (no confirmation
   email to wait for).
2. You'll be sent to onboarding: name your household, add each family member
   (with age, employment, income bracket, and responsibilities), optionally
   add a family business.
3. You'll land on the dashboard, showing the family graph you just built.
4. Refreshing or logging back in later will skip onboarding and go straight
   to the dashboard, since a household already exists for your account.

## If something doesn't work

- **"Firebase config looks wrong" / `auth/invalid-api-key`** — double-check
  every value in `.env.local` was copied exactly from the Firebase console,
  and restart `npm run dev` after editing the file (env vars are only read
  at startup).
- **`Missing or insufficient permissions` in the console** — the security
  rules weren't published, or don't match `firestore.rules` exactly. Re-check
  step 4.
- **Nothing happens after signup** — open the browser console (F12) for the
  actual error; Firebase errors are generally more descriptive than a bare
  "fetch failed".

## What's next (not in this module)

- Smart Upload (document extraction → auto-link to a person in this graph)
- Admin Tasks (obligations tied to each person's `responsibilities`)
- Opportunity Discovery (matches household data against a schemes DB)
- Life Events (re-runs the above when something changes)

These will likely need a small FastAPI service (for LangGraph agents and
Bedrock calls) that reads/writes to Firestore via the Admin SDK — this
frontend won't need to change much when that's added.
