<script setup lang="ts">
definePageMeta({ layout: false })

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function register() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value },
    })
    await navigateTo('/dashboard')
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Erro ao criar conta.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-bold text-center">Criar conta</h1>
      </template>

      <form class="space-y-4" @submit.prevent="register">
        <UFormGroup label="Nome">
          <UInput v-model="name" type="text" autocomplete="name" required />
        </UFormGroup>
        <UFormGroup label="E-mail">
          <UInput v-model="email" type="email" autocomplete="email" required />
        </UFormGroup>
        <UFormGroup label="Senha">
          <UInput v-model="password" type="password" autocomplete="new-password" required minlength="8" />
        </UFormGroup>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <UButton type="submit" :loading="loading" block>Criar conta</UButton>
      </form>

      <template #footer>
        <p class="text-sm text-center text-gray-500">
          Já tem conta?
          <NuxtLink to="/auth/login" class="text-primary-500 hover:underline">Entrar</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
