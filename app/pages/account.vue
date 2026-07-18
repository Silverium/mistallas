<template>
  <div class="bg-default min-h-screen">
    <div class="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">
            Ajustes de la cuenta
          </h1>
          <p class="mt-2 text-muted">
            Revisa tu plan, el uso de compras y el estado de tu suscripción.
          </p>
        </div>

        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          variant="outline"
          color="neutral"
        >
          Volver al inicio
        </UButton>
      </div>

      <UAlert
        v-if="checkoutAlert"
        class="mb-6"
        :color="checkoutAlert.color"
        variant="soft"
        :title="checkoutAlert.title"
        :description="checkoutAlert.description"
      />

      <UAlert
        v-if="pageErrorMessage"
        class="mb-6"
        color="error"
        variant="soft"
        title="No se pudo cargar la cuenta"
        :description="pageErrorMessage"
      />

      <UAlert
        v-if="actionError"
        class="mb-6"
        color="error"
        variant="soft"
        title="No se pudo actualizar el plan"
        :description="actionError"
      />

      <div
        v-if="loading"
        class="space-y-6"
      >
        <UCard>
          <template #header>
            <USkeleton class="h-6 w-48" />
          </template>

          <div class="space-y-4">
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-10 w-56" />
            <USkeleton class="h-3 w-full" />
          </div>
        </UCard>

        <UCard>
          <template #header>
            <USkeleton class="h-6 w-40" />
          </template>

          <div class="grid gap-4 md:grid-cols-3">
            <USkeleton
              v-for="index in 3"
              :key="index"
              class="h-44 rounded-xl"
            />
          </div>
        </UCard>
      </div>

      <div
        v-else
        class="space-y-6"
      >
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold">
                  Cuenta
                </h2>
                <p class="text-sm text-muted">
                  Información general del plan y su consumo.
                </p>
              </div>

              <UBadge
                :color="tierBadgeColor(profile.tier)"
                variant="soft"
                size="lg"
              >
                {{ tierLabel(profile.tier) }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-6">
            <div class="rounded-2xl bg-elevated/70 p-5 ring ring-default lg:p-6">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted">
                    Plan actual
                  </p>
                  <p class="mt-2 wrap-break-word text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                    {{ tierLabel(profile.tier) }}
                  </p>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {{ tierDescription(profile.tier) }}
                  </p>
                </div>

                <div class="w-full shrink-0 rounded-2xl bg-default px-4 py-3 ring ring-default sm:w-auto sm:min-w-56">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted">
                    Estado
                  </p>
                  <p class="mt-1 wrap-break-word font-semibold leading-5">
                    {{ profile.subscriptionStatus ? subscriptionStatusLabel(profile.subscriptionStatus) : 'Sin suscripción activa' }}
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-2xl bg-elevated p-5 ring ring-default lg:p-6">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-muted">
                    Uso de compras
                  </p>
                  <p class="mt-2 wrap-break-word text-xl font-semibold tracking-tight lg:text-2xl">
                    {{ profile.purchaseCount }} / {{ formatLimit(profile.limit) }}
                  </p>
                </div>

                <UBadge
                  :color="usageColor"
                  variant="soft"
                  size="lg"
                >
                  {{ percentageUsed }}%
                </UBadge>
              </div>

              <UProgress
                class="mt-5"
                :model-value="usageProgress"
                :color="usageColor"
              />

              <p class="mt-3 text-sm text-muted">
                {{ profile.purchaseCount }} / {{ formatLimit(profile.limit) }} compras utilizadas.
              </p>
            </div>

            <UAlert
              v-if="isNearLimit"
              class="mt-5"
              color="warning"
              variant="soft"
              title="Estás cerca de tu límite"
              :description="limitWarningMessage"
            />
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="text-lg font-semibold">
                Mejora tu plan
              </h2>
              <p class="text-sm text-muted">
                Elige el plan que mejor encaje con tu uso.
              </p>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-3">
            <div
              v-for="tier in tiers"
              :key="tier.tier"
              :class="[
                'flex h-full flex-col rounded-xl bg-elevated p-4 ring ring-default transition-colors',
                profile.tier === tier.tier && 'ring-2 ring-primary'
              ]"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-lg font-semibold">
                    {{ tier.label }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ tier.limit === Infinity ? 'Compras ilimitadas' : `${tier.limit} compras` }}
                  </p>
                </div>

                <UBadge
                  v-if="profile.tier === tier.tier"
                  color="primary"
                  variant="soft"
                >
                  Plan actual
                </UBadge>
              </div>

              <div class="mt-5 space-y-1">
                <p class="text-3xl font-bold">
                  {{ formatPrice(tier.price) }}
                </p>
                <p class="text-sm text-muted">
                  al mes
                </p>
              </div>

              <div class="mt-5 space-y-3">
                <p class="text-sm text-muted">
                  {{ tierDescription(tier.tier) }}
                </p>

                <UButton
                  v-if="profile.tier !== tier.tier"
                  block
                  :color="isTierUpgrade(profile.tier, tier.tier) ? 'primary' : 'neutral'"
                  :variant="isTierUpgrade(profile.tier, tier.tier) ? 'solid' : 'outline'"
                  :disabled="upgrading || downgrading"
                  :loading="pendingTier === tier.tier"
                  @click="handleTierAction(profile.tier, tier.tier)"
                >
                  {{ isTierUpgrade(profile.tier, tier.tier) ? 'Mejorar plan' : 'Bajar plan' }}
                </UButton>

                <template v-else>
                  <UButton
                    block
                    variant="soft"
                    color="neutral"
                    disabled
                  >
                    Plan actual
                  </UButton>

                  <UButton
                    v-if="profile.subscriptionStatus === 'active' && tier.tier !== 'free'"
                    block
                    :color="tier.tier === 'enterprise' ? 'secondary' : 'neutral'"
                    :variant="tier.tier === 'enterprise' ? 'solid' : 'outline'"
                    :disabled="downgrading"
                    :loading="pendingTier === downgradeTargetTier(tier.tier)"
                    @click="downgrade(downgradeTargetTier(tier.tier))"
                  >
                    {{ downgrading && pendingTier === downgradeTargetTier(tier.tier) ? 'Cambiando...' : `Bajar a ${tier.tier === 'enterprise' ? 'Premium' : 'Gratis'}` }}
                  </UButton>
                </template>
              </div>
            </div>
          </div>
        </UCard>

        <UCard v-if="profile.subscriptionStatus">
          <template #header>
            <h2 class="text-lg font-semibold">
              Suscripción
            </h2>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-sm text-muted">
                Estado
              </p>

              <UBadge
                class="mt-2 capitalize"
                :color="subscriptionStatusColor(profile.subscriptionStatus)"
                variant="soft"
              >
                {{ subscriptionStatusLabel(profile.subscriptionStatus) }}
              </UBadge>
            </div>

            <p class="text-sm text-muted">
              {{ subscriptionStatusDescription(profile.subscriptionStatus) }}
            </p>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getSpanishApiErrorMessage } from '~/utils/errors'

