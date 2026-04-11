'use client'

import { createContext, useContext } from 'react'

interface UserProfile {
  displayName: string
  firstName: string
  initials: string
  isNewUser: boolean
}

interface UserProfileProviderProps {
  displayName: string
  initials: string
  isNewUser: boolean
  children: React.ReactNode
}

const UserProfileContext = createContext<UserProfile>({
  displayName: '',
  firstName: '',
  initials: '',
  isNewUser: false,
})

export function UserProfileProvider({
  displayName,
  initials,
  isNewUser,
  children,
}: UserProfileProviderProps) {
  const firstName = displayName.split(' ')[0] || displayName
  return (
    <UserProfileContext.Provider value={{ displayName, firstName, initials, isNewUser }}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  return useContext(UserProfileContext)
}
