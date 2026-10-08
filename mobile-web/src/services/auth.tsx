import type { AuthenticatorAssuranceLevels, Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Profile } from '../types/domain'
import { authRedirect, supabase } from './supabase'

interface Assurance {
  // aal1 = sólo contraseña; aal2 = contraseña + código de la app de autenticación.
  current: AuthenticatorAssuranceLevels | null
  // aal2 si el usuario ya tiene un segundo factor verificado.
  next: AuthenticatorAssuranceLevels | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  assurance: Assurance
  recovering: boolean
  loading: boolean
  refresh: () => Promise<void>
  finishRecovery: () => void
  signOut: () => Promise<void>
}

const NO_ASSURANCE: Assurance = { current: null, next: null }
const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data as Profile | null
}

async function fetchAssurance(): Promise<Assurance> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data ? { current: data.currentLevel, next: data.nextLevel } : NO_ASSURANCE
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assurance, setAssurance] = useState<Assurance>(NO_ASSURANCE)
  const [recovering, setRecovering] = useState(authRedirect.recovery)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setAssurance(NO_ASSURANCE)
        setRecovering(false)
        setLoading(false)
        return
      }
      // Fuera del callback: supabase-js no permite llamadas a la API dentro de él.
      setTimeout(() => {
        Promise.all([fetchProfile(nextSession.user.id), fetchAssurance()]).then(([nextProfile, nextAssurance]) => {
          setProfile(nextProfile)
          setAssurance(nextAssurance)
          setLoading(false)
        })
      }, 0)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session) return
    const [nextProfile, nextAssurance] = await Promise.all([fetchProfile(session.user.id), fetchAssurance()])
    setProfile(nextProfile)
    setAssurance(nextAssurance)
  }, [session])

  const finishRecovery = useCallback(() => setRecovering(false), [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, assurance, recovering, loading, refresh, finishRecovery, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// El hook vive junto a su proveedor; sólo afecta la recarga en caliente en desarrollo.
// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
