import type { Scheme } from './types'

// Curated Singapore government schemes for Opportunity Discovery (Module 4).
// Every numeric threshold and URL below was pulled from an official source
// (gov.sg domain) and cross-checked on 2026-09-02 — see each scheme's
// `caveats` for anything that couldn't be fully verified or fully encoded as
// a machine-checkable rule. Eligibility is declarative data (EligibilityRule)
// so the matcher in lib/matching.ts stays deterministic — the LLM is never
// asked to decide who qualifies, only to explain a decision already made.
//
// applicationChannel/applicationUrl/applicationInstructions were researched
// separately (2026-09-03): NONE of these 15 schemes have a real, stable,
// fillable PDF application form — every one is either a Singpass/LifeSG web
// portal, fully automatic, or handled in person through a school/kindergarten
// /mentor partner. Confirmed directly against the live MOE FAS and KiFAS
// pages, which both explicitly say to apply through the school/kindergarten,
// not via a downloadable form.

export const SCHEMES: Scheme[] = [
  {
    id: 'moe-fas',
    name: 'MOE Financial Assistance Scheme (FAS)',
    category: 'education',
    description:
      'Fee and cost-of-schooling assistance for Singapore Citizen students in Government or Government-aided primary, secondary, and JC/Centralised Institute schools.',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 6,
      maxAge: 18,
      maxHouseholdIncome: 4000,
      maxPerCapitaIncome: 1000,
    },
    requiredDocuments: [
      'CPF contribution history (past 12 months)',
      'Latest Income Tax Notice of Assessment (NOA)',
      'Latest payslip or employer letter (if employed)',
      'NRIC copies of other household members (if 5+ member household)',
    ],
    benefit:
      '100% subsidy of school and miscellaneous fees, free textbooks and uniform, meal subsidy, and transport support — up to $252/year (secondary) or a $1,600/year bursary inclusive of transport (JC/CI).',
    isAutomatic: false,
    sourceUrl: 'https://www.moe.gov.sg/financial-matters/financial-assistance',
    lastVerified: '2026-09-02',
    applicationChannel: 'school',
    applicationUrl: 'https://www.moe.gov.sg/financial-matters/financial-assistance',
    applicationInstructions:
      "Apply through your child's school — approach the school directly or ask if e-FAS is available via the Parents Gateway app. There is no downloadable application form at a stable government URL; the official page explicitly directs families to the school.",
    caveats: [
      'Qualifies on gross household income ≤ $4,000 OR per-capita income ≤ $1,000 — either is enough.',
      'Age range approximates "enrolled in primary, secondary, or JC/CI" since school level isn\'t tracked in the family graph.',
    ],
  },
  {
    id: 'kifas',
    name: 'Kindergarten Fee Assistance Scheme (KiFAS)',
    category: 'education',
    description:
      'Monthly fee subsidy for Singapore Citizen children at Anchor Operator or MOE kindergartens.',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 5,
      maxAge: 6,
      maxHouseholdIncome: 12000,
      maxPerCapitaIncome: 3000,
    },
    requiredDocuments: [
      'Income assessed automatically via HOMES (IRAS/CPF records)',
      'Payslips, NOA, or CPF statements only if income isn\'t auto-captured (e.g. new hires, self-employed, gig workers)',
    ],
    benefit:
      'Tiered monthly subsidy from $163 (lowest income band, min $1 co-pay) down to $19 (near the $12,000 ceiling, min $145 co-pay).',
    isAutomatic: false,
    sourceUrl:
      'https://www.ecda.gov.sg/parents/preschool-subsidies/kindergarten-fee-assistance-scheme-(kifas)/overview',
    lastVerified: '2026-09-02',
    applicationChannel: 'kindergarten',
    applicationUrl:
      'https://www.ecda.gov.sg/parents/preschool-subsidies/kindergarten-fee-assistance-scheme-(kifas)/overview',
    applicationInstructions:
      "Apply through your child's kindergarten at the point of enrolment — the kindergarten handles the KiFAS application on your behalf. Confirmed directly against the official ECDA page: no downloadable form is linked there.",
    caveats: [
      'Subsidy table sourced from a PDF dated "From 1 Jan 2024" with no confirmed 2025/2026 refresh — spot-check the live ECDA page before relying on the exact dollar amount.',
      'Families on the HDB Public Rental Scheme or MSF ComCare get the maximum subsidy automatically, regardless of income.',
    ],
  },
  {
    id: 'kifas-startup-grant',
    name: 'KiFAS Start-Up Grant',
    category: 'education',
    description:
      'One-time grant to cover initial kindergarten enrollment costs for lower-income Singapore Citizen families.',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 5,
      maxAge: 6,
      maxHouseholdIncome: 1900,
      maxPerCapitaIncome: 650,
    },
    requiredDocuments: ['Same income assessment as KiFAS (via HOMES)'],
    benefit: 'One-time grant of up to $240 for enrollment costs (e.g. registration fee, uniform).',
    isAutomatic: false,
    sourceUrl:
      'https://www.ecda.gov.sg/parents/preschool-subsidies/kindergarten-fee-assistance-scheme-(kifas)/overview',
    lastVerified: '2026-09-02',
    applicationChannel: 'kindergarten',
    applicationUrl:
      'https://www.ecda.gov.sg/parents/preschool-subsidies/kindergarten-fee-assistance-scheme-(kifas)/overview',
    applicationInstructions:
      'Bundled into the same KiFAS application at enrolment through your kindergarten — no separate form.',
  },
  {
    id: 'ecda-childcare-subsidy',
    name: 'ECDA Child Care Subsidy',
    category: 'childcare',
    description:
      'Basic and income-tested Additional Subsidy for Singapore Citizen children at licensed full-day child care centres (18 months – 6 years).',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 1.5,
      maxAge: 6,
      maxHouseholdIncome: 12000,
      maxPerCapitaIncome: 3000,
      minWorkingHoursPerMonth: 56,
    },
    requiredDocuments: ['Income assessed automatically via HOMES; manual documents only if not auto-captured'],
    benefit:
      'Basic Subsidy of $300/month (working parent) or $150/month (non-working) automatically, plus an Additional Subsidy of up to $467/month for lower-income working families, tapering to $80/month near the $12,000 ceiling (2026 rates).',
    isAutomatic: false,
    sourceUrl: 'https://www.ecda.gov.sg/parents/preschool-subsidies/infant-and-childcare-subsidy-scheme/overview',
    lastVerified: '2026-09-02',
    applicationChannel: 'portal',
    applicationUrl: 'https://life.gov.sg/services-tools/form-1-preschool',
    applicationInstructions:
      'Apply via LifeSG (Form 1) when enrolling your child at a childcare centre — log in with Singpass; the centre typically initiates this with you.',
    caveats: [
      'The 56 hours/month rule is for the Additional Subsidy only — non-working parents with gross household income ≤ $6,000 also qualify for an enhanced subsidy under a Dec 2024 provision not separately encoded here.',
      'Rates shown are for full-day care; half-day and flexi-care modes have separate tables.',
    ],
  },
  {
    id: 'ecda-infantcare-subsidy',
    name: 'ECDA Infant Care Subsidy',
    category: 'childcare',
    description:
      'Basic and income-tested Additional Subsidy for Singapore Citizen infants at licensed full-day infant care centres (2 – 18 months).',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 0.17,
      maxAge: 1.5,
      maxHouseholdIncome: 12000,
      maxPerCapitaIncome: 3000,
      minWorkingHoursPerMonth: 56,
    },
    requiredDocuments: ['Income assessed automatically via HOMES; manual documents only if not auto-captured'],
    benefit:
      'Basic Subsidy of $600/month (working parent) or $150/month (non-working) automatically, plus an Additional Subsidy of up to $710/month for lower-income working families, tapering to $40/month near the $12,000 ceiling. Rates unchanged since 1 Jan 2023.',
    isAutomatic: false,
    sourceUrl: 'https://www.ecda.gov.sg/parents/preschool-subsidies/infant-and-childcare-subsidy-scheme/overview',
    lastVerified: '2026-09-02',
    applicationChannel: 'portal',
    applicationUrl: 'https://life.gov.sg/services-tools/form-1-preschool',
    applicationInstructions:
      'Apply via LifeSG (Form 1) when enrolling your infant at an infant care centre — log in with Singpass; the centre typically initiates this with you.',
  },
  {
    id: 'startup-sg-founder',
    name: 'Startup SG Founder',
    category: 'business',
    description:
      'Co-matching grant for first-time Singapore Citizen/PR entrepreneurs starting a new company, administered by Enterprise Singapore via Accredited Mentor Partners.',
    appliesTo: 'adult',
    eligibility: {
      citizenship: ['citizen', 'pr'],
    },
    requiredDocuments: [
      'Pitch deck submitted to an Accredited Mentor Partner (AMP)',
      'AMP Letter of Recommendation',
      'Updated ACRA Bizfile showing paid-up capital',
      'Evidence of entrepreneurship training or experience',
      'Corporate bank statements & invoices (for second tranche claim)',
    ],
    benefit:
      '$20,000–$50,000 grant, matched 1:1 with the founder\'s paid-up capital, disbursed in 2+ tranches over a 12-month period.',
    isAutomatic: false,
    sourceUrl: 'https://www.startupsg.gov.sg/programmes/4894/startup-sg-founder',
    lastVerified: '2026-09-02',
    applicationChannel: 'business_process',
    applicationUrl: 'https://www.startupsg.gov.sg/programmes/4894/startup-sg-founder',
    applicationInstructions:
      "Apply through an Accredited Mentor Partner (AMP) with a pitch deck — direct applications to Enterprise Singapore aren't accepted. The AMP submits your application via FormSG once they've endorsed you.",
    caveats: [
      'Requires a newly incorporated (<6 months) Singapore private limited company with 2+ SC/PR co-founders — company structure isn\'t modeled in the family graph, so citizenship is only a starting filter; the rest must be verified directly.',
      'Excludes several sectors (F&B, nightlife, gambling, employment/manpower agencies, geomancy, etc.).',
    ],
  },
  {
    id: 'workfare-income-supplement',
    name: 'Workfare Income Supplement (WIS)',
    category: 'income_support',
    description: 'Income top-up for lower-wage Singapore Citizen employees, self-employed, and platform workers.',
    appliesTo: 'adult',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 30,
      minMonthlyIncome: 500,
      maxMonthlyIncome: 3000,
      maxAnnualValue: 21000,
      maxPropertiesOwned: 1,
    },
    requiredDocuments: [
      'None for employees/platform workers (auto-assessed from declared income)',
      'IRAS income declaration + MediSave contribution proof for self-employed',
    ],
    benefit:
      'Annual payout (Work Year 2025) from $2,450 (age 30–34) up to $4,900 (age 60+, or any age for persons with disabilities). Split 40% cash / 60% CPF for employees; 10% cash / 90% MediSave for self-employed & platform workers.',
    isAutomatic: false,
    sourceUrl: 'https://www.cpf.gov.sg/member/growing-your-savings/government-support/workfare-income-supplement',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: 'https://mytax.iras.gov.sg',
    applicationInstructions:
      'Automatic for employees and platform workers — no action needed. Self-employed: declare your income via the IRAS myTax Portal and pay MediSave contributions; there is no separate WIS application form.',
    caveats: [
      'The age-30 floor is waived for persons with disabilities.',
      'Payout figures are versioned by Work Year and revised periodically — re-check before relying on exact dollar amounts.',
      'If married, spouse\'s assessable income must also be ≤ $70,000 — not modeled in the family graph.',
    ],
  },
  {
    id: 'silver-support',
    name: 'Silver Support Scheme',
    category: 'retirement',
    description:
      'Automatic quarterly payout for lower-income elderly Singapore Citizens living in HDB flats — no application needed.',
    appliesTo: 'adult',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 65,
      maxPerCapitaIncome: 2300,
      housingTypes: ['hdb_1_2', 'hdb_3', 'hdb_4', 'hdb_5'],
      maxPropertiesOwned: 1,
    },
    requiredDocuments: [],
    benefit:
      'Quarterly payout of $215–$1,080 depending on flat type and per-capita household income (up to $4,320/year). ComCare Long-Term Assistance recipients get a flat $430/quarter.',
    isAutomatic: true,
    sourceUrl: 'https://www.cpf.gov.sg/member/retirement-income/government-support/silver-support-scheme',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: null,
    applicationInstructions: 'Fully automatic — no application needed. Eligible seniors are assessed and paid without any action.',
    caveats: [
      'Also requires lifetime CPF contributions (OA+SA) by age 55 of ≤ $140,000, or for the self-employed, average annual net trade income ≤ $27,600 during ages 45–54 — not tracked in the family graph, so this is a partial check only.',
      'Must not own (nor spouse) a 5-room-or-larger flat, private property, or multiple properties.',
    ],
  },
  {
    id: 'large-families-scheme',
    name: 'Large Families Scheme',
    category: 'family',
    description:
      'Extra CDA grant, MediSave grant, and annual LifeSG Credits for the 3rd or subsequent Singapore Citizen child in a family.',
    appliesTo: 'child',
    eligibility: {
      citizenship: ['citizen'],
      minBirthOrder: 3,
      minBirthYear: 2019,
      maxAge: 7,
    },
    requiredDocuments: [],
    benefit:
      'Up to $16,000 in extra support: $10,000 CDA First Step Grant, $5,000 Large Family MediSave Grant, and $1,000/year LifeSG Credits (ages 1–6). Children born 1 Jan 2019 – 17 Feb 2025 qualify for the LifeSG Credits portion only, until age 6.',
    isAutomatic: true,
    sourceUrl:
      'https://www.madeforfamilies.gov.sg/support-measures/child-raising/financial-support/large-families-scheme',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: null,
    applicationInstructions:
      'Fully automatic — tied to Baby Bonus/CDA registration at birth. No application needed.',
    caveats: [
      'Full benefit applies to children born on/after 18 Feb 2025; the family graph tracks birth year, not exact birth date, so the full-vs-transitional split shown here is approximate.',
      'Grants are typically credited automatically at/soon after birth — if your 3rd+ child is already several years old, this may have already been claimed.',
      'An unverified secondary source suggested this scheme may be replaced by an "SG Child Support Package" from April 2027 — not confirmed against a primary source.',
    ],
  },
  {
    id: 'climate-vouchers',
    name: 'Climate Vouchers (Climate Friendly Households Programme)',
    category: 'vouchers',
    description:
      'One-off vouchers toward energy/water-efficient appliances, for Singapore Citizen/PR households.',
    appliesTo: 'household',
    eligibility: {
      requiresHouseholdCitizen: true,
      housingTypes: ['hdb_1_2', 'hdb_3', 'hdb_4', 'hdb_5', 'hdb_exec_or_multigen', 'private_property'],
    },
    requiredDocuments: [],
    benefit:
      'Up to $400 for eligible HDB households (SC or PR); up to $100 for eligible private-residential households (SC only). Valid 15 Apr 2025 – 31 Dec 2027, redeemable at ~180 participating retailers.',
    isAutomatic: false,
    voucherExpiry: '2027-12-31',
    sourceUrl:
      'https://www.nea.gov.sg/media/news/news/index/eligible-singapore-households-can-claim-up-to--400-climate-vouchers-from-15-april-2025',
    lastVerified: '2026-09-02',
    applicationChannel: 'portal',
    applicationUrl: 'https://go.gov.sg/cv-claim',
    applicationInstructions: 'Claim via Singpass at go.gov.sg/cv-claim, then redeem at participating retailers.',
    caveats: [
      'Private-residential households may be capped at the $100 enhanced tranche only (not the full $400) — the official FAQ page returned repeated errors during verification; confirm before relying on the private-property figure.',
      'One set of vouchers per registered household address, regardless of resident count.',
    ],
  },
  {
    id: 'cdc-vouchers',
    name: 'CDC Vouchers',
    category: 'vouchers',
    description: 'Community Development Council vouchers for every Singaporean household, no income test.',
    appliesTo: 'household',
    eligibility: {
      requiresHouseholdCitizen: true,
    },
    requiredDocuments: [],
    benefit:
      '$300 (Jan 2026 tranche) + $500 (Jun 2026 tranche) per household, split between hawkers/heartland merchants and supermarkets. No income test, but vouchers must be actively claimed via Singpass.',
    isAutomatic: false,
    voucherExpiry: '2026-12-31',
    sourceUrl: 'https://www.cdc.gov.sg/common-flagship-programmes/cdcvs/',
    lastVerified: '2026-09-02',
    applicationChannel: 'portal',
    applicationUrl: 'https://go.gov.sg/cdcv',
    applicationInstructions: 'Claim via Singpass at go.gov.sg/cdcv.',
    caveats: [
      'The Jan 2026 ($300) tranche expires 31 Dec 2026; the Jun 2026 ($500) tranche expires 31 Dec 2027 — the earlier expiry is the one shown here as the urgent date.',
      '"At least one SC household member" was corroborated by multiple secondary sources but not verbatim-quoted from a primary page (JS-rendered site) — high confidence, not certain.',
    ],
  },
  {
    id: 'sg60-vouchers',
    name: 'SG60 Vouchers',
    category: 'vouchers',
    description:
      "One-off vouchers marking Singapore's 60th anniversary, for every adult Singapore Citizen including those overseas.",
    appliesTo: 'adult',
    eligibility: {
      citizenship: ['citizen'],
      minAge: 21,
    },
    requiredDocuments: [],
    benefit:
      '$600 per Singapore Citizen adult (21+ in 2025), or $800 for seniors (60+ in 2025) — split between heartland/hawker spend and supermarket spend.',
    isAutomatic: false,
    voucherExpiry: '2026-12-31',
    sourceUrl: 'https://vouchers.sg60.gov.sg/about/about-sg60-vouchers/',
    lastVerified: '2026-09-02',
    applicationChannel: 'portal',
    applicationUrl: 'https://go.gov.sg/sg60v',
    applicationInstructions:
      "Claim via Singpass at go.gov.sg/sg60v, or in person at a Community Club/Centre if you don't have Singpass.",
    caveats: [
      'Adults 60+ in 2025 (born 1965 or earlier) get $800 instead of $600 — shown here as the base $600 figure since exact birth year isn\'t collected.',
      'Cannot be used for e-commerce, lottery, petrol/diesel, alcohol, or cigarettes.',
    ],
  },
  {
    id: 'majulah-esb',
    name: 'Majulah Package — Earn and Save Bonus (ESB)',
    category: 'retirement',
    description:
      'Recurring annual CPF top-up for lower-to-middle income Singapore Citizens born on or before 1973 who are still working.',
    appliesTo: 'adult',
    eligibility: {
      citizenship: ['citizen'],
      maxBirthYear: 1973,
      employmentStatuses: ['employed', 'self-employed'],
      minMonthlyIncome: 500,
      maxMonthlyIncome: 6000,
      maxPropertiesOwned: 1,
      maxAnnualValue: 25000,
    },
    requiredDocuments: [],
    benefit:
      'Annual CPF top-up credited every March: $1,000/year (income $500–$2,500/month), $700/year ($2,501–$3,500), or $400/year ($3,501–$6,000).',
    isAutomatic: true,
    sourceUrl:
      'https://www.cpf.gov.sg/content/dam/web/member/faq/majulah-package/documents/FAQs%20Majulah%20Package.pdf',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: null,
    applicationInstructions: 'Fully automatic — annual CPF top-up credited without any application.',
    caveats: [
      'The Majulah Package also included a one-time Retirement Savings Bonus and MediSave Bonus, both already disbursed in Dec 2024 — not shown here since they\'re no longer newly claimable.',
      'Also covers platform workers, a category not distinguished in the family graph\'s employment status options.',
    ],
  },
  {
    id: 'gstv-usave',
    name: 'GST Voucher – U-Save',
    category: 'utilities',
    description: 'Automatic quarterly utilities rebate for Singapore Citizen HDB households — nothing to apply for.',
    appliesTo: 'household',
    eligibility: {
      requiresHouseholdCitizen: true,
      housingTypes: ['hdb_1_2', 'hdb_3', 'hdb_4', 'hdb_5', 'hdb_exec_or_multigen'],
      maxPropertiesOwned: 1,
    },
    requiredDocuments: [],
    benefit:
      '$330–$570/year (FY2026, by flat size), credited automatically and quarterly to the household\'s SP Services utilities account.',
    isAutomatic: true,
    sourceUrl:
      'https://www.mof.gov.sg/news-resources/newsroom/more-than-1-million-singaporean-hdb-households-to-benefit-from-u-save-and-s-cc-rebates-in-april-2026/',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: null,
    applicationInstructions:
      "Fully automatic — credited directly to your SP Services utilities account. No application needed.",
    caveats: [
      'No income or Annual Value test applies to U-Save (unlike GSTV-Cash) — don\'t confuse the two.',
      'FY2026 amounts include a one-off Budget 2026 top-up in the Apr/Jul quarters only; amounts are revised each Budget.',
    ],
  },
  {
    id: 'gstv-scc-rebate',
    name: 'GST Voucher – S&CC Rebate',
    category: 'utilities',
    description:
      'Automatic quarterly offset against HDB Service & Conservancy Charges for Singapore Citizen households — nothing to apply for.',
    appliesTo: 'household',
    eligibility: {
      requiresHouseholdCitizen: true,
      housingTypes: ['hdb_1_2', 'hdb_3', 'hdb_4', 'hdb_5', 'hdb_exec_or_multigen'],
      maxPropertiesOwned: 1,
    },
    requiredDocuments: [],
    benefit:
      '1.5–3.5 months of Service & Conservancy Charges waived per year (FY2026, by flat size), credited automatically and quarterly against the household\'s Town Council account.',
    isAutomatic: true,
    sourceUrl:
      'https://www.mof.gov.sg/news-resources/newsroom/more-than-1-million-singaporean-hdb-households-to-benefit-from-u-save-and-s-cc-rebates-in-april-2026/',
    lastVerified: '2026-09-02',
    applicationChannel: 'automatic',
    applicationUrl: null,
    applicationInstructions:
      'Fully automatic — credited directly against your Town Council S&CC account. No application needed.',
    caveats: [
      'Benefit is expressed in months of your actual S&CC bill, not a fixed dollar amount — actual value depends on your Town Council\'s rates.',
      'Ineligible if the flat is fully rented out (no resident owner/occupier), even if otherwise assessed.',
    ],
  },
]
