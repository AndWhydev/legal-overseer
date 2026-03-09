'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const VIDEO_WEBM = '/media/onboarding-sky-loop.webm'
const VIDEO_MP4 = '/media/onboarding-sky-loop.mp4'
const POSTER_SRC = '/media/onboarding-sky-poster.jpg'

function canPlayWebm() {
  if (typeof document === 'undefined') return false
  const v = document.createElement('video')
  return v.canPlayType('video/webm; codecs="vp9"') === 'probably'
}

function CloudLayer({
  className,
  duration,
  delay = 0,
}: {
  className: string
  duration: number
  delay?: number
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={`absolute rounded-full ${className}`}
      animate={{
        x: ['-3%', '4%', '-2%'],
        y: ['0%', '-2%', '1%'],
        scale: [1, 1.04, 0.98, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
        repeatType: 'reverse',
      }}
    />
  )
}

function AtmosphericFallback() {
  return (
    <>
      <motion.div
        className="absolute inset-[-10%] bg-[radial-gradient(circle_at_18%_18%,rgba(200,228,255,0.98)_0%,rgba(170,210,255,0.8)_16%,rgba(130,190,255,0.46)_44%,rgba(80,150,230,0.22)_68%,rgba(50,120,200,0.14)_100%)]"
        animate={{
          scale: [1, 1.04, 1.01, 1],
          x: ['0%', '1.5%', '-1%', '0%'],
          y: ['0%', '-1.5%', '1%', '0%'],
        }}
        transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }}
      />
      <CloudLayer
        className="left-[-10%] top-[8%] h-[24rem] w-[40rem] bg-[radial-gradient(circle,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.46)_34%,rgba(255,255,255,0.04)_74%)] blur-[36px]"
        duration={58}
      />
      <CloudLayer
        className="right-[-12%] top-[16%] h-[30rem] w-[46rem] bg-[radial-gradient(circle,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.34)_38%,rgba(255,255,255,0)_78%)] blur-[44px]"
        duration={74}
        delay={0.8}
      />
      <CloudLayer
        className="left-[12%] bottom-[6%] h-[22rem] w-[52rem] bg-[radial-gradient(circle,rgba(255,255,255,0.55)_0%,rgba(235,244,255,0.24)_42%,rgba(255,255,255,0)_82%)] blur-[52px]"
        duration={92}
        delay={1.4}
      />
    </>
  )
}

export function SkyVideoBackdrop() {
  const reduceMotion = useReducedMotion()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [posterVisible, setPosterVisible] = useState(true)
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined)

  const hasMotionVideo = !reduceMotion && videoEnabled

  useEffect(() => {
    if (!hasMotionVideo) return
    setVideoSrc(canPlayWebm() ? VIDEO_WEBM : VIDEO_MP4)
  }, [hasMotionVideo])

  const playVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    try {
      await video.play()
    } catch {
      setVideoEnabled(false)
      setPosterVisible(true)
    }
  }, [])

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#c8e4ff]" />

      <div className="absolute inset-[-8%]">
        <Image
          src={POSTER_SRC}
          alt=""
          fill
          priority
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1800ms] ${posterVisible || !hasMotionVideo ? 'opacity-100' : 'opacity-0'}`}
        />

        {hasMotionVideo && videoSrc ? (
          <video
            ref={videoRef}
            data-testid="sky-video-layer-0"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[2200ms] ${!posterVisible ? 'opacity-100' : 'opacity-0'}`}
            src={videoSrc}
            poster={POSTER_SRC}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            onCanPlayThrough={() => {
              setPosterVisible(false)
              void playVideo()
            }}
            onError={() => {
              if (videoSrc === VIDEO_WEBM) {
                setVideoSrc(VIDEO_MP4)
              } else {
                setVideoEnabled(false)
                setPosterVisible(true)
              }
            }}
          />
        ) : null}
      </div>

      <AtmosphericFallback />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04)_24%,rgba(255,255,255,0)_46%,rgba(220,236,255,0.18)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_14%,rgba(255,250,240,0.36),rgba(255,255,255,0)_20%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.2),rgba(255,255,255,0)_26%),radial-gradient(circle_at_52%_84%,rgba(180,214,255,0.16),rgba(255,255,255,0)_32%)]" />
      <motion.div
        className="absolute inset-0 opacity-[0.08]"
        animate={{ opacity: [0.06, 0.1, 0.07, 0.08] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0)), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
          backgroundSize: '100% 100%, 24px 24px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.28), rgba(0,0,0,0))',
        }}
      />
    </div>
  )
}
