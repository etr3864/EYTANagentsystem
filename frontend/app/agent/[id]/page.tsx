'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button, Card } from '@/components/ui';
import { PromptTab, SettingsTab, ConversationsTab, KnowledgeTab, CalendarTab, SummaryTab, MediaTab } from '@/components/agent';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin, isAdmin, isEmployee } from '@/lib/auth';
import { 
  getAgent, updateAgent, getConversations, getMessages, deleteConversation, 
  sendMessage, pauseConversation, resumeConversation,
  getDocuments, uploadDocument, deleteDocument,
  getDataTables, uploadDataTable, deleteDataTable,
  getAgentMedia, uploadAgentMedia, updateAgentMedia, deleteAgentMedia,
  type MediaUploadData
} from '@/lib/api';
import type { Agent, AgentBatchingConfig, Conversation, Message, Document, DataTable, Provider, WaSenderConfig, AgentMedia, MediaConfig } from '@/lib/types';

type Tab = 'prompt' | 'conversations' | 'knowledge' | 'media' | 'calendar' | 'summaries' | 'settings';

interface TabConfig {
  id: Tab;
  label: string;
  icon: string;
  roles: ('super_admin' | 'admin' | 'employee')[];
}

const allTabs: TabConfig[] = [
  { id: 'prompt', label: 'System Prompt', icon: '🎯', roles: ['super_admin'] },
  { id: 'conversations', label: 'שיחות', icon: '💬', roles: ['super_admin', 'admin', 'employee'] },
  { id: 'knowledge', label: 'מאגר מידע', icon: '📚', roles: ['super_admin', 'admin'] },
  { id: 'media', label: 'מדיה', icon: '📸', roles: ['super_admin', 'admin'] },
  { id: 'calendar', label: 'יומן', icon: '📅', roles: ['super_admin'] },
  { id: 'summaries', label: 'סיכומים', icon: '📝', roles: ['super_admin'] },
  { id: 'settings', label: 'הגדרות', icon: '⚙️', roles: ['super_admin'] },
];

function AgentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Filter tabs based on user role
  const visibleTabs = useMemo(() => {
    if (!user) return [];
    return allTabs.filter(t => t.roles.includes(user.role));
  }, [user]);
  
  // Default tab based on role
  const defaultTab = useMemo(() => {
    if (isSuperAdmin(user)) return 'prompt';
    return 'conversations';
  }, [user]);
  
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
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [isActive, setIsActive] = useState(true);
  const [provider, setProvider] = useState<Provider>('meta');
  const [providerConfig, setProviderConfig] = useState<WaSenderConfig | Record<string, never>>({});
  const [batchingConfig, setBatchingConfig] = useState<AgentBatchingConfig>({ 
    debounce_seconds: 3, 
    max_batch_messages: 10, 
    max_history_messages: 20 
  });

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Knowledge state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [dataTables, setDataTables] = useState<DataTable[]>([]);

  // Media state
  const [media, setMedia] = useState<AgentMedia[]>([]);
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | null>(null);

  const agentId = Number(params.id);

  useEffect(() => {
    loadAgent();
    
    // Check for tab parameter from OAuth redirect
    const urlTab = searchParams.get('tab') as Tab | null;
    if (urlTab && visibleTabs.some(t => t.id === urlTab)) {
      setTab(urlTab);
    } else if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === tab)) {
      // If current tab is not visible, switch to first visible tab
      setTab(visibleTabs[0].id);
    }
    
    // If URL has conv parameter, load conversations to find it
    const urlPhone = searchParams.get('conv');
    if (urlPhone) {
      loadConversations();
    }
  }, [agentId, visibleTabs]);

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
      setPhoneNumberId(data.phone_number_id);
      setAccessToken(data.access_token);
      setVerifyToken(data.verify_token);
      setModel(data.model);
      setIsActive(data.is_active);
      setProvider(data.provider || 'meta');
      setProviderConfig(data.provider_config || {});
      setBatchingConfig(data.batching_config || { 
        debounce_seconds: 3, 
        max_batch_messages: 10, 
        max_history_messages: 20 
      });
      setMediaConfig(data.media_config || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Update URL with conversation phone number
  const updateUrlWithConversation = useCallback((conv: Conversation | null) => {
    if (conv) {
      router.replace(`/agent/${agentId}?conv=${conv.user_phone}`, { scroll: false });
    } else {
      router.replace(`/agent/${agentId}`, { scroll: false });
    }
  }, [agentId, router]);

  async function loadConversations() {
    try {
      const data = await getConversations(agentId);
      setConversations(data);
      
      // Check if URL has a conversation phone to auto-select
      const urlPhone = searchParams.get('conv');
      if (urlPhone && data.length > 0) {
        const conv = data.find(c => c.user_phone === urlPhone);
        if (conv) {
          loadMessagesWithPhone(conv.id, conv.user_phone);
          setTab('conversations');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMessagesWithPhone(convId: number, userPhone: string) {
    try {
      const data = await getMessages(convId);
      setMessages(data);
      setSelectedConv(convId);
      
      // Update URL with the phone number
      router.replace(`/agent/${agentId}?conv=${userPhone}`, { scroll: false });
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
      // Always save provider_config so WA Sender settings persist when switching to Meta
      await updateAgent(agentId, {
        name, 
        phone_number_id: phoneNumberId, 
        access_token: accessToken,
        verify_token: verifyToken, 
        model, 
        is_active: isActive,
        provider,
        provider_config: providerConfig,
        batching_config: batchingConfig
      });
      setFeedback({ type: 'success', text: 'נשמר בהצלחה!' });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: 'error', text: 'שגיאה בשמירה' });
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
    
    // Refresh messages to show the sent message
    await loadMessages(selectedConv);
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

  // Knowledge functions
  async function loadKnowledge() {
    try {
      const [docs, tables] = await Promise.all([
        getDocuments(agentId),
        getDataTables(agentId)
      ]);
      setDocuments(docs);
      setDataTables(tables);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUploadDocument(file: File, onProgress: (p: number) => void) {
    await uploadDocument(agentId, file, onProgress);
    await loadKnowledge();
  }

  async function handleDeleteDocument(docId: number) {
    await deleteDocument(agentId, docId);
    setDocuments(documents.filter(d => d.id !== docId));
  }

  async function handleUploadTable(file: File, name: string, onProgress: (p: number) => void) {
    await uploadDataTable(agentId, file, name, undefined, onProgress);
    await loadKnowledge();
  }

  async function handleDeleteTable(tableId: number) {
    await deleteDataTable(agentId, tableId);
    setDataTables(dataTables.filter(t => t.id !== tableId));
  }

  // Media functions
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
    } else if (newTab === 'knowledge') {
      loadKnowledge();
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
          <div className="text-5xl mb-4">❌</div>
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowRightIcon />
                  חזרה
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-700" />
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center text-lg
                  ${agent.is_active 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'bg-slate-700/50 text-slate-400'
                  }
                `}>
                  🤖
                </div>
                <div>
                  <h1 className="font-semibold text-white">{agent.name}</h1>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`status-dot ${agent.is_active ? 'active' : 'inactive'}`} />
                    <span>{agent.is_active ? 'פעיל' : 'מושבת'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Feedback Toast */}
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

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex gap-1">
            {visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`
                  px-4 py-3 text-sm font-medium
                  border-b-2 transition-all duration-200
                  ${tab === t.id 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                  }
                `}
              >
                <span className="ml-2">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="animate-fade-in">
          {tab === 'prompt' && (
            <PromptTab
              value={systemPrompt}
              onChange={setSystemPrompt}
              onSave={handleSavePrompt}
              saving={saving}
            />
          )}

          {tab === 'conversations' && (
            <ConversationsTab
              conversations={conversations}
              selectedId={selectedConv}
              messages={messages}
              onSelectConversation={loadMessages}
              onDeleteConversation={handleDeleteConv}
              onSendMessage={handleSendMessage}
              onTogglePause={handleTogglePause}
            />
          )}

          {tab === 'knowledge' && (
            <KnowledgeTab
              documents={documents}
              tables={dataTables}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
              onUploadTable={handleUploadTable}
              onDeleteTable={handleDeleteTable}
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

          {tab === 'calendar' && (
            <CalendarTab
              agentId={agentId}
              appointmentPrompt={appointmentPrompt}
              onAppointmentPromptChange={setAppointmentPrompt}
              onSave={handleSaveCalendar}
              saving={saving}
            />
          )}

          {tab === 'summaries' && (
            <SummaryTab agentId={agentId} />
          )}

          {tab === 'settings' && (
            <SettingsTab
              agentId={agentId}
              name={name}
              phoneNumberId={phoneNumberId}
              accessToken={accessToken}
              verifyToken={verifyToken}
              model={model}
              provider={provider}
              providerConfig={providerConfig}
              batchingConfig={batchingConfig}
              onNameChange={setName}
              onPhoneNumberIdChange={setPhoneNumberId}
              onAccessTokenChange={setAccessToken}
              onVerifyTokenChange={setVerifyToken}
              onModelChange={setModel}
              onProviderChange={setProvider}
              onProviderConfigChange={setProviderConfig}
              onBatchingConfigChange={setBatchingConfig}
              onSave={handleSaveSettings}
              saving={saving}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

export default function AgentPageWrapper() {
  return (
    <AuthGuard>
      <AgentPage />
    </AuthGuard>
  );
}
