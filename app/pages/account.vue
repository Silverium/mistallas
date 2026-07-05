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
            <!-- Free Tier -->
            <div
              :class="[
                'p-4 border-2 rounded-lg',
                profile.tier === 'free' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              ]"
            >
              <p class="text-lg font-semibold text-gray-900">
                Gratis
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-2">
                $0
              </p>
              <p class="text-sm text-gray-600 mt-1">
                200 compras/mes
              </p>
              <button
                v-if="profile.tier !== 'free'"
                :disabled="downgrading"
                class="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                @click="downgrade('free')"
              >
                {{ downgrading ? 'Cambiando...' : 'Bajar plan' }}
              </button>
              <p
                v-else
                class="w-full mt-4 text-center text-sm text-gray-600"
              >
                Plan actual
              </p>
            </div>

            <!-- Premium Tier -->
            <div
              :class="[
                'p-4 border-2 rounded-lg',
                profile.tier === 'premium' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              ]"
            >
              <p class="text-lg font-semibold text-gray-900">
                Premium
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-2">
                $9.99
              </p>
              <p class="text-sm text-gray-600 mt-1">
                /mes
              </p>
              <p class="text-sm text-gray-600 mt-1">
                5.000 compras/mes
              </p>
              <button
                v-if="profile.tier !== 'premium'"
                :disabled="upgrading"
                class="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                @click="upgrade('premium')"
              >
                {{ upgrading ? 'Redirigiendo...' : 'Mejorar a Premium' }}
              </button>
              <p
                v-else
                class="w-full mt-4 text-center text-sm text-gray-600"
              >
                Plan actual
              </p>
              <button
                v-if="profile.tier === 'premium' && profile.subscriptionStatus === 'active'"
                :disabled="downgrading"
                class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                @click="downgrade('free')"
              >
                {{ downgrading ? 'Cambiando...' : 'Bajar plan' }}
              </button>
            </div>

            <!-- Enterprise Tier -->
            <div
              :class="[
                'p-4 border-2 rounded-lg',
                profile.tier === 'enterprise' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              ]"
            >
              <p class="text-lg font-semibold text-gray-900">
                Empresarial
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-2">
                $29.99
              </p>
              <p class="text-sm text-gray-600 mt-1">
                /mes
              </p>
              <p class="text-sm text-gray-600 mt-1">
                Compras ilimitadas
              </p>
              <button
                v-if="profile.tier !== 'enterprise'"
                :disabled="upgrading"
                class="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                @click="upgrade('enterprise')"
              >
                {{ upgrading ? 'Redirigiendo...' : 'Mejorar a Empresarial' }}
              </button>
              <p
                v-else
                class="w-full mt-4 text-center text-sm text-gray-600"
              >
                Plan actual
              </p>
              <button
                v-if="profile.tier === 'enterprise' && profile.subscriptionStatus === 'active'"
                :disabled="downgrading"
                class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                @click="downgrade('premium')"
              >
                {{ downgrading ? 'Cambiando...' : 'Bajar a Premium' }}
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

const profile = ref<UserProfile>({
  tier: 'free',
  purchaseCount: 0,
  limit: 200,
  subscriptionStatus: null
})

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
    const { data } = await useFetch('/api/account/profile')
    profile.value = data.value || {}
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

    const { data } = await $fetch('/api/account/upgrade', {
      method: 'POST',
      body: {
        targetTier: tierName,
        priceId: priceIds[tierName]
      }
    })

    // Redirect to Stripe checkout
    if (data?.redirectUrl) {
      window.location.href = data.redirectUrl
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

onMounted(() => {
  fetchProfile()
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
