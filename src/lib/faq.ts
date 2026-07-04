import { supabaseAdmin } from '@/lib/flows/admin-client'
import type { FaqEntry } from '@/types'

function normalize(text: string) {
  return text.trim().toLowerCase()
}

export function matchesFaqEntry(messageText: string, entry: FaqEntry): boolean {
  const incoming = normalize(messageText)
  if (!incoming) return false

  const keywords = (entry.keywords ?? [])
    .map((keyword) => normalize(keyword))
    .filter(Boolean)

  if (keywords.length === 0) {
    return incoming.includes(normalize(entry.question))
  }

  return keywords.some((keyword) => incoming.includes(keyword))
}

export async function findMatchingFaqEntry(
  userId: string,
  messageText: string,
): Promise<FaqEntry | null> {
  const { data, error } = await supabaseAdmin()
    .from('faq_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[faq] lookup failed:', error.message)
    return null
  }

  const entries = (data ?? []) as FaqEntry[]
  return entries.find((entry) => matchesFaqEntry(messageText, entry)) ?? null
}
