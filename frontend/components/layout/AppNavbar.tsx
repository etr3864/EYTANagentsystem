'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/auth';
import { AgentsIcon, ChartIcon, UsersIcon, DatabaseIcon, PlusIcon, LogoutIcon, SettingsIcon } from '@/components/ui';
import { BrandMark } from '@/components/brand/BrandMark';
import { applyTheme } from '@/components/theme/ThemeProvider';

const HIDDEN_PATHS = ['/home', '/login', '/privacy', '/terms', '/try'];

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'סוכנים', icon: <AgentsIcon />, roles: ['super_admin', 'admin', 'employee'] },
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

function navClass(on: boolean) {
  return on
    ? 'bg-[var(--glass-2)] text-[var(--ink)] border border-[var(--edge)]'
    : 'text-[var(--text-secondary)] hover:text-[var(--ink)] hover:bg-[var(--bg-hover)]';
}

export function AppNavbar() {
  const pathname = usePathname();
  const { user, logout, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }

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
      <nav className="sticky top-0 z-50 border-b border-[var(--edge)] bg-[var(--bg)]/55 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 md:gap-6 min-w-0">
              <Link href="/" className="shrink-0" aria-label="Optive">
                <BrandMark size={36} />
              </Link>
              <div className="hidden md:flex items-center gap-1">
                {visibleLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${navClass(isActive(link.href))}`}
                  >
                    <span className="opacity-70">{link.icon}</span>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-[var(--text-secondary)] truncate max-w-[8rem]">{user.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--edge)] text-[var(--text-secondary)]">
                  {getRoleBadge(user.role)}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                className="try-icon w-9 h-9"
                aria-label="ערכת נושא"
              >
                <svg className="theme-mark-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />
                </svg>
                <svg className="theme-mark-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
                </svg>
              </button>

              {isSuperAdmin(user) && (
              <Link
                href="/settings"
                className={`p-2 rounded-full transition-colors ${navClass(isActive('/settings'))}`}
                aria-label="הגדרות"
                title="הגדרות"
              >
                <SettingsIcon className="w-5 h-5" />
              </Link>
              )}

              <button
                type="button"
                onClick={logout}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--ink)] hover:bg-[var(--bg-hover)] transition-colors text-sm"
              >
                <LogoutIcon />
              </button>

              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--ink)]"
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

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-16 right-0 left-0 try-glass border-b border-[var(--edge)] animate-fade-in rounded-none">
            <div className="px-4 py-3 space-y-1">
              {visibleLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${navClass(isActive(link.href))}`}
                >
                  <span className="opacity-70">{link.icon}</span>
                  {link.label}
                </Link>
              ))}

              <div className="border-t border-[var(--edge)] pt-3 mt-2">
                {isSuperAdmin(user) && (
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${navClass(isActive('/settings'))}`}
                >
                  <span className="opacity-70"><SettingsIcon /></span>
                  הגדרות
                </Link>
                )}
                <div className="flex items-center justify-between px-4 py-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[var(--text-secondary)] truncate">{user.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--edge)] text-[var(--text-secondary)]">
                      {getRoleBadge(user.role)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); logout(); }}
                    className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] shrink-0"
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
