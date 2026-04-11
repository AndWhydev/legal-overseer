'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface DrawerContextValue {
  content: ReactNode | null
  isOpen: boolean
  setDrawer: (content: ReactNode) => void
  closeDrawer: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

interface DrawerProviderProps {
  activeTab: string
  children: ReactNode
}

export function DrawerProvider({ activeTab, children }: DrawerProviderProps) {
  const [content, setContent] = useState<ReactNode | null>(null)

  const setDrawer = useCallback((node: ReactNode) => {
    setContent(node)
  }, [])

  const closeDrawer = useCallback(() => {
    setContent(null)
  }, [])

  // Auto-close on tab change
  useEffect(() => {
    setContent(null)
  }, [activeTab])

  const value: DrawerContextValue = {
    content,
    isOpen: content !== null,
    setDrawer,
    closeDrawer,
  }

  return (
    <DrawerContext.Provider value={value}>
      {children}
    </DrawerContext.Provider>
  )
}

export function useDrawer() {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider')
  }
  return context
}
