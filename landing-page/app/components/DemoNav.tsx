'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DemoNav() {
  const pathname = usePathname();
  
  // Don't show nav on landing page
  if (pathname === '/demo' || pathname === '/') {
    return null;
  }

  const navItems = [
    { href: '/demo', label: 'Home', icon: '🏠' },
    { href: '/chat', label: 'Chat Demo', icon: '💬' },
    { href: '/audit', label: 'Audit Trail', icon: '📊' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/demo" className="flex items-center gap-2 text-white font-bold text-lg">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm">
              B
            </span>
            BitBit
          </Link>

          {/* Nav items */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-green-400 hidden sm:inline">Demo Mode</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
