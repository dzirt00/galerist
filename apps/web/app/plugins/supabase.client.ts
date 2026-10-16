import {createClient} from '@supabase/supabase-js'
import {defineNuxtPlugin, useRuntimeConfig} from 'nuxt/app'


export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const supabase = createClient(config.public.supabaseUrl, config.public.supabasePublishableKey)

  return {
    provide: {
      supabase: supabase
    }
  }
})


