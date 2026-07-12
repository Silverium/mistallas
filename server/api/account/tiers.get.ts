import { getPurchaseLimit } from '../../utils/tiers'
import type { Tier } from '../../utils/tiers'

export type TierInfo = {
  tier: Tier
  label: string
  price: number
  limit: number
}

export const TIER_OFFERINGS: TierInfo[] = [
  { tier: 'free', label: 'Gratis', price: 0, limit: getPurchaseLimit('free') },
  { tier: 'premium', label: 'Premium', price: 1, limit: getPurchaseLimit('premium') },
  { tier: 'enterprise', label: 'Empresarial', price: 10, limit: getPurchaseLimit('enterprise') }
]

export default eventHandler(async () => {
  return {
    tiers: TIER_OFFERINGS
  }
})
