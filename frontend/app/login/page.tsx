'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Input, PasswordInput } from '@/components/ui';

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
      
      // Try to determine which field the error relates to
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
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <img 
            src="https://res.cloudinary.com/daowx6msw/image/upload/v1763910407/white_logoggfdsdfgdfsgds_bdqrww.png" 
            alt="WhatsApp Agents"
            className="h-12 sm:h-16 mx-auto mb-4"
          />
          <p className="text-gray-400">פלטפורמה לניהול סוכני WhatsApp מבוססי AI</p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-800 rounded-xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* General Error Message */}
            {errors.general && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                {errors.general}
              </div>
            )}

            {/* Email Field */}
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

            {/* Password Field */}
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
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

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          גישה למערכת מותרת למורשים בלבד
        </p>
        <div className="flex justify-center gap-3 mt-4 text-xs text-gray-600">
          <a href="/privacy" className="hover:text-gray-400 transition underline">Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="hover:text-gray-400 transition underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
