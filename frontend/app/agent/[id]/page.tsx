'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button, Card, ArrowRightIcon, BELOW_NAV_CLASS } from '@/components/ui';
import { FunctionsTab } from '@/components/agent/functions/FunctionsTab';
import { AgentTabs, PromptTab, SettingsTab, ConversationsTab, KnowledgeTab, CalendarTab, SummaryTab, MediaTab, TriggersTab, EscalationTab } from '@/components/agent';
import type { AgentTabGroup } from '@/components/agent/AgentTabs';
import { TemplatesTab } from '@/components/agent/TemplatesTab';
import FollowUpTab from '@/components/agent/FollowUpTab';
import { ChannelsTab } from '@/components/agent/channels/ChannelsTab';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin, isAdmin, isEmployee } from '@/lib/auth';
import { phoneToUrl, phoneFromUrl } from '@/lib/phone';
import { 
  getAgent, updateAgent, getConversations, getMessages, deleteConversation, 
  sendMessage, sendConversationMedia, sendConversationTemplate,
  getWhatsAppInbox, whatsappKindFromAgent, pauseConversation, resumeConversation,
  getAgentMedia, uploadAgentMedia, updateAgentMedia, deleteAgentMedia,
  type MediaUploadData, type ConversationCursor, type WhatsAppInbox,
} from '@/lib/api';
import type { Agent, AgentBatchingConfig, ContextSummaryConfig, Conversation, Message, Provider, WaSenderConfig, AgentMedia, MediaConfig, CustomApiKeys } from '@/lib/types';
import { DEFAULT_MODEL, getModel, resolveModel } from '@/lib/models';
import { NewChatModal } from '@/components/chat/NewChatModal';
import type { TemplateSendPayload } from '@/components/chat/Composer';

type Tab = 'prompt' | 'conversations' | 'knowledge' | 'media' | 'templates' | 'calendar' | 'followups' | 'summaries' | 'settings' | 'channels' | 'functions' | 'triggers' | 'escalation';

interface TabConfig {
  id: Tab;
  label: string;
  group: AgentTabGroup;
  roles: ('super_admin' | 'admin' | 'employee')[];
}

const allTabs: TabConfig[] = [
  { id: 'conversations', label: 'שיחות', group: 'ops', roles: ['super_admin', 'admin', 'employee'] },
  { id: 'prompt', label: 'Prompt', group: 'content', roles: ['super_admin'] },
  { id: 'knowledge', label: 'מאגר', group: 'content', roles: ['super_admin', 'admin'] },
  { id: 'media', label: 'מדיה', group: 'content', roles: ['super_admin', 'admin'] },
  { id: 'templates', label: 'תבניות', group: 'content', roles: ['super_admin'] },
  { id: 'functions', label: 'פונקציות', group: 'auto', roles: ['super_admin'] },
  { id: 'triggers', label: 'טריגרים', group: 'auto', roles: ['super_admin'] },
  { id: 'escalation', label: 'אסקלציה', group: 'auto', roles: ['super_admin'] },
  { id: 'followups', label: 'פולו-אפ', group: 'auto', roles: ['super_admin'] },
  { id: 'summaries', label: 'סיכומים', group: 'auto', roles: ['super_admin'] },
  { id: 'calendar', label: 'יומן', group: 'system', roles: ['super_admin', 'admin'] },
  { id: 'channels', label: 'ערוצים', group: 'system', roles: ['super_admin'] },
  { id: 'settings', label: 'הגדרות', group: 'system', roles: ['super_admin'] },
];

function AgentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Default tab based on role
  const defaultTab = useMemo(() => {
    if (searchParams.get('conv')) return 'conversations';
    if (isSuperAdmin(user)) return 'prompt';
    return 'conversations';
  }, [user, searchParams]);
  
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [appointmentPrompt, setAppointmentPrompt] = useState('');
  const [name, setName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [thinkingLevel, setThinkingLevel] = useState('off');
  const [isActive, setIsActive] = useState(true);
  const [provider, setProvider] = useState<Provider>('wasender');
  const [providerConfig, setProviderConfig] = useState<WaSenderConfig | Record<string, never>>({});
  
  // Filter tabs based on user role + saved agent data (not form state, to avoid re-renders)
  const visibleTabs = useMemo(() => {
    if (!user) return [];
    return allTabs.filter(t => {
      if (!t.roles.includes(user.role)) return false;
      if (t.id === 'templates') {
        if (agent?.has_whatsapp_meta_channel) return true;
        const savedProvider = agent?.provider || 'wasender';
        const savedWabaId = (agent?.provider_config as Record<string, string>)?.waba_id;
        return savedProvider === 'meta' && !!savedWabaId;
      }
      return true;
    });
  }, [user, agent]);
  const [batchingConfig, setBatchingConfig] = useState<AgentBatchingConfig>({
    debounce_seconds: 3,
    max_batch_messages: 10,
    max_history_messages: 20,
  });
  const [maxToolRounds, setMaxToolRounds] = useState(5);
  const [customApiKeys, setCustomApiKeys] = useState<CustomApiKeys>({});
  const [contextSummaryConfig, setContextSummaryConfig] = useState<ContextSummaryConfig>({
    enabled: false, message_threshold: 20, messages_after_summary: 20, full_summary_every: 5,
  });

  // Conversations state (cursor-paginated)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<ConversationCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [waInbox, setWaInbox] = useState<WhatsAppInbox>({ channel_type: null, templates: [] });

  // Media state
  const [media, setMedia] = useState<AgentMedia[]>([]);
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | null>(null);

  const agentId = Number(params.id);

  // Load agent data on mount or when agentId changes
  useEffect(() => {
    loadAgent();
    loadConversations();
    loadWaInbox();
  }, [agentId]);

  // Handle tab from URL or fallback when visible tabs change
  useEffect(() => {
    const urlTab = searchParams.get('tab') as Tab | null;
    if (urlTab && visibleTabs.some(t => t.id === urlTab)) {
      setTab(urlTab);
    } else if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs]);

  // Poll messages every 3 seconds when a conversation is selected
  useEffect(() => {
    if (!selectedConv || tab !== 'conversations') return;
    
    const interval = setInterval(() => {
      loadMessages(selectedConv);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [selectedConv, tab]);

  async function loadAgent() {
    try {
      const data = await getAgent(agentId);
      setAgent(data);
      setSystemPrompt(data.system_prompt || '');
      setAppointmentPrompt(data.appointment_prompt || '');
      setName(data.name);
      setPhoneNumberId(data.phone_number_id || '');
      setAccessToken(data.access_token);
      setVerifyToken(data.verify_token);
      setModel(resolveModel(data.model));
      setThinkingLevel(data.thinking_level || getModel(data.model).defaultThinking);
      setIsActive(data.is_active);
      setProvider(data.provider || 'wasender');
      setProviderConfig(data.provider_config || {});
      setBatchingConfig(data.batching_config || { 
        debounce_seconds: 3, 
        max_batch_messages: 10, 
        max_history_messages: 20 
      });
      setMediaConfig(data.media_config || null);
      setCustomApiKeys(data.custom_api_keys || {});
      setContextSummaryConfig(data.context_summary_config || {
        enabled: false, message_threshold: 20, messages_after_summary: 20, full_summary_every: 5,
      });
      setMaxToolRounds(data.max_tool_rounds || 5);
      setWaInbox(prev => ({
        channel_type: whatsappKindFromAgent(data) ?? prev.channel_type,
        templates: prev.templates,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Update URL with conversation phone number
  const updateUrlWithConversation = useCallback((conv: Conversation | null) => {
    if (conv) {
      router.replace(`/agent/${agentId}?conv=${phoneToUrl(conv.user_phone)}`, { scroll: false });
    } else {
      router.replace(`/agent/${agentId}`, { scroll: false });
    }
  }, [agentId, router]);

  async function loadConversations(opts?: { selectFromUrl?: boolean }): Promise<Conversation[]> {
    try {
      const page = await getConversations(agentId);
      setConversations(page.items);
      setNextCursor(page.next_cursor);

      if (opts?.selectFromUrl !== false) {
        const urlPhone = searchParams.get('conv');
        if (urlPhone && page.items.length > 0) {
          const conv = page.items.find(c => c.user_phone === phoneFromUrl(urlPhone));
          if (conv) {
            loadMessagesWithPhone(conv.id, conv.user_phone);
            setTab('conversations');
          }
        }
      }
      return page.items;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function loadWaInbox() {
    try {
      const inbox = await getWhatsAppInbox(agentId);
      setWaInbox(prev => ({
        channel_type: inbox.channel_type ?? prev.channel_type,
        templates: inbox.templates,
      }));
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMoreConversations() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getConversations(agentId, nextCursor);
      setConversations(prev => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMessagesWithPhone(convId: number, userPhone: string) {
    try {
      const data = await getMessages(convId);
      setMessages(data);
      setSelectedConv(convId);
      
      // Update URL with the phone number
      router.replace(`/agent/${agentId}?conv=${phoneToUrl(userPhone)}`, { scroll: false });
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMessages(convId: number) {
    try {
      const data = await getMessages(convId);
      setMessages(data);
      setSelectedConv(convId);
      
      // Update URL with the selected conversation's phone
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        updateUrlWithConversation(conv);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSavePrompt() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateAgent(agentId, { system_prompt: systemPrompt });
      setFeedback({ type: 'success', text: `נשמר בהצלחה (${systemPrompt.length} תווים)` });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: 'error', text: 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateAgent(agentId, {
        name,
        model,
        thinking_level: thinkingLevel,
        is_active: isActive,
        batching_config: batchingConfig,
        custom_api_keys: customApiKeys,
        context_summary_config: contextSummaryConfig,
        max_tool_rounds: maxToolRounds,
      });
      const fresh = await getAgent(agentId);
      setAgent(fresh);
      setModel(resolveModel(fresh.model));
      setThinkingLevel(fresh.thinking_level || getModel(fresh.model).defaultThinking);
      setFeedback({ type: 'success', text: 'נשמר בהצלחה!' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCalendar() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateAgent(agentId, { appointment_prompt: appointmentPrompt });
      setFeedback({ type: 'success', text: 'הגדרות יומן נשמרו!' });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: 'error', text: 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConv(convId: number) {
    if (!confirm('למחוק את השיחה?')) return;
    try {
      await deleteConversation(convId);
      setConversations(conversations.filter(c => c.id !== convId));
      if (selectedConv === convId) {
        setSelectedConv(null);
        setMessages([]);
        updateUrlWithConversation(null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSendMessage(text: string) {
    if (!selectedConv) return;
    await sendMessage(selectedConv, text);
    await loadMessages(selectedConv);
    await loadConversations({ selectFromUrl: false });
  }

  async function handleSendMedia(file: File, caption: string, asVoice?: boolean) {
    if (!selectedConv) return;
    await sendConversationMedia(selectedConv, file, caption, asVoice);
    await loadMessages(selectedConv);
    await loadConversations({ selectFromUrl: false });
  }

  async function handleSendVoice(blob: Blob) {
    if (!selectedConv) return;
    const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' });
    await sendConversationMedia(selectedConv, file, undefined, true);
    await loadMessages(selectedConv);
    await loadConversations({ selectFromUrl: false });
  }

  async function handleSendTemplate(payload: TemplateSendPayload) {
    if (!selectedConv) return;
    await sendConversationTemplate(selectedConv, payload.templateId, payload.bodyParams, payload.headerFile);
    await loadMessages(selectedConv);
    await loadConversations({ selectFromUrl: false });
  }

  async function handleChatOpened(conversationId: number) {
    setShowNewChat(false);
    const items = await loadConversations({ selectFromUrl: false });
    const data = await getMessages(conversationId);
    setMessages(data);
    setSelectedConv(conversationId);
    const conv = items.find(c => c.id === conversationId);
    if (conv) updateUrlWithConversation(conv);
  }

  async function handleTogglePause() {
    if (!selectedConv) return;
    
    const conv = conversations.find(c => c.id === selectedConv);
    if (!conv) return;
    
    if (conv.is_paused) {
      await resumeConversation(selectedConv);
    } else {
      await pauseConversation(selectedConv);
    }
    
    await loadConversations();
  }

  async function loadMedia() {
    try {
      const data = await getAgentMedia(agentId);
      setMedia(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUploadMedia(
    file: File, 
    data: MediaUploadData, 
    onProgress: (p: number) => void
  ) {
    await uploadAgentMedia(agentId, file, data, onProgress);
    await loadMedia();
  }

  async function handleUpdateMedia(
    mediaId: number, 
    data: { name?: string; description?: string; default_caption?: string; is_active?: boolean }
  ) {
    await updateAgentMedia(agentId, mediaId, data);
    await loadMedia();
  }

  async function handleDeleteMedia(mediaId: number) {
    await deleteAgentMedia(agentId, mediaId);
    setMedia(media.filter(m => m.id !== mediaId));
  }

  async function handleSaveMediaConfig() {
    setSaving(true);
    setFeedback(null);
    try {
      await updateAgent(agentId, { media_config: mediaConfig });
      setFeedback({ type: 'success', text: 'הגדרות מדיה נשמרו!' });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: 'error', text: 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  }

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    if (newTab === 'conversations') {
      loadConversations();
      loadWaInbox();
    } else if (newTab === 'media') {
      loadMedia();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">טוען...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="text-center py-12 px-8">
          <h2 className="text-xl font-semibold text-white mb-2">סוכן לא נמצא</h2>
          <p className="text-slate-400 mb-6">הסוכן שחיפשת לא קיים במערכת</p>
          <Link href="/">
            <Button variant="primary">חזרה לדף הבית</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${BELOW_NAV_CLASS}`}>
      <header className="shrink-0 border-b border-purple-500/10 bg-[#0B0914]/80 backdrop-blur-sm">
        <div className={`${tab === 'conversations' ? 'max-w-[90rem]' : 'max-w-5xl'} mx-auto px-3 md:px-6 py-3 md:py-4 space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-semibold text-white text-sm md:text-base truncate">{agent.name}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
              <span className={`status-dot ${agent.is_active ? 'active' : 'inactive'}`} />
              <span>{agent.is_active ? 'פעיל' : 'מושבת'}</span>
            </div>
          </div>
          <AgentTabs tabs={visibleTabs} current={tab} onChange={handleTabChange} />
        </div>
      </header>

      {feedback && (
        <div className={`
          fixed top-20 left-1/2 -translate-x-1/2 z-50
          px-4 py-3 rounded-lg shadow-lg
          flex items-center gap-2
          animate-fade-in
          ${feedback.type === 'success' 
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' 
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }
        `}>
          {feedback.type === 'success' ? '✓' : '✕'}
          <span>{feedback.text}</span>
        </div>
      )}

      <main className="flex-1 min-h-0">
        {tab === 'conversations' ? (
          <div className="h-full max-w-[90rem] mx-auto px-3 md:px-6 py-3 flex flex-col min-h-0 animate-fade-in">
            <div className="flex-1 min-h-0">
            <ConversationsTab
              conversations={conversations}
              selectedId={selectedConv}
              messages={messages}
              templates={waInbox.templates}
              onSelectConversation={loadMessages}
              onDeleteConversation={handleDeleteConv}
              onDeselectConversation={() => { setSelectedConv(null); setMessages([]); updateUrlWithConversation(null); }}
              onNewChat={() => setShowNewChat(true)}
              onSendMessage={handleSendMessage}
              onSendMedia={handleSendMedia}
              onSendVoice={handleSendVoice}
              onSendTemplate={handleSendTemplate}
              onTogglePause={handleTogglePause}
              onLoadMore={loadMoreConversations}
              hasMore={!!nextCursor}
              loadingMore={loadingMore}
            />
            {showNewChat && (
              <NewChatModal
                agentId={agentId}
                inbox={waInbox}
                onClose={() => setShowNewChat(false)}
                onOpened={handleChatOpened}
              />
            )}
            </div>
          </div>
        ) : (
        <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-6 animate-fade-in">
          {tab === 'prompt' && (
            <PromptTab
              value={systemPrompt}
              onChange={setSystemPrompt}
              onSave={handleSavePrompt}
              saving={saving}
            />
          )}
          {tab === 'knowledge' && (
            <KnowledgeTab
              agentId={agentId}
              canUpload={isSuperAdmin(user)}
            />
          )}

          {tab === 'media' && (
            <MediaTab
              media={media}
              mediaConfig={mediaConfig}
              onUpload={handleUploadMedia}
              onUpdate={handleUpdateMedia}
              onDelete={handleDeleteMedia}
              onConfigChange={setMediaConfig}
              onSaveConfig={handleSaveMediaConfig}
              saving={saving}
              canUpload={isSuperAdmin(user)}
              canEdit={isSuperAdmin(user) || isAdmin(user)}
              canShowConfig={isSuperAdmin(user)}
            />
          )}

          {tab === 'templates' && (
            <TemplatesTab agentId={agentId} />
          )}

          {tab === 'functions' && (
            <FunctionsTab agentId={agentId} />
          )}

          {tab === 'triggers' && (
            <TriggersTab
              agentId={agentId}
              canSendMessage={
                provider === 'wasender'
                || (agent.active_channel_types || []).includes('whatsapp_wasender')
              }
            />
          )}

          {tab === 'escalation' && (
            <EscalationTab agentId={agentId} />
          )}

          {tab === 'calendar' && (
            <CalendarTab
              agentId={agentId}
              provider={provider}
              appointmentPrompt={appointmentPrompt}
              onAppointmentPromptChange={setAppointmentPrompt}
              onSave={handleSaveCalendar}
              saving={saving}
              canShowAdvanced={isSuperAdmin(user)}
            />
          )}

          {tab === 'followups' && (
            <FollowUpTab agentId={agentId} provider={provider} />
          )}

          {tab === 'summaries' && (
            <SummaryTab agentId={agentId} />
          )}

          {tab === 'channels' && (
            <ChannelsTab agentId={agentId} canEdit={isSuperAdmin(user)} />
          )}

          {tab === 'settings' && (
            <SettingsTab
              agentId={agentId}
              name={name}
              model={model}
              thinkingLevel={thinkingLevel}
              batchingConfig={batchingConfig}
              maxToolRounds={maxToolRounds}
              customApiKeys={customApiKeys}
              contextSummaryConfig={contextSummaryConfig}
              onNameChange={setName}
              onModelChange={(v: string) => {
                setModel(v);
                setThinkingLevel(getModel(v).defaultThinking);
              }}
              onThinkingLevelChange={setThinkingLevel}
              onBatchingConfigChange={setBatchingConfig}
              onMaxToolRoundsChange={setMaxToolRounds}
              onCustomApiKeysChange={setCustomApiKeys}
              onContextSummaryConfigChange={setContextSummaryConfig}
              onSave={handleSaveSettings}
              saving={saving}
              onNavigateToChannels={() => setTab('channels')}
            />
          )}
        </div>
        </div>
        )}
      </main>
    </div>
  );
}

export default function AgentPageWrapper() {
  return (
    <AuthGuard>
      <AgentPage />
    </AuthGuard>
  );
}
