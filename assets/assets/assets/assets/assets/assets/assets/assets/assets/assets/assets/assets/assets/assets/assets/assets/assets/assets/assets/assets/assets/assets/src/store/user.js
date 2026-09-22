import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    username: localStorage.getItem('cfdi_username') || '',
    role: localStorage.getItem('cfdi_role') || '',
    token: localStorage.getItem('cfdi_token') || ''
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.role === 'admin'
  },
  actions: {
    login(username, role) {
      this.username = username
      this.role = role
      this.token = 'demo-token-' + Date.now()
      localStorage.setItem('cfdi_username', username)
      localStorage.setItem('cfdi_role', role)
      localStorage.setItem('cfdi_token', this.token)
    },
    logout() {
      this.username = ''
      this.role = ''
      this.token = ''
      localStorage.removeItem('cfdi_username')
      localStorage.removeItem('cfdi_role')
      localStorage.removeItem('cfdi_token')
    }
  }
})