definePageMeta({
  middleware: 'auth'
})

type Tier = 'free' | 'premium' | 'enterprise'

interface UserProfile {
  id?: string
  tier: Tier
  purchaseCount: number
  limit: number
  subscriptionStatus: 'active' | 'cancelled' | 'past_due' | null
}

interface TierInfo {
  tier: Tier
  label: string
  price: number
  limit: number
}

interface AccountResponse {
  profile: UserProfile
  tiers: TierInfo[]
}

const route = useRoute()

const createDefaultProfile = (): UserProfile => ({
  tier: 'free',
  purchaseCount: 0,
  limit: 200,
  subscriptionStatus: null
})

const createDefaultTiers = (): TierInfo[] => []

const accountData = ref<AccountResponse>({
  profile: createDefaultProfile(),
  tiers: createDefaultTiers()
})
const loading = ref(true)
const hasFetched = ref(false)
const accountError = ref('')

const refresh = async () => {
  loading.value = true
  accountError.value = ''

  try {
    const [profileResponse, tiersResponse] = await Promise.all([
      $fetch<UserProfile>('/api/account/profile'),
      $fetch<{ tiers: TierInfo[] }>('/api/account/tiers')
    ])

    accountData.value = {
      profile: profileResponse,
      tiers: tiersResponse.tiers
    }
  }
  catch (error) {
    accountError.value = getSpanishApiErrorMessage(error) ?? 'No se pudo cargar la información de tu cuenta.'
  }
  finally {
    loading.value = false
    hasFetched.value = true
  }
}

onMounted(() => {
  void refresh()
})

const profile = computed(() => accountData.value?.profile ?? createDefaultProfile())
const tiers = computed(() => accountData.value?.tiers ?? createDefaultTiers())
const pageErrorMessage = computed(() => {
  if (!hasFetched.value || !accountError.value) {
    return ''
  }

  return getSpanishApiErrorMessage(accountError.value) ?? 'No se pudo cargar la información de tu cuenta.'
})

const upgrading = ref(false)
const downgrading = ref(false)
const pendingTier = ref<Tier | null>(null)
const actionError = ref('')

const tierOrder: Tier[] = ['free', 'premium', 'enterprise']

const isTierUpgrade = (from: Tier, to: Tier): boolean => {
  return tierOrder.indexOf(to) > tierOrder.indexOf(from)
}

const checkoutAlert = computed(() => {
  const upgrade = route.query.upgrade
  const status = Array.isArray(upgrade) ? upgrade[0] : upgrade

  if (status === 'success') {
    return {
      color: 'success' as const,
      title: 'Suscripción actualizada',
      description: 'Tu compra se ha iniciado correctamente. Si Stripe aún está procesando el pago, el cambio puede tardar unos segundos en reflejarse.'
    }
  }

  if (status === 'cancelled') {
    return {
      color: 'warning' as const,
      title: 'Proceso cancelado',
      description: 'No se ha completado la compra. Puedes intentarlo de nuevo cuando quieras.'
    }
  }

  return null
})

const percentageUsed = computed(() => {
  if (profile.value.limit === Infinity) {
    return 0
  }

  return Math.min(100, Math.round((profile.value.purchaseCount / profile.value.limit) * 100))
})

