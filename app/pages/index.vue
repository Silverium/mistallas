<template>
  <div class="flex flex-col gap-4">
    <p class="font-medium">
      ¡Bienvenido!
    </p>
    <p>
      A <a
        href="https://nuxt.com"
        target="_blank"
        class="text-primary"
        rel="noopener"
      >Nuxt</a> demo hosted on <a
        href="https://pages.cloudflare.com"
        target="_blank"
        rel="noopener"
        class="text-primary"
      >Cloudflare Pages</a> with server-side rendering on the edge and using <NuxtLink
        href="https://developers.cloudflare.com/d1/"
        target="_blank"
        rel="noopener"
        class="text-primary"
      >
        Cloudflare D1 database
      </NuxtLink>.
    </p>
    <p>
      It is made using <a
        href="https://hub.nuxt.com"
        class="text-primary"
      >NuxtHub</a> for a zero-config development & deployment experience on Cloudflare.
    </p>
    <USeparator />
    <p class="text-sm text-muted italic">
      No se almacena ninguna información personal de tu cuenta de GitHub en la base de datos.<br>
      Solo almacenamos los todos que creas vinculados con tu ID de GitHub.
    </p>
  </div>
</template>
