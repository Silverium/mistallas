<template>
  <div class="bg-gray-50">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold text-gray-900">
          Ajustes de la cuenta
        </h1>
        <NuxtLink
          to="/"
          class="text-gray-600 hover:text-gray-900"
        >
          Volver al inicio
        </NuxtLink>
      </div>

      <div
        v-if="loading"
        class="text-center text-gray-500"
      >
        Cargando la información de la cuenta...
      </div>
      <div
        v-else
        class="space-y-6"
      >
        <!-- Tier Info Card -->
        <div class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Cuenta
          </h2>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">
                Plan
              </p>
              <p class="text-3xl font-bold text-gray-900 capitalize">
                {{ tierLabel(profile.tier) }}
              </p>
              <p class="text-sm text-gray-600 mt-2">
                {{ profile.purchaseCount }} / {{ profile.limit === Infinity ? '∞' : profile.limit }} compras utilizadas
              </p>
            </div>
            <div
              v-if="profile.limit !== Infinity"
              class="w-48"
            >
              <div class="mb-2">
                <div class="flex justify-between text-sm mb-2">
                  <span class="text-gray-600">Uso</span>
                  <span class="text-gray-900">{{ percentageUsed }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-3">
                  <div
                    :style="{ width: percentageUsed + '%' }"
                    :class="[
                      'h-3 rounded-full transition-colors',
                      percentageUsed > 90 && 'bg-red-500',
                      percentageUsed > 70 && percentageUsed <= 90 && 'bg-yellow-500',
                      percentageUsed <= 70 && 'bg-green-500'
                    ]"
                  />
                </div>
              </div>
              <p
                v-if="percentageUsed >= 90"
                class="text-sm text-red-600 mt-2"
              >
                ¡Estás cerca de tu límite!
              </p>
            </div>
          </div>
        </div>

        <!-- Upgrade Options -->
        <div class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Mejora tu plan
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              v-for="tier in tiers"
              :key="tier.tier"
              :class="[
                'p-4 border-2 rounded-lg',
                profile.tier === tier.tier ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              ]"
            >
              <p class="text-lg font-semibold text-gray-900">
                {{ tier.label }}
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-2">
                {{ tier.price }}€
              </p>
              <p class="text-sm text-gray-600 mt-1">
                {{ tier.limit === Infinity ? 'Compras ilimitadas' : `${tier.limit} compras` }}
              </p>
              <button
                v-if="profile.tier !== tier.tier"
                :disabled="upgrading || downgrading"
                :class="[
                  'w-full mt-4 px-4 py-2 rounded-lg disabled:opacity-50',
                  tier.tier === 'free' ? 'border border-gray-300 hover:bg-gray-50' : tier.tier === 'enterprise' ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                ]"
                @click="isTierUpgrade(profile.tier, tier.tier) ? upgrade(tier.tier) : downgrade(tier.tier)"
              >
                {{
                  isTierUpgrade(profile.tier, tier.tier)
                    ? upgrading ? 'Redirigiendo...' : 'Mejorar plan'
                    : downgrading ? 'Cambiando...' : 'Bajar plan'
                }}
              </button>
              <p
                v-else
                class="w-full mt-4 text-center text-sm text-gray-600"
              >
                Plan actual
              </p>
              <button
                v-if="profile.tier === tier.tier && profile.subscriptionStatus === 'active' && tier.tier !== 'free'"
                :disabled="downgrading"
                class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                @click="downgrade(tier.tier === 'enterprise' ? 'premium' : 'free')"
              >
                {{ downgrading ? 'Cambiando...' : `Bajar ${tier.tier === 'enterprise' ? 'a Premium' : 'plan'}` }}
              </button>
            </div>
          </div>
        </div>

        <!-- Subscription Info -->
        <div
          v-if="profile.subscriptionStatus"
          class="bg-white p-6 rounded-lg shadow"
        >
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Suscripción
          </h2>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">
                Estado
              </p>
              <p
                :class="[
                  'text-lg font-semibold',
                  profile.subscriptionStatus === 'active' && 'text-green-600',
                  profile.subscriptionStatus === 'cancelled' && 'text-gray-600',
                  profile.subscriptionStatus === 'past_due' && 'text-red-600'
                ]"
              >
                {{ profile.subscriptionStatus }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Messages -->
      <div
        v-if="error"
        class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800"
      >
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

interface UserProfile {
  id?: string
  tier: 'free' | 'premium' | 'enterprise'
  purchaseCount: number
  limit: number
  subscriptionStatus: string | null
}

interface TierInfo {
  tier: 'free' | 'premium' | 'enterprise'
  label: string
  price: number
  limit: number
}

const profile = ref<UserProfile>({
  tier: 'free',
  purchaseCount: 0,
  limit: 200,
  subscriptionStatus: null
})

const tiers = ref<TierInfo[]>([
  { tier: 'free', label: 'Gratis', price: 0, limit: 200 },
  { tier: 'premium', label: 'Premium', price: 1, limit: 500 },
  { tier: 'enterprise', label: 'Empresarial', price: 10, limit: Infinity }
])

const tierOrder = ['free', 'premium', 'enterprise'] as const

const isTierUpgrade = (from: string, to: string): boolean => {
  return tierOrder.indexOf(to as 'free' | 'premium' | 'enterprise') > tierOrder.indexOf(from as 'free' | 'premium' | 'enterprise')
}

const loading = ref(true)
const upgrading = ref(false)
const downgrading = ref(false)
const error = ref('')

const percentageUsed = computed(() => {
  if (profile.value.limit === Infinity) return 0
  return Math.round((profile.value.purchaseCount / profile.value.limit) * 100)
})

async function fetchProfile() {
  loading.value = true
  try {
    const [profileRes, tiersRes] = await Promise.all([
      useFetch('/api/account/profile'),
      useFetch('/api/account/tiers')
    ])
    if (profileRes.data.value) {
      profile.value = profileRes.data.value
    }
    if (tiersRes.data.value?.tiers) {
      tiers.value = tiersRes.data.value.tiers
    }
  }
  catch (err) {
    console.error('Error al cargar perfil:', err)
    error.value = 'No se pudo cargar la información de la cuenta'
  }
  finally {
    loading.value = false
  }
}

async function upgrade(tierName: string) {
  upgrading.value = true
  error.value = ''
  try {
    // Map tier to price ID - update these with your actual Stripe price IDs
    const priceIds: Record<string, string> = {
      premium: 'price_1234567890', // Update with actual price ID
      enterprise: 'price_0987654321' // Update with actual price ID
    }

    const response = await $fetch('/api/account/upgrade', {
      method: 'POST',
      body: {
        targetTier: tierName,
        priceId: priceIds[tierName]
      }
    })

    // Redirect to Stripe checkout
    const redirectUrl = (response as Record<string, unknown>)?.redirectUrl as string | undefined
    if (redirectUrl) {
      window.location.href = redirectUrl
    }
  }
  catch (err) {
    console.error('Error al mejorar plan:', err)
    const errorData = err as { data?: { message?: string } }
    error.value = errorData.data?.message || 'No se pudo mejorar el plan'
    upgrading.value = false
  }
}

async function downgrade(tierName: string) {
  if (!confirm(`¿Seguro que quieres cambiar al plan ${tierLabel(tierName as UserProfile['tier'])}?`)) {
    return
  }

  downgrading.value = true
  error.value = ''
  try {
    await $fetch('/api/account/downgrade', {
      method: 'POST',
      body: { targetTier: tierName }
    })

    await fetchProfile()
  }
  catch (err) {
    console.error('Error al bajar plan:', err)
    const errorData = err as { data?: { message?: string } }
    error.value = errorData.data?.message || 'No se pudo bajar el plan'
  }
  finally {
    downgrading.value = false
  }
}

onMounted(async () => {
  await fetchProfile()
})

function tierLabel(tier: UserProfile['tier']) {
  const labels: Record<UserProfile['tier'], string> = {
    free: 'Gratis',
    premium: 'Premium',
    enterprise: 'Empresarial'
  }

  return labels[tier]
}
</script>
