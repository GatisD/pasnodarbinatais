import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

type AuthContextValue = {
  isLoading: boolean
  isSupabaseConfigured: boolean
  session: Session | null
  user: User | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isSupabaseConfigured,
        session,
        user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
