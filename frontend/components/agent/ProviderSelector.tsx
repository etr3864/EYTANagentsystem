'use client';

import { Card, CardHeader } from '@/components/ui';
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
              ? 'border-blue-500 bg-blue-500/10 text-white' 
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }
          `}
        >
          <MetaIcon />
          <span className="font-medium">Meta (רשמי)</span>
        </button>
        <button
          type="button"
          onClick={() => onProviderChange('wasender')}
          className={`
            flex-1 py-3 px-4 rounded-lg border-2 transition-all
            flex items-center justify-center gap-2
            ${provider === 'wasender' 
              ? 'border-emerald-500 bg-emerald-500/10 text-white' 
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
            }
          `}
        >
          <WaSenderIcon />
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
            <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="text-sm text-slate-400 mb-2">כתובת Webhook להגדרה ב-WA Sender:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-slate-900 px-3 py-2 rounded text-emerald-400 break-all">
                  {API_URL}/webhook/wasender/{agentId}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${API_URL}/webhook/wasender/${agentId}`);
                  }}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
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

function MetaIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  );
}

function WaSenderIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// Export icons for use in other components
export { MetaIcon, WaSenderIcon };
