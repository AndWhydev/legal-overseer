'use client'
import { useState } from 'react'

export function ImageLightbox({ src, alt }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={alt || ''}
        onClick={() => setOpen(true)}
        style={{ cursor: 'zoom-in', borderRadius: '8px', border: '1px solid rgb(222,222,220)', maxWidth: '100%' }}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img src={src} alt={alt || ''} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
        </div>
      )}
    </>
  )
}
