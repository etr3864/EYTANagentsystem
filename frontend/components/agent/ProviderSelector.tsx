'use client';

import { Card, CardHeader, ChannelIcon } from '@/components/ui';
import { Input, Textarea } from '@/components/ui/Input';
import type { Provider, WaSenderConfig } from '@/lib/types';

interface ProviderSelectorProps {
  provider: Provider;
  providerConfig: WaSenderConfig | Record<string, never>;
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  agentId?: number;  // For showing webhook URL
  onProviderChange: (p: Provider) => void;
  onProviderConfigChange: (config: WaSenderConfig) => void;
  onPhoneNumberIdChange: (v: string) => void;
  onAccessTokenChange: (v: string) => void;
  onVerifyTokenChange: (v: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function ProviderSelector({
  provider,
  providerConfig,
  phoneNumberId,
  accessToken,
  verifyToken,
  agentId,
  onProviderChange,
  onProviderConfigChange,
  onPhoneNumberIdChange,
  onAccessTokenChange,
  onVerifyTokenChange,
}: ProviderSelectorProps) {
  const wasenderConfig = providerConfig as WaSenderConfig;

  return (
    <Card>
      <CardHeader>📱 ספק WhatsApp</CardHeader>
      
      {/* Provider Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => onProviderChange('meta')}
          className={`
            flex-1 py-3 px-4 rounded-lg border-2 transition-all
            flex items-center justify-center gap-2
            ${provider === 'meta' 
              ? 'border-[var(--acc)] bg-[var(--acc)]/10 text-[var(--ink)]' 
              : 'border-[var(--edge)] bg-[var(--glass-2)] text-[var(--text-secondary)] hover:border-[var(--acc)]'
            }
          `}
        >
          <ChannelIcon channelType="whatsapp_meta" size={20} />
          <span className="font-medium">Meta (רשמי)</span>
        </button>
        <button
          type="button"
          onClick={() => onProviderChange('wasender')}
          className={`
            flex-1 py-3 px-4 rounded-lg border-2 transition-all
            flex items-center justify-center gap-2
            ${provider === 'wasender' 
              ? 'border-emerald-500 bg-emerald-500/10 text-[var(--ink)]' 
              : 'border-[var(--edge)] bg-[var(--glass-2)] text-[var(--text-secondary)] hover:border-[var(--acc)]'
            }
          `}
        >
          <ChannelIcon channelType="whatsapp_wasender" size={20} />
          <span className="font-medium">WA Sender</span>
        </button>
      </div>

      {/* Provider-specific fields */}
      {provider === 'meta' ? (
        <div className="space-y-4">
          <Input
            label="Phone Number ID"
            value={phoneNumberId}
            onChange={e => onPhoneNumberIdChange(e.target.value)}
            placeholder="123456789012345"
            hint="מזהה מספר הטלפון מ-Meta Business"
          />
          
          <Textarea
            label="Access Token"
            value={accessToken}
            onChange={e => onAccessTokenChange(e.target.value)}
            className="min-h-[80px] font-mono text-xs"
            placeholder="EAAxxxxxxx..."
            hint="טוקן גישה מ-Meta Business (שמור סודי)"
          />
          
          <Input
            label="Verify Token"
            value={verifyToken}
            onChange={e => onVerifyTokenChange(e.target.value)}
            placeholder="my-secret-token"
            hint="טוקן אימות ל-Webhook (בחר משהו ייחודי)"
          />
          
          <Input
            label="WABA ID"
            value={(providerConfig as Record<string, string>)?.waba_id || ''}
            onChange={e => onProviderConfigChange({
              ...providerConfig,
              waba_id: e.target.value,
            } as any)}
            placeholder="933897452328631"
            hint="WhatsApp Business Account ID — נמצא ב-Meta Business Suite → Settings"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="API Key"
            value={wasenderConfig?.api_key || ''}
            onChange={e => onProviderConfigChange({
              ...wasenderConfig,
              api_key: e.target.value,
              webhook_secret: wasenderConfig?.webhook_secret || '',
              session: wasenderConfig?.session || 'default',
            })}
            placeholder="your-wasender-api-key"
            hint="מפתח API מ-WA Sender"
          />
          
          <Input
            label="Webhook Secret"
            value={wasenderConfig?.webhook_secret || ''}
            onChange={e => onProviderConfigChange({
              ...wasenderConfig,
              api_key: wasenderConfig?.api_key || '',
              webhook_secret: e.target.value,
              session: wasenderConfig?.session || 'default',
            })}
            placeholder="your-webhook-secret"
            hint="סוד לאימות webhook נכנס"
          />
          
          <Input
            label="Session"
            value={wasenderConfig?.session || 'default'}
            onChange={e => onProviderConfigChange({
              ...wasenderConfig,
              api_key: wasenderConfig?.api_key || '',
              webhook_secret: wasenderConfig?.webhook_secret || '',
              session: e.target.value,
            })}
            placeholder="default"
            hint="שם ה-session ב-WA Sender (בד״כ default)"
          />

          {/* Webhook URL - only show for existing agents */}
          {agentId && (
            <div className="mt-4 p-4 bg-[var(--glass-2)] rounded-lg border border-[var(--edge)]">
              <div className="text-sm text-[var(--text-secondary)] mb-2">כתובת Webhook להגדרה ב-WA Sender:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-[var(--bg-secondary)] px-3 py-2 rounded text-emerald-400 break-all">
                  {API_URL}/webhook/wasender/{agentId}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${API_URL}/webhook/wasender/${agentId}`);
                  }}
                  className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded text-sm transition-colors"
                  title="העתק"
                >
                  📋
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

