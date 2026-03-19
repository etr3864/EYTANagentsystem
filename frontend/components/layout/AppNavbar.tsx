'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/auth';
import { ChartIcon, UsersIcon, DatabaseIcon, PlusIcon, LogoutIcon } from '@/components/ui';

const LOGO_ICON = 'https://res.cloudinary.com/daowx6msw/image/upload/v1761607495/white_logogg_uf3usn.png';

const HIDDEN_PATHS = ['/home', '/login', '/privacy', '/terms'];

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'סוכנים', icon: <span className="text-base">🤖</span>, roles: ['super_admin', 'admin', 'employee'] },
  { href: '/dashboard', label: 'דאשבורד', icon: <ChartIcon />, roles: ['super_admin', 'admin'] },
  { href: '/users', label: 'משתמשים', icon: <UsersIcon />, roles: ['super_admin', 'admin'] },
  { href: '/database', label: 'Database', icon: <DatabaseIcon />, roles: ['super_admin'] },
  { href: '/new', label: 'סוכן חדש', icon: <PlusIcon />, roles: ['super_admin'] },
];

function getRoleBadge(role?: string) {
  if (role === 'super_admin') return 'מנהל ראשי';
  if (role === 'admin') return 'לקוח';
  return 'עובד';
}

export function AppNavbar() {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isHidden = HIDDEN_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isHidden || isLoading || !user) return null;

  const userRole = user.role ?? 'employee';
  const visibleLinks = NAV_LINKS.filter(l => l.roles.includes(userRole));

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-purple-500/10 bg-[#06060E]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 md:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Right: Logo + Nav Links */}
            <div className="flex items-center gap-6">
              <Link href="/" className="shrink-0">
                <img src={LOGO_ICON} alt="Optive" className="h-10 w-10 md:h-11 md:w-11 object-contain" />
              </Link>

              {/* Desktop Links */}
              <div className="hidden md:flex items-center gap-1">
                {visibleLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${isActive(link.href)
                        ? 'bg-purple-600/15 text-purple-300'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    <span className="opacity-70">{link.icon}</span>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Left: User + Logout + Mobile Hamburger */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-slate-400">{user.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-300">
                  {getRoleBadge(user.role)}
                </span>
              </div>

              <button
                onClick={logout}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
              >
                <LogoutIcon />
              </button>

              {/* Mobile Hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="תפריט"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-16 right-0 left-0 bg-[#0F0B1F] border-b border-purple-500/10 shadow-2xl animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              {visibleLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isActive(link.href)
                      ? 'bg-purple-600/15 text-purple-300'
                      : 'text-slate-300 hover:bg-white/5'
                    }
                  `}
                >
                  <span className="opacity-70">{link.icon}</span>
                  {link.label}
                </Link>
              ))}

              <div className="border-t border-purple-500/10 pt-3 mt-2">
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300">{user.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-300">
                      {getRoleBadge(user.role)}
                    </span>
                  </div>
                  <button
                    onClick={() => { setMobileOpen(false); logout(); }}
                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <LogoutIcon />
                    יציאה
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