const usageProgress = computed(() => {
  if (profile.value.limit === Infinity) {
    return 0
  }

  return percentageUsed.value
})

const usageColor = computed(() => {
  if (profile.value.limit === Infinity) {
    return 'primary' as const
  }

  if (percentageUsed.value >= 90) {
    return 'error' as const
  }

  if (percentageUsed.value >= 70) {
    return 'warning' as const
  }

  return 'success' as const
})

const isNearLimit = computed(() => profile.value.limit !== Infinity && percentageUsed.value >= 90)

const remainingPurchases = computed(() => {
  if (profile.value.limit === Infinity) {
    return '∞'
  }

  return Math.max(profile.value.limit - profile.value.purchaseCount, 0)
})

const limitWarningMessage = computed(() => {
  if (profile.value.limit === Infinity) {
    return 'Tu plan no tiene límite.'
  }

  return `Has usado ${percentageUsed.value}% de tu cupo. Te quedan ${remainingPurchases.value} compras antes de llegar al límite.`
})

function tierLabel(tier: Tier): string {
  const labels: Record<Tier, string> = {
    free: 'Gratis',
    premium: 'Premium',
    enterprise: 'Empresarial'
  }

  return labels[tier]
}

function tierBadgeColor(tier: Tier): 'neutral' | 'primary' | 'secondary' {
  if (tier === 'premium') {
    return 'primary'
  }

  if (tier === 'enterprise') {
    return 'secondary'
  }

  return 'neutral'
}

function subscriptionStatusColor(status: NonNullable<UserProfile['subscriptionStatus']>): 'success' | 'neutral' | 'error' {
  if (status === 'active') {
    return 'success'
  }

  if (status === 'past_due') {
    return 'error'
  }

  return 'neutral'
}

function subscriptionStatusLabel(status: NonNullable<UserProfile['subscriptionStatus']>): string {
  const labels: Record<NonNullable<UserProfile['subscriptionStatus']>, string> = {
    active: 'Activa',
    cancelled: 'Cancelada',
    past_due: 'Pago pendiente'
  }

  return labels[status]
}

function subscriptionStatusDescription(status: NonNullable<UserProfile['subscriptionStatus']>): string {
  const descriptions: Record<NonNullable<UserProfile['subscriptionStatus']>, string> = {
    active: 'Tu suscripción está funcionando con normalidad.',
    cancelled: 'La suscripción se ha cancelado y permanecerá así hasta que la reactives.',
    past_due: 'Hay un pago pendiente. Revisa tu método de pago en Stripe.'
  }

  return descriptions[status]
}

function formatPrice(price: number): string {
  if (price === 0) {
    return 'Gratis'
  }

  return `${price}€`
}

function formatLimit(limit: number): string {
  return limit === Infinity ? '∞' : `${limit}`
}

function tierDescription(tier: Tier): string {
  const descriptions: Record<Tier, string> = {
    free: 'Ideal para empezar y registrar tus compras básicas.',
    premium: 'Pensado para un uso más intensivo con mucho más margen.',
    enterprise: 'Para un volumen alto sin preocuparte por límites.'
  }

  return descriptions[tier]
}

function downgradeTargetTier(tier: Tier): 'free' | 'premium' {
  return tier === 'enterprise' ? 'premium' : 'free'
}

async function handleTierAction(from: Tier, to: Tier) {
  if (isTierUpgrade(from, to)) {
    await upgrade(to as Exclude<Tier, 'free'>)
    return
  }

  await downgrade(to as 'free' | 'premium')
}

async function upgrade(tierName: Exclude<Tier, 'free'>) {
  upgrading.value = true
  pendingTier.value = tierName
  actionError.value = ''
  try {
    const priceIds: Record<Exclude<Tier, 'free'>, string> = {
      premium: 'price_1234567890',
      enterprise: 'price_0987654321'
    }

    const response = await $fetch<{ redirectUrl: string }>('/api/account/upgrade', {
      method: 'POST',
      body: {
        targetTier: tierName,
        priceId: priceIds[tierName]
      }
    })

    if (response.redirectUrl) {
      window.location.href = response.redirectUrl
    }
  }
  catch (err) {
    console.error('Error al mejorar plan:', err)
    actionError.value = getSpanishApiErrorMessage(err) ?? 'No se pudo mejorar el plan.'
  }
  finally {
    upgrading.value = false
    pendingTier.value = null
  }
}

async function downgrade(tierName: 'free' | 'premium') {
  if (!confirm(`¿Seguro que quieres cambiar al plan ${tierLabel(tierName)}?`)) {
    return
  }

  downgrading.value = true
  pendingTier.value = tierName
  actionError.value = ''
  try {
    await $fetch('/api/account/downgrade', {
      method: 'POST',
      body: { targetTier: tierName }
    })

    await refresh()
  }
  catch (err) {
    console.error('Error al bajar plan:', err)
    actionError.value = getSpanishApiErrorMessage(err) ?? 'No se pudo bajar el plan.'
  }
  finally {
    downgrading.value = false
    pendingTier.value = null
  }
}
</script>
