'use client';

import { Button, Card, CardHeader } from '@/components/ui';
import { Input, NumberInput } from '@/components/ui/Input';
import { ModelSelect } from '@/components/ui/ModelSelect';
import { ProviderSelector } from '@/components/agent/ProviderSelector';
import type { AgentBatchingConfig, ContextSummaryConfig, Provider, WaSenderConfig, CustomApiKeys } from '@/lib/types';

interface SettingsTabProps {
  agentId: number;
  name: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  model: string;
  provider: Provider;
  providerConfig: WaSenderConfig | Record<string, never>;
  batchingConfig: AgentBatchingConfig;
  customApiKeys: CustomApiKeys;
  contextSummaryConfig: ContextSummaryConfig;
  onNameChange: (v: string) => void;
  onPhoneNumberIdChange: (v: string) => void;
  onAccessTokenChange: (v: string) => void;
  onVerifyTokenChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onProviderChange: (p: Provider) => void;
  onProviderConfigChange: (config: WaSenderConfig) => void;
  onBatchingConfigChange: (config: AgentBatchingConfig) => void;
  onCustomApiKeysChange: (keys: CustomApiKeys) => void;
  onContextSummaryConfigChange: (config: ContextSummaryConfig) => void;
  onSave: () => void;
  saving: boolean;
}

export function SettingsTab({
  agentId, name, phoneNumberId, accessToken, verifyToken, model, provider, providerConfig, batchingConfig,
  customApiKeys, contextSummaryConfig, onNameChange, onPhoneNumberIdChange, onAccessTokenChange, onVerifyTokenChange, 
  onModelChange, onProviderChange, onProviderConfigChange, onBatchingConfigChange,
  onCustomApiKeysChange, onContextSummaryConfigChange, onSave, saving
}: SettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Agent Details */}
      <Card>
        <CardHeader>🤖 פרטי סוכן</CardHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="שם הסוכן" 
              value={name} 
              onChange={e => onNameChange(e.target.value)} 
            />
            <ModelSelect 
              label="מודל AI" 
              value={model} 
              onChange={e => onModelChange(e.target.value)} 
            />
          </div>
        </div>
      </Card>

      {/* Provider Settings */}
      <ProviderSelector
        provider={provider}
        providerConfig={providerConfig}
        phoneNumberId={phoneNumberId}
        accessToken={accessToken}
        verifyToken={verifyToken}
        agentId={agentId}
        onProviderChange={onProviderChange}
        onProviderConfigChange={onProviderConfigChange}
        onPhoneNumberIdChange={onPhoneNumberIdChange}
        onAccessTokenChange={onAccessTokenChange}
        onVerifyTokenChange={onVerifyTokenChange}
      />

      {/* Message Batching */}
      <Card>
        <CardHeader>📦 איחוד הודעות</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          כשלקוח שולח כמה הודעות ברצף, הסוכן יחכה ויענה על כולן בתשובה אחת
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="זמן המתנה (שניות)"
            min={0}
            max={30}
            value={batchingConfig.debounce_seconds}
            onChange={e => onBatchingConfigChange({ 
              ...batchingConfig, 
              debounce_seconds: parseInt(e.target.value) || 0 
            })}
            hint="0 = מגיב מיד"
          />
          
          <NumberInput
            label="מקסימום הודעות לאיחוד"
            min={1}
            max={50}
            value={batchingConfig.max_batch_messages}
            onChange={e => onBatchingConfigChange({ 
              ...batchingConfig, 
              max_batch_messages: parseInt(e.target.value) || 1 
            })}
            hint="יענה מיד אם הגיע למספר הזה"
          />
        </div>
      </Card>

      {/* Conversation History */}
      <Card>
        <CardHeader>📜 היסטוריית שיחה</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          כמה הודעות אחורה הסוכן יזכור בכל שיחה (משפיע על צריכת tokens ועלויות)
        </p>
        
        <div className="max-w-xs">
          <NumberInput
            label="מקסימום הודעות בהיסטוריה"
            min={5}
            max={100}
            value={batchingConfig.max_history_messages}
            onChange={e => onBatchingConfigChange({ 
              ...batchingConfig, 
              max_history_messages: parseInt(e.target.value) || 20 
            })}
            hint="מומלץ: 15-30 הודעות"
          />
        </div>
      </Card>

      {/* Context Summary (Long Conversation Memory) */}
      <Card>
        <CardHeader>🧠 זיכרון שיחה ארוכה</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          כשהשיחה ארוכה, הסוכן יסכם את ההודעות הישנות כדי לזכור יותר בפחות מקום
        </p>

        <label className="flex items-center gap-3 mb-5 cursor-pointer">
          <div 
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${contextSummaryConfig.enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
            onClick={() => onContextSummaryConfigChange({ ...contextSummaryConfig, enabled: !contextSummaryConfig.enabled })}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${contextSummaryConfig.enabled ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-slate-300">
            {contextSummaryConfig.enabled ? 'פעיל' : 'כבוי'}
          </span>
        </label>

        {contextSummaryConfig.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumberInput
              label="סכם כל X הודעות"
              min={5}
              max={100}
              value={contextSummaryConfig.message_threshold}
              onChange={e => onContextSummaryConfigChange({
                ...contextSummaryConfig,
                message_threshold: parseInt(e.target.value) || 20,
              })}
              hint="מאז הסיכום האחרון"
            />
            <NumberInput
              label="הודעות אחרונות לשמור"
              min={5}
              max={100}
              value={contextSummaryConfig.messages_after_summary}
              onChange={e => onContextSummaryConfigChange({
                ...contextSummaryConfig,
                messages_after_summary: parseInt(e.target.value) || 20,
              })}
              hint="נשלחות ל-AI אחרי הסיכום"
            />
            <NumberInput
              label="סיכום מלא כל X גלים"
              min={1}
              max={20}
              value={contextSummaryConfig.full_summary_every}
              onChange={e => onContextSummaryConfigChange({
                ...contextSummaryConfig,
                full_summary_every: parseInt(e.target.value) || 5,
              })}
              hint="מונע הצטברות שגיאות"
            />
          </div>
        )}
      </Card>

      {/* Custom API Keys */}
      <Card>
        <CardHeader>🔑 מפתחות API מותאמים</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          השאר ריק כדי להשתמש במפתחות המערכת
        </p>
        <div className="grid gap-4">
          <Input
            label="Anthropic (Claude)"
            type="password"
            placeholder="השאר ריק למפתח מערכת"
            value={customApiKeys.anthropic || ''}
            onChange={e => onCustomApiKeysChange({ ...customApiKeys, anthropic: e.target.value })}
          />
          <Input
            label="OpenAI (GPT)"
            type="password"
            placeholder="השאר ריק למפתח מערכת"
            value={customApiKeys.openai || ''}
            onChange={e => onCustomApiKeysChange({ ...customApiKeys, openai: e.target.value })}
          />
          <Input
            label="Google (Gemini)"
            type="password"
            placeholder="השאר ריק למפתח מערכת"
            value={customApiKeys.google || ''}
            onChange={e => onCustomApiKeysChange({ ...customApiKeys, google: e.target.value })}
          />
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button 
          onClick={onSave} 
          disabled={saving} 
          loading={saving}
          variant="success"
          size="lg"
        >
          שמור הגדרות
        </Button>
      </div>
    </div>
  );
}
