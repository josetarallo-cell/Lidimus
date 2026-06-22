<script setup lang="ts">
definePageMeta({ layout: false })

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function login() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    await navigateTo('/dashboard')
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Credenciais inválidas.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Entrar no Lidimus</h1>
      </template>

      <form class="space-y-4" @submit.prevent="login">
        <UFormGroup label="E-mail">
          <UInput v-model="email" type="email" autocomplete="email" required />
        </UFormGroup>
        <UFormGroup label="Senha">
          <UInput v-model="password" type="password" autocomplete="current-password" required />
        </UFormGroup>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <UButton type="submit" :loading="loading" block>Entrar</UButton>
      </form>

      <template #footer>
        <p class="text-sm text-center text-gray-500">
          Não tem conta?
          <NuxtLink to="/auth/register" class="text-primary-500 hover:underline">Criar conta</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
