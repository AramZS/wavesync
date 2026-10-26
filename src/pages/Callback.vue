<template lang="pug">
.callback
  .text
    p(v-if="error") {{ error }}
    p(v-else) Finishing sign-in…
</template>

<script>
import { handleCallback } from '@/auth/pkce'
import * as tokenManager from '@/auth/tokens'

// How long to leave the error message on screen before routing home (Req 3.9, 3.10).
const HOME_REDIRECT_DELAY = 2000

export default {
  data () {
    return {
      error: null,
      done: false
    }
  },

  mounted () {
    handleCallback({
      query: this.$route.query,
      tokenManager,
      onSuccess: () => {
        this.done = true
        this.$router.replace('/visualizer')
      },
      onFailure: (err) => {
        this.error = typeof err === 'string' && err.length > 0
          ? err
          : (err && err.message) || 'Sign-in failed. Returning home…'
        this.homeTimer = setTimeout(() => {
          this.$router.replace('/')
        }, HOME_REDIRECT_DELAY)
      }
    })
  },

  beforeDestroy () {
    if (this.homeTimer) {
      clearTimeout(this.homeTimer)
      this.homeTimer = null
    }
  }
}
</script>

<style lang="scss" scoped>
.callback {
  @include position(fixed, 0 0 0 0);
  @include flex;
}

.text {
  position: relative;
  text-align: center;
}

p {
  font-family: 'Covered By Your Grace';
  color: white;
  @include scale(font-size 26px 18px, line-height 26px 18px);
}
</style>
