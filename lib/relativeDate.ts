// Deterministic relative-date resolution — LLMs are unreliable at exact date
// arithmetic (verified: asked "by Friday" on a Thursday, Bedrock returned the
// following Saturday). Weekday/tomorrow/today references are common enough
// in casual chat messages that they're worth resolving in code instead of
// trusting the model's arithmetic.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function resolveRelativeDate(text: string, today: Date = new Date()): string | null {
  const lower = text.toLowerCase()

  // A named weekday is checked first — it's a deliberate deadline signal
  // ("pay by Friday"), whereas "today"/"tomorrow" often narrate an unrelated
  // part of the message ("Kai went to the doctor today, pay by Friday") and
  // would otherwise wrongly win just by appearing earlier in the sentence.
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (lower.includes(WEEKDAYS[i])) {
      const diff = (i - today.getDay() + 7) % 7 // 0 if today IS that weekday
      const d = new Date(today)
      d.setDate(d.getDate() + diff)
      return d.toISOString().slice(0, 10)
    }
  }

  if (lower.includes('tomorrow')) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (lower.includes('today') || lower.includes('tonight')) {
    return today.toISOString().slice(0, 10)
  }

  return null
}
