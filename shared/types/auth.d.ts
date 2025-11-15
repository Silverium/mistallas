declare module '#auth-utils' {
  interface User {
    id: string
    login: string
  }
  interface UserSession {
    // Add your own fields
    id: string
    user: User
  }
}

export {}
