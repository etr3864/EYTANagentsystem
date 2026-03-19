'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Input, PasswordInput } from '@/components/ui';

const LOGO_ICON = 'https://res.cloudinary.com/daowx6msw/image/upload/v1761607495/white_logogg_uf3usn.png';

function getSafeRedirect(url: string | null): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return '/';
  return url;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0B0914]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get('redirect'));

  if (isAuthenticated) {
    router.push(redirectTo);
    return null;
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!email) {
      newErrors.email = 'נא להזין אימייל';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'אימייל לא תקין';
    }
    
    if (!password) {
      newErrors.password = 'נא להזין סיסמה';
    } else if (password.length < 6) {
      newErrors.password = 'סיסמה חייבת להכיל לפחות 6 תווים';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setErrors({});
    setIsLoading(true);

    try {
      await login({ email, password });
      router.push(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה בהתחברות';
      
      if (message.toLowerCase().includes('email') || message.includes('אימייל')) {
        setErrors({ email: message });
      } else if (message.toLowerCase().includes('password') || message.includes('סיסמה')) {
        setErrors({ password: message });
      } else {
        setErrors({ general: message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0914] px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src={LOGO_ICON}
            alt="Optive"
            className="h-16 w-16 mx-auto mb-4"
          />
          <p className="text-slate-400">פלטפורמה לניהול סוכני AI</p>
        </div>

        {/* Login Card — glassmorphism */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-purple-500/15 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.general && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                {errors.general}
              </div>
            )}

            <Input
              label="אימייל"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              autoComplete="email"
              placeholder="your@email.com"
              disabled={isLoading}
              error={errors.email}
            />

            <PasswordInput
              label="סיסמה"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: undefined });
              }}
              autoComplete="current-password"
              placeholder="הזן סיסמה"
              disabled={isLoading}
              error={errors.password}
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 text-white font-medium rounded-lg transition-all shadow-lg shadow-purple-600/20 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-[#0B0914]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  מתחבר...
                </span>
              ) : (
                'התחבר'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          גישה למערכת מותרת למורשים בלבד
        </p>
        <div className="flex justify-center gap-3 mt-4 text-xs text-slate-600">
          <a href="/privacy" className="hover:text-slate-400 transition underline">Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="hover:text-slate-400 transition underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
