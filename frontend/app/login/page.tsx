'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Input, PasswordInput } from '@/components/ui';
import { BrandMark } from '@/components/brand/BrandMark';

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--acc)]" />
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <BrandMark size={64} />
          </div>
          <p className="text-[var(--text-secondary)]">פלטפורמה לניהול סוכני בינה מלאכותית</p>
        </div>

        <div className="try-glass rounded-[26px] p-8">
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
              className="try-cta"
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

        <p className="text-center text-[var(--text-muted)] text-sm mt-6">
          גישה למערכת מותרת למורשים בלבד
        </p>
        <div className="flex justify-center gap-3 mt-4 text-xs text-[var(--text-muted)]">
          <a href="/privacy" className="hover:text-[var(--ink)] transition underline">Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="hover:text-[var(--ink)] transition underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
