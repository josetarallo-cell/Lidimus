<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Fora do NuxtLayout de propósito: a landing usa `layout: false` e é
         justamente onde o visitante anônimo chega primeiro. -->
    <AvisoCookies />
  </UApp>
</template>
