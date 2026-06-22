<template>
  <div class="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <header class="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <NuxtLink to="/dashboard" class="text-lg font-semibold text-gray-900 dark:text-white">
          Lidimus
        </NuxtLink>
        <nav class="flex items-center gap-4">
          <NuxtLink to="/matriculas" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            Matrículas
          </NuxtLink>
          <NuxtLink to="/kml" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            KML
          </NuxtLink>
          <NuxtLink to="/injection" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            Detector
          </NuxtLink>
        </nav>
      </div>
    </header>
    <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
      <slot />
    </main>
  </div>
</template>
