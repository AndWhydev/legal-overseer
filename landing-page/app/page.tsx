"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";

// ─── Types ──────────────────────────────────────────────────────────

interface IntegrationIcon {
  name: string;
  color: string;
  iconUrl: string;
}

interface RingConfig {
  radius: number;
  icons: IntegrationIcon[];
  duration: number;
  direction: "cw" | "ccw";
  iconSize: number;
  blur: number;
  ringOpacity: number;
  zOffset: number; // 3D depth: negative = farther, positive = closer
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

// ─── Data ───────────────────────────────────────────────────────────

const INNER_ICONS: IntegrationIcon[] = [
  { name: "Gmail", color: "#EA4335", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/6a/93/5c/6a935c3f-84f6-38d2-8221-1e4449707de6/logo_gmail_2020q4_color-0-1x_U007emarketing-0-0-0-7-0-0-0-0-85-220-0.png/512x512bb.jpg" },
  { name: "WhatsApp", color: "#25D366", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/88/f4/0d/88f40df9-9a8c-235f-dc2c-48c3bd5b4345/AppIcon-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-0-85-220.png/512x512bb.jpg" },
  { name: "Slack", color: "#4A154B", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/1b/06/431b06ff-3c7a-6506-26c2-ef44089c9339/slack_icon_prod-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg" },
  { name: "Google Calendar", color: "#4285F4", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/4e/21/49/4e2149a7-5793-ecf1-9f84-7f5e0d552667/calendar_2020q4-0-1x_U007epad-0-0-0-1-0-0-0-0-85-220-0.png/512x512bb.jpg" },
  { name: "Stripe", color: "#635BFF", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e5/c1/65/e5c16500-54e3-9a56-e0c9-f369e736e359/AppIcon-0-0-1x_U007ephone-0-1-0-85-220-0.png/512x512bb.jpg" },
  { name: "Outlook", color: "#0078D4", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d2/b5/20/d2b52073-b169-b041-7d8a-f0581fc6eef9/AppIcon-outlook.prod-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg" },
  { name: "Xero", color: "#13B5EA", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/a3/87/98/a3879862-1b54-a12b-5acc-f7184579d615/AppIcon-0-0-1x_U007epad-0-0-0-1-0-0-85-220.png/512x512bb.jpg" },
  { name: "Instagram", color: "#E4405F", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/44/e7/3e/44e73e4c-1819-1c3b-6032-8398e74507e5/Prod-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg" },
];

const MIDDLE_ICONS: IntegrationIcon[] = [
  { name: "Shopify", color: "#96BF48", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/cc/ac/e4/ccace45c-899a-1761-3f11-9e8112d510e8/AppIcon-com.jadedpixel.shopify-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg" },
  { name: "Notion", color: "#000000", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/55/87/64/5587648b-ba65-1969-b52b-1dceb87f6896/AppIconProd-0-0-1x_U007epad-0-0-0-1-0-0-P3-85-220.png/512x512bb.jpg" },
  { name: "HubSpot", color: "#FF7A59", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/5b/a0/68/5ba06822-1a63-0c90-81c6-64ce8b593dec/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg" },
  { name: "Zoom", color: "#2D8CFF", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/77/43/90/77439005-1456-e75d-63ba-ccac071f1f12/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg" },
  { name: "Trello", color: "#0052CC", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/7c/56/bc/7c56bc0e-8bed-9022-bae4-003ac33f4982/AppIcon-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg" },
  { name: "Salesforce", color: "#00A1E0", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2c/03/b1/2c03b13b-940c-801e-633c-72d5c191bd65/AppIcon-0-0-1x_U007emarketing-0-8-0-0-0-85-220.png/512x512bb.jpg" },
  { name: "Asana", color: "#F06A6A", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/46/2a/c2/462ac2bd-3a0a-2e25-ef1c-59e7a2d7c1f6/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg" },
  { name: "Dropbox", color: "#0061FF", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ae/d0/61/aed061dd-31e5-9985-e59b-b5c6ad26945d/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg" },
  { name: "QuickBooks", color: "#2CA01C", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/12/4a/3e/124a3e02-77f3-d682-6afe-b54f610ba279/QBMAppIcon-0-0-1x_U007emarketing-0-0-0-8-0-0-85-220.png/512x512bb.jpg" },
  { name: "Mailchimp", color: "#FFE01B", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f1/3a/c5/f13ac50a-3c34-3f5b-3235-9b33653e4d0b/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg" },
  { name: "Intercom", color: "#6AFDEF", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1f/cd/1a/1fcd1a3b-f777-c107-bbb6-1c89ddfbdf85/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg" },
  { name: "Monday", color: "#6C36F9", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fb/23/ea/fb23ea5b-d992-a4ec-462f-95bd4a6befc8/AppIcon-Monday-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg" },
];

const OUTER_ICONS: IntegrationIcon[] = [
  { name: "GitHub", color: "#181717", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/5b/c6/e3/5bc6e33d-8636-25c4-a796-5946378e2bff/AppIcon-0-0-1x_U007epad-0-1-P3-85-220.png/512x512bb.jpg" },
  { name: "Figma", color: "#F24E1E", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/7e/7a/f2/7e7af2ed-d3b3-be1d-fa77-d78cf732b881/AppIcon-0-1x_U007epad-0-1-0-85-220-0.png/512x512bb.jpg" },
  { name: "Discord", color: "#5865F2", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fa/94/a9/fa94a9e9-b5d7-4dd9-8192-8e30ee87e9ba/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg" },
  { name: "X", color: "#000000", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/69/13/16/69131624-7232-3d78-8c2b-44494958efad/ProductionAppIcon-0-0-1x_U007emarketing-0-8-0-0-0-85-220.png/512x512bb.jpg" },
  { name: "LinkedIn", color: "#0A66C2", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/13/d8/3c/13d83c04-e177-5373-1387-665377b29229/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg" },
  { name: "Zapier", color: "#FF4A00", iconUrl: "https://www.google.com/s2/favicons?domain=zapier.com&sz=128" },
  { name: "Airtable", color: "#18BFFF", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/85/b8/34/85b8340c-04b7-4625-5b48-3ddd3297f937/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg" },
  { name: "Teams", color: "#6264A7", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/4f/b7/17/4fb717df-6edb-1018-b6d3-4699d35c1a8d/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg" },
  { name: "Jira", color: "#0052CC", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/48/01/29/480129a0-0283-ec71-2882-febb97ff50d0/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg" },
  { name: "Confluence", color: "#172B4D", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e1/e2/0b/e1e20beb-85d3-329e-fb1f-cf8b72141ad9/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg" },
  { name: "Zendesk", color: "#03363D", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/22/fe/f7/22fef799-3e4c-4c00-5ceb-f64b4894420d/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg" },
  { name: "Twilio", color: "#F22F46", iconUrl: "https://www.google.com/s2/favicons?domain=twilio.com&sz=128" },
  { name: "SendGrid", color: "#1A82E2", iconUrl: "https://www.google.com/s2/favicons?domain=sendgrid.com&sz=128" },
  { name: "AWS", color: "#FF9900", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/2b/9b/05/2b9b053e-0cef-c070-e436-955dade229e2/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg" },
  { name: "Google Drive", color: "#4285F4", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f7/27/eb/f727eb85-ea72-e278-0672-0adf7d6b044b/drive_2020q4-0-1x_U007epad-0-0-0-1-0-0-0-0-85-220-0.png/512x512bb.jpg" },
  { name: "Freshdesk", color: "#25C16F", iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/4e/42/c1/4e42c13f-f10b-0499-1886-db5f0a1075d8/AppIcon-0-1x_U007emarketing-0-8-0-sRGB-0-85-220-0.png/512x512bb.jpg" },
];

const RING_CONFIGS: RingConfig[] = [
  { radius: 280, icons: INNER_ICONS, duration: 70, direction: "cw", iconSize: 60, blur: 1.5, ringOpacity: 0.85, zOffset: -120 },
  { radius: 520, icons: MIDDLE_ICONS, duration: 90, direction: "ccw", iconSize: 100, blur: 4, ringOpacity: 0.6, zOffset: 0 },
  { radius: 800, icons: OUTER_ICONS, duration: 140, direction: "cw", iconSize: 140, blur: 8, ringOpacity: 0.4, zOffset: 120 },
];

const CONFETTI_COLORS = ["#0079da", "#10b981", "#fbbf24", "#f472b6", "#ffffff"];

// ─── Confetti Hook ──────────────────────────────────────────────────

function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const animFrameRef = useRef<number>(0);

  const fire = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: ConfettiParticle[] = [];
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.65;

    for (let i = 0; i < 50; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }
    particlesRef.current = particles;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particlesRef.current) {
        if (p.opacity <= 0) continue;
        alive = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.008;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (alive) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(animFrameRef.current);
    animate();
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return { canvasRef, fire };
}

// ─── Spotlight Component ────────────────────────────────────────────

function Spotlight() {
  const gradientFirst = "radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(210, 100%, 85%, .08) 0, hsla(210, 100%, 55%, .02) 50%, hsla(210, 100%, 45%, 0) 80%)";
  const gradientSecond = "radial-gradient(50% 50% at 50% 50%, hsla(210, 100%, 85%, .06) 0, hsla(210, 100%, 55%, .02) 80%, transparent 100%)";
  const gradientThird = "radial-gradient(50% 50% at 50% 50%, hsla(210, 100%, 85%, .04) 0, hsla(210, 100%, 45%, .02) 80%, transparent 100%)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
    >
      {/* Left beam group */}
      <motion.div
        animate={{ x: [0, 100, 0] }}
        transition={{ duration: 7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 40, pointerEvents: "none" }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, transform: "translateY(-350px) rotate(-45deg)", background: gradientFirst, width: 560, height: 1380 }} />
        <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "rotate(-45deg) translate(5%, -50%)", background: gradientSecond, width: 240, height: 1380 }} />
        <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: "rotate(-45deg) translate(-180%, -70%)", background: gradientThird, width: 240, height: 1380 }} />
      </motion.div>

      {/* Right beam group */}
      <motion.div
        animate={{ x: [0, -100, 0] }}
        transition={{ duration: 7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        style={{ position: "absolute", top: 0, right: 0, width: "100vw", height: "100vh", zIndex: 40, pointerEvents: "none" }}
      >
        <div style={{ position: "absolute", top: 0, right: 0, transform: "translateY(-350px) rotate(45deg)", background: gradientFirst, width: 560, height: 1380 }} />
        <div style={{ position: "absolute", top: 0, right: 0, transformOrigin: "top right", transform: "rotate(45deg) translate(-5%, -50%)", background: gradientSecond, width: 240, height: 1380 }} />
        <div style={{ position: "absolute", top: 0, right: 0, transformOrigin: "top right", transform: "rotate(45deg) translate(180%, -70%)", background: gradientThird, width: 240, height: 1380 }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Integration Icon ───────────────────────────────────────────────

function IntegrationIconBadge({
  icon,
  size,
  angle,
  radius,
  blur,
}: {
  icon: IntegrationIcon;
  size: number;
  angle: number;
  radius: number;
  blur: number;
}) {
  const x = Math.cos((angle * Math.PI) / 180) * radius;
  const y = Math.sin((angle * Math.PI) / 180) * radius;

  // Rotate icon so its top faces toward the ring center
  const faceCenterDeg = angle + 90;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: x - size / 2,
        marginTop: y - size / 2,
        transform: `rotate(${faceCenterDeg}deg)`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: size * 0.22,
          overflow: "hidden",
          boxShadow: `0 0 20px ${icon.color}15`,
          border: `1px solid rgba(255, 255, 255, 0.08)`,
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
        }}
        title={icon.name}
      >
        <img
          src={icon.iconUrl}
          alt={icon.name}
          width={size}
          height={size}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          loading="lazy"
        />
      </div>
    </div>
  );
}

// ─── Integration Ring ───────────────────────────────────────────────

function IntegrationRing({ config }: { config: RingConfig }) {
  const { radius, icons, duration, direction, iconSize, blur, ringOpacity, zOffset } = config;
  const animName = direction === "cw" ? "ring-cw" : "ring-ccw";

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: radius * 2,
        height: radius * 2,
        marginLeft: -radius,
        marginTop: -radius,
        transform: `translateZ(${zOffset}px)`,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          animation: `${animName} ${duration}s linear infinite`,
          opacity: ringOpacity,
          position: "relative",
        }}
      >
        {icons.map((icon, i) => {
          const angle = (360 / icons.length) * i;
          return (
            <IntegrationIconBadge
              key={icon.name}
              icon={icon}
              size={iconSize}
              angle={angle}
              radius={radius}
              blur={blur}
            />
          );
        })}
      </div>
    </div>
  );
}


// ─── Waitlist Form ──────────────────────────────────────────────────

function WaitlistForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || status === "loading") return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMsg("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("success");
      onSuccess();
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {status === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8, rotateX: -15 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              height: 60,
              borderRadius: 9999,
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              animation: "success-glow 2s ease-in-out infinite",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "success-pulse 0.6s ease-out",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{ overflow: "visible" }}
              >
                <path
                  d="M3 8.5L6.5 12L13 4"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 20,
                    strokeDashoffset: 20,
                    animation: "checkmark-draw 0.4s ease-out 0.3s forwards",
                  }}
                />
              </svg>
            </div>
            <span
              style={{
                color: "#10b981",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Spot claimed. See you soon.
            </span>
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: 9999,
                border: "2px solid rgba(16, 185, 129, 0.2)",
                animation: "celebration-ring 1s ease-out forwards",
                pointerEvents: "none",
              }}
            />
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, rotateX: 10 }}
            transition={{ duration: 0.3 }}
            style={{ position: "relative" }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                height: 60,
                borderRadius: 9999,
                backgroundColor: "#27272a",
                border: `1px solid ${status === "error" ? "rgba(239, 68, 68, 0.5)" : "rgba(255, 255, 255, 0.08)"}`,
                transition: "border-color 0.2s",
                overflow: "hidden",
              }}
            >
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                style={{
                  flex: 1,
                  height: "100%",
                  backgroundColor: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#ffffff",
                  fontSize: 16,
                  paddingLeft: 24,
                  paddingRight: 8,
                  fontFamily: "inherit",
                }}
                disabled={status === "loading"}
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={status === "loading" || !email}
                style={{
                  height: 44,
                  borderRadius: 9999,
                  backgroundColor: status === "loading" ? "#005ba3" : "#0079da",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 600,
                  paddingLeft: 24,
                  paddingRight: 24,
                  marginRight: 8,
                  border: "none",
                  cursor: status === "loading" ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background-color 0.2s",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (status !== "loading") {
                    (e.target as HTMLButtonElement).style.backgroundColor = "#006bc4";
                  }
                }}
                onMouseLeave={(e) => {
                  if (status !== "loading") {
                    (e.target as HTMLButtonElement).style.backgroundColor = "#0079da";
                  }
                }}
              >
                {status === "loading" ? (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: "2px solid rgba(255, 255, 255, 0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "ring-cw 0.7s linear infinite",
                    }}
                  />
                ) : (
                  "Get early access"
                )}
              </button>
            </div>

            {status === "error" && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  color: "#ef4444",
                  fontSize: 13,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {errorMsg}
              </motion.p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const { canvasRef, fire } = useConfetti();

  return (
    <>
      <style>{`
        @keyframes ring-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ring-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes center-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 40px rgba(0, 121, 218, 0.3), 0 0 80px rgba(0, 121, 218, 0.15);
          }
          50% {
            transform: scale(1.03);
            box-shadow: 0 0 60px rgba(0, 121, 218, 0.4), 0 0 120px rgba(0, 121, 218, 0.2);
          }
        }
        @keyframes bounce-in {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes success-pulse {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes success-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.1); }
          50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.2); }
        }
        @keyframes checkmark-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes celebration-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }

        /* Reduce motion for users who prefer it */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <main
        style={{
          position: "relative",
          minHeight: "100vh",
          backgroundColor: "#09090b",
          overflow: "hidden",
          fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Confetti Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 50,
          }}
        />

        {/* Background layers */}
        <Spotlight />

        {/* ─── Integration Rings (Perspective Container) ─── */}
        <div
          style={{
            position: "absolute",
            top: "65%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 1800,
            height: 1800,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              perspective: "1200px",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
                transformStyle: "preserve-3d",
                transform: "rotateX(10deg)",
                transformOrigin: "center center",
                opacity: 0.7,
              }}
            >
              {/* Rings */}
              {RING_CONFIGS.map((config, i) => (
                <IntegrationRing key={i} config={config} />
              ))}
            </div>
          </div>
        </div>

        {/* ─── Gradient Overlay (bottom fade for readability) ─── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, #09090b 10%, rgba(9, 9, 11, 0.8) 40%, transparent 100%)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        />

        {/* ─── Content ─── */}
        <div
          className="flex flex-col items-center justify-end px-6 pb-16 md:pb-20"
          style={{
            position: "relative",
            minHeight: "100vh",
            zIndex: 20,
          }}
        >
          <div className="flex flex-col items-center text-center" style={{ maxWidth: 860 }}>
            {/* App icon */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              style={{ marginBottom: 24 }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <Image
                  src="/bitbit-app-icon.png"
                  alt="BitBit"
                  width={64}
                  height={64}
                  style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                  priority
                />
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              style={{
                fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                marginBottom: 16,
                whiteSpace: "nowrap",
                background: "linear-gradient(to bottom, #fafafa, #a3a3a3)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Meet BitBit.
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                marginBottom: 36,
                maxWidth: 820,
                color: "#d4d4d4",
              }}
            >
              Your tools, connected. Your tasks, handled. BitBit plugs in, learns your world, and gets to work
            </motion.p>

            {/* Waitlist form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="w-full"
              style={{ position: "relative" }}
            >
              <WaitlistForm onSuccess={fire} />
            </motion.div>

            {/* Subtle trust line */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              style={{
                fontSize: 13,
                color: "#64748b",
                marginTop: 20,
              }}
            >
              First seats open this week.
            </motion.p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "24px 0",
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            fontSize: 13,
            color: "#64748b",
          }}
        >
          <a
            href="/privacy"
            style={{ color: "#64748b", textDecoration: "none" }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#94a3b8")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            style={{ color: "#64748b", textDecoration: "none" }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#94a3b8")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            Terms of Service
          </a>
        </div>
        <p style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>
          &copy; {new Date().getFullYear()} BitBit. All rights reserved.
        </p>
      </footer>
    </>
  );
}
