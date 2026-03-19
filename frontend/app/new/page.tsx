'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createAgent } from '@/lib/api';
import { Button, Card, CardHeader } from '@/components/ui';
import { Input, Textarea, NumberInput } from '@/components/ui/Input';
import { ModelSelect } from '@/components/ui/ModelSelect';
import { ProviderSelector } from '@/components/agent/ProviderSelector';
import type { AgentBatchingConfig, Provider, WaSenderConfig } from '@/lib/types';

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [name, setName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [provider, setProvider] = useState<Provider>('meta');
  const [providerConfig, setProviderConfig] = useState<WaSenderConfig | Record<string, never>>({});
  
  const [batchingConfig, setBatchingConfig] = useState<AgentBatchingConfig>({ 
    debounce_seconds: 3, 
    max_batch_messages: 10, 
    max_history_messages: 20 
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validation based on provider
    if (!name || !systemPrompt) {
      setError('מלא את כל השדות הנדרשים');
      return;
    }
    
    if (provider === 'meta') {
      if (!phoneNumberId || !accessToken || !verifyToken) {
        setError('מלא את כל שדות ה-Meta');
        return;
      }
    } else {
      const wsConfig = providerConfig as WaSenderConfig;
      if (!wsConfig.api_key || !wsConfig.webhook_secret) {
        setError('מלא את API Key ו-Webhook Secret');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      // For WA Sender, generate a unique phone_number_id
      const finalPhoneNumberId = provider === 'wasender' 
        ? `ws_${Date.now()}` 
        : phoneNumberId;
      
      await createAgent({
        name,
        phone_number_id: finalPhoneNumberId,
        access_token: provider === 'wasender' ? '' : accessToken,
        verify_token: provider === 'wasender' ? '' : verifyToken,
        system_prompt: systemPrompt,
        model,
        provider,
        provider_config: providerConfig,
        batching_config: batchingConfig,
      });
      router.push('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה ביצירת הסוכן';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-purple-500/10 bg-[#06060E]/80 backdrop-blur-sm sticky top-16 z-40">
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <h1 className="font-semibold text-white text-sm md:text-base">יצירת סוכן חדש</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-3 md:px-6 py-4 md:py-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 flex items-center gap-2">
            <span>⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>🤖 פרטי סוכן</CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="שם הסוכן"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="לדוגמה: נועה - נציגת מכירות"
                />
                <ModelSelect
                  label="מודל AI"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {/* Provider Selection */}
          <ProviderSelector
            provider={provider}
            providerConfig={providerConfig}
            phoneNumberId={phoneNumberId}
            accessToken={accessToken}
            verifyToken={verifyToken}
            onProviderChange={setProvider}
            onProviderConfigChange={setProviderConfig}
            onPhoneNumberIdChange={setPhoneNumberId}
            onAccessTokenChange={setAccessToken}
            onVerifyTokenChange={setVerifyToken}
          />

          {/* System Prompt */}
          <Card>
            <CardHeader>🎯 System Prompt</CardHeader>
            <Textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="min-h-[200px]"
              dir="rtl"
              placeholder="לדוגמה: אתה נציג שירות לקוחות מקצועי ואדיב. תפקידך לעזור ללקוחות בכל שאלה..."
              hint="הגדר את האופי, התפקיד וההנחיות של הסוכן"
            />
          </Card>

          {/* Advanced Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="
              w-full py-3 px-4
              bg-slate-800/30 hover:bg-slate-800/50
              border border-slate-700/50 rounded-lg
              flex items-center justify-between
              text-slate-300 hover:text-white
              transition-colors
            "
          >
            <span className="flex items-center gap-2">
              <span>⚙️</span>
              <span>הגדרות מתקדמות</span>
            </span>
            <svg 
              className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <div className="space-y-6 animate-fade-in">
              {/* Message Batching */}
              <Card>
                <CardHeader>📦 איחוד הודעות</CardHeader>
                <p className="text-sm text-slate-400 mb-4">
                  הסוכן יחכה לקבל מספר הודעות ברצף לפני שיענה
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberInput
                    label="זמן המתנה (שניות)"
                    min={0}
                    max={30}
                    value={batchingConfig.debounce_seconds}
                    onChange={e => setBatchingConfig({ 
                      ...batchingConfig, 
                      debounce_seconds: parseInt(e.target.value) || 0 
                    })}
                    hint="0 = מגיב מיד"
                  />
                  <NumberInput
                    label="מקסימום הודעות"
                    min={1}
                    max={50}
                    value={batchingConfig.max_batch_messages}
                    onChange={e => setBatchingConfig({ 
                      ...batchingConfig, 
                      max_batch_messages: parseInt(e.target.value) || 1 
                    })}
                  />
                </div>
              </Card>

              {/* History */}
              <Card>
                <CardHeader>📜 היסטוריית שיחה</CardHeader>
                <p className="text-sm text-slate-400 mb-4">
                  כמה הודעות אחורה הסוכן יזכור (משפיע על צריכת tokens)
                </p>
                
                <div className="max-w-xs">
                  <NumberInput
                    label="מקסימום הודעות בהיסטוריה"
                    min={5}
                    max={100}
                    value={batchingConfig.max_history_messages}
                    onChange={e => setBatchingConfig({ 
                      ...batchingConfig, 
                      max_history_messages: parseInt(e.target.value) || 20 
                    })}
                    hint="מומלץ: 15-30"
                  />
                </div>
              </Card>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Link href="/">
              <Button variant="secondary" type="button">
                ביטול
              </Button>
            </Link>
            <Button 
              type="submit" 
              variant="success" 
              size="lg"
              loading={saving}
              disabled={saving}
            >
              צור סוכן
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

