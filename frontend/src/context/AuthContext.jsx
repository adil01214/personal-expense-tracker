import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('expense-token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('expense-user')) } catch { return null }
  })

  useEffect(() => {
    const expire = () => logout()
    window.addEventListener('auth-expired', expire)
    return () => window.removeEventListener('auth-expired', expire)
  }, [])

  async function authenticate(path, values) {
    const result = await api(path, { method: 'POST', body: JSON.stringify(values) })
    localStorage.setItem('expense-token', result.access_token)
    localStorage.setItem('expense-user', JSON.stringify(result.user))
    setToken(result.access_token)
    setUser(result.user)
  }

  function logout() {
    localStorage.removeItem('expense-token')
    localStorage.removeItem('expense-user')
    setToken(null)
    setUser(null)
  }

  const value = useMemo(() => ({ token, user, login: (v) => authenticate('/auth/login', v), register: (v) => authenticate('/auth/register', v), logout }), [token, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
