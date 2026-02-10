'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Input, PasswordInput } from '@/components/ui';

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

type ModalType = 'privacy' | 'terms' | null;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  if (isAuthenticated) {
    router.push('/');
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
            className="h-16 mx-auto mb-4"
          />
          <p className="text-gray-400">התחברות למערכת</p>
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
        <div className="text-center text-xs text-gray-600 mt-4 space-x-3 rtl:space-x-reverse">
          <button 
            onClick={() => setOpenModal('privacy')}
            className="hover:text-gray-400 transition underline"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button 
            onClick={() => setOpenModal('terms')}
            className="hover:text-gray-400 transition underline"
          >
            Terms of Service
          </button>
        </div>
      </div>

      {/* Legal Modal */}
      {openModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">
                {openModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
              </h2>
              <button 
                onClick={() => setOpenModal(null)}
                className="text-gray-400 hover:text-white transition p-1"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto text-gray-300 text-sm leading-relaxed">
              {openModal === 'privacy' ? <PrivacyContent /> : <TermsContent />}
            </div>
            <div className="p-4 border-t border-gray-700">
              <button 
                onClick={() => setOpenModal(null)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-4 text-left" dir="ltr">
      <p><strong>Last Updated:</strong> February 2026</p>
      
      <h3 className="text-white font-semibold">1. Introduction</h3>
      <p>
        WhatsApp Agents ("we," "our," or "us") is committed to protecting your privacy. 
        This Privacy Policy explains how we collect, use, disclose, and safeguard your 
        information when you use our AI-powered WhatsApp automation platform.
      </p>

      <h3 className="text-white font-semibold">2. Information We Collect</h3>
      <p><strong>Account Information:</strong> Email address and name for authentication purposes.</p>
      <p><strong>Google Calendar Data:</strong> When you connect your Google Calendar, we access:</p>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>Calendar events (title, date, time, description)</li>
        <li>Free/busy information</li>
        <li>Calendar metadata</li>
      </ul>
      <p><strong>WhatsApp Messages:</strong> Message content processed by our AI agents for automated responses.</p>
      <p><strong>Usage Data:</strong> Logs and analytics to improve our services.</p>

      <h3 className="text-white font-semibold">3. How We Use Your Information</h3>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>To provide and maintain our AI automation services</li>
        <li>To schedule and manage appointments via Google Calendar integration</li>
        <li>To process and respond to WhatsApp messages through AI agents</li>
        <li>To authenticate and secure your account</li>
        <li>To improve and optimize our platform</li>
      </ul>

      <h3 className="text-white font-semibold">4. Data Storage and Security</h3>
      <p>
        Your data is stored on secure servers with encryption at rest and in transit. 
        We implement industry-standard security measures including:
      </p>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>SSL/TLS encryption for all data transfers</li>
        <li>Secure token storage for API credentials</li>
        <li>Regular security audits and monitoring</li>
        <li>Access controls and authentication requirements</li>
      </ul>

      <h3 className="text-white font-semibold">5. Third-Party Services</h3>
      <p>We integrate with the following third-party services:</p>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li><strong>Google Calendar API:</strong> For calendar management and scheduling</li>
        <li><strong>WhatsApp Business API:</strong> For message processing</li>
        <li><strong>Anthropic Claude AI:</strong> For natural language processing</li>
      </ul>
      <p>We do not sell, trade, or rent your personal information to third parties.</p>

      <h3 className="text-white font-semibold">6. Data Retention</h3>
      <p>
        We retain your data for as long as your account is active or as needed to provide services. 
        Google Calendar tokens are stored securely and can be revoked at any time through your 
        Google Account settings.
      </p>

      <h3 className="text-white font-semibold">7. Your Rights</h3>
      <p>You have the right to:</p>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>Access your personal data</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Revoke Google Calendar access at any time</li>
        <li>Export your data</li>
      </ul>

      <h3 className="text-white font-semibold">8. Google API Services User Data Policy</h3>
      <p>
        Our use and transfer of information received from Google APIs adheres to the 
        <a href="https://developers.google.com/terms/api-services-user-data-policy" 
           className="text-blue-400 hover:underline ml-1" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>, including the Limited Use requirements.
      </p>

      <h3 className="text-white font-semibold">9. Contact Us</h3>
      <p>
        For questions about this Privacy Policy or to exercise your rights, 
        please contact us at: <span className="text-blue-400">privacy@whatsappagents.com</span>
      </p>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-4 text-left" dir="ltr">
      <p><strong>Last Updated:</strong> February 2026</p>
      
      <h3 className="text-white font-semibold">1. Acceptance of Terms</h3>
      <p>
        By accessing or using WhatsApp Agents ("the Service"), you agree to be bound by these 
        Terms of Service. If you do not agree to these terms, do not use the Service.
      </p>

      <h3 className="text-white font-semibold">2. Description of Service</h3>
      <p>
        WhatsApp Agents is an AI-powered platform that enables automated WhatsApp messaging 
        and integrates with Google Calendar for scheduling and appointment management. 
        The Service uses artificial intelligence to process and respond to messages.
      </p>

      <h3 className="text-white font-semibold">3. User Accounts</h3>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>You must provide accurate and complete information when creating an account</li>
        <li>You are responsible for maintaining the security of your account credentials</li>
        <li>You must notify us immediately of any unauthorized access</li>
        <li>One account per user; account sharing is prohibited</li>
      </ul>

      <h3 className="text-white font-semibold">4. Acceptable Use</h3>
      <p>You agree NOT to use the Service to:</p>
      <ul className="list-disc list-inside ml-4 space-y-1">
        <li>Send spam, unsolicited messages, or harassment</li>
        <li>Violate any applicable laws or regulations</li>
        <li>Infringe on intellectual property rights</li>
        <li>Distribute malware or harmful content</li>
        <li>Impersonate others or misrepresent your identity</li>
        <li>Violate WhatsApp's Terms of Service</li>
      </ul>

      <h3 className="text-white font-semibold">5. Google Calendar Integration</h3>
      <p>
        When you connect your Google Calendar, you authorize us to access and manage 
        calendar events on your behalf. You can revoke this access at any time through 
        your Google Account settings. We comply with Google's API Services User Data Policy.
      </p>

      <h3 className="text-white font-semibold">6. AI-Generated Content</h3>
      <p>
        Our Service uses AI to generate automated responses. While we strive for accuracy, 
        AI-generated content may contain errors. You are responsible for reviewing and 
        verifying automated messages before they impact critical decisions.
      </p>

      <h3 className="text-white font-semibold">7. Intellectual Property</h3>
      <p>
        The Service, including its design, features, and content, is owned by WhatsApp Agents 
        and protected by intellectual property laws. You retain ownership of your data and content.
      </p>

      <h3 className="text-white font-semibold">8. Limitation of Liability</h3>
      <p>
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE ARE NOT LIABLE 
        FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR 
        USE OF THE SERVICE.
      </p>

      <h3 className="text-white font-semibold">9. Termination</h3>
      <p>
        We reserve the right to suspend or terminate your account for violations of these 
        Terms. Upon termination, your right to use the Service ceases immediately. 
        You may also delete your account at any time.
      </p>

      <h3 className="text-white font-semibold">10. Changes to Terms</h3>
      <p>
        We may update these Terms from time to time. Continued use of the Service after 
        changes constitutes acceptance of the new Terms.
      </p>

      <h3 className="text-white font-semibold">11. Governing Law</h3>
      <p>
        These Terms are governed by applicable laws. Any disputes shall be resolved 
        through appropriate legal channels.
      </p>

      <h3 className="text-white font-semibold">12. Contact</h3>
      <p>
        For questions about these Terms, please contact us at: 
        <span className="text-blue-400 ml-1">legal@whatsappagents.com</span>
      </p>
    </div>
  );
}
