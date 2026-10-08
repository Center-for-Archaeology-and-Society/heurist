<template>
  <div class="login page">
    <form class="login__panel" @submit.prevent="submit">
      <h1 class="login__title">Heurist</h1>
      <p class="muted login__subtitle">Sign in to your database</p>

      <label class="login__label" for="login-db">Database</label>
      <input
        id="login-db"
        v-model.trim="db"
        class="input"
        type="text"
        autocomplete="off"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        required
      >

      <label class="login__label" for="login-user">Username</label>
      <input
        id="login-user"
        v-model.trim="username"
        class="input"
        type="text"
        autocomplete="username"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        :autofocus="Boolean(db)"
        required
      >

      <label class="login__label" for="login-pass">Password</label>
      <div class="login__pass">
        <input
          id="login-pass"
          v-model="password"
          class="input"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          required
        >
        <button
          class="login__toggle"
          type="button"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          @click="showPassword = !showPassword"
        >{{ showPassword ? 'Hide' : 'Show' }}</button>
      </div>

      <p v-if="error" class="login__error" role="alert">{{ error }}</p>

      <button class="btn login__submit" type="submit" :disabled="busy">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth, lastDb } from '../store/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const db = ref(typeof route.query.db === 'string' ? route.query.db : lastDb())
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const showPassword = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await auth.login(db.value, username.value, password.value)
    router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (err) {
    error.value = err.status === 401
      ? 'Invalid database, username or password'
      : (err.message || 'Login failed')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login {
  justify-content: center;
  padding: var(--space-5);
}

.login__panel {
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}

.login__title {
  margin-bottom: 0;
  font-size: var(--font-size-xl);
  color: var(--color-primary);
}

.login__subtitle {
  margin-top: var(--space-1);
}

.login__label {
  display: block;
  margin: var(--space-3) 0 var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
}

.login__pass {
  position: relative;
  display: flex;
  align-items: center;
}

.login__pass .input {
  padding-right: 64px;
}

.login__toggle {
  position: absolute;
  right: var(--space-2);
  min-width: var(--tap);
  min-height: var(--tap);
  border: none;
  background: none;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.login__submit {
  width: 100%;
  margin-top: var(--space-4);
}

.login__error {
  margin: var(--space-3) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}
</style>
