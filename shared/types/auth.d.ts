declare module '#auth-utils' {
  interface User {
    id: string
    login: string
    email?: string
    avatarUrl?: string
    loginProvider?: 'github' | 'google' | 'instagram' | 'apple'
    role: 'user' | 'admin'
    tier: 'free' | 'premium' | 'enterprise'
  }
  interface UserSession {
    // Add your own fields
    id: string
    user: User
    role: 'user' | 'admin'
  }
}

export {}
