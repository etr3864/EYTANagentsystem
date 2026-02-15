'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button, Card, ArrowRightIcon, TrashIcon, RefreshIcon } from '@/components/ui';
import { DataTable } from '@/components/database';
import { 
  getAgents, deleteAgent,
  getUsers, deleteUser,
  getDbConversations, deleteConversation,
  getDbMessages, deleteDbMessage,
  getUsageStats,
  getDbAppointments, deleteDbAppointment,
  getDbReminders, deleteDbReminder,
  getDbSummaries, deleteDbSummary,
  getDbMedia, deleteDbMedia,
  getDbTemplates, deleteDbTemplate,
  getDbFollowups, deleteDbFollowup
} from '@/lib/api';
import type { Agent, User, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, DbMedia, DbTemplate, DbFollowup } from '@/lib/types';
import {
  agentColumns, userColumns, conversationColumns, messageColumns,
  appointmentColumns, reminderColumns, summaryColumns, usageColumns,
  mediaColumns, templateColumns, followupColumns
} from './columns';

type Tab = 'agents' | 'users' | 'conversations' | 'messages' | 'media' | 'templates' | 'appointments' | 'reminders' | 'followups' | 'summaries' | 'usage';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'conversations', label: 'Conversations', icon: '💬' },
  { id: 'messages', label: 'Messages', icon: '📝' },
  { id: 'media', label: 'Media', icon: '📸' },
  { id: 'templates', label: 'Templates', icon: '📋' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'reminders', label: 'Reminders', icon: '⏰' },
  { id: 'followups', label: 'Follow-ups', icon: '🔄' },
  { id: 'summaries', label: 'Summaries', icon: '📋' },
  { id: 'usage', label: 'Usage', icon: '📊' },
];

export default function DatabasePage() {
  const [tab, setTab] = useState<Tab>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<DbConversation[]>([]);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [media, setMedia] = useState<DbMedia[]>([]);
  const [dbTemplates, setDbTemplates] = useState<DbTemplate[]>([]);
  const [appointments, setAppointments] = useState<DbAppointment[]>([]);
  const [reminders, setReminders] = useState<DbReminder[]>([]);
  const [followups, setFollowups] = useState<DbFollowup[]>([]);
  const [summaries, setSummaries] = useState<DbSummary[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    setSelected(new Set());
    try {
      if (tab === 'agents') setAgents(await getAgents());
      else if (tab === 'users') setUsers(await getUsers());
      else if (tab === 'conversations') setConversations(await getDbConversations());
      else if (tab === 'messages') setMessages(await getDbMessages());
      else if (tab === 'media') setMedia(await getDbMedia());
      else if (tab === 'templates') setDbTemplates(await getDbTemplates());
      else if (tab === 'appointments') setAppointments(await getDbAppointments());
      else if (tab === 'reminders') setReminders(await getDbReminders());
      else if (tab === 'followups') setFollowups(await getDbFollowups());
      else if (tab === 'summaries') setSummaries(await getDbSummaries());
      else if (tab === 'usage') setUsageStats(await getUsageStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!confirm(`למחוק ${selected.size} רשומות?`)) return;
    
    try {
      for (const id of selected) {
        if (tab === 'agents') await deleteAgent(id);
        else if (tab === 'users') await deleteUser(id);
        else if (tab === 'conversations') await deleteConversation(id);
        else if (tab === 'messages') await deleteDbMessage(id);
        else if (tab === 'media') await deleteDbMedia(id);
        else if (tab === 'templates') await deleteDbTemplate(id);
        else if (tab === 'appointments') await deleteDbAppointment(id);
        else if (tab === 'reminders') await deleteDbReminder(id);
        else if (tab === 'followups') await deleteDbFollowup(id);
        else if (tab === 'summaries') await deleteDbSummary(id);
      }
      loadData();
    } catch (e) {
      console.error(e);
    }
  }

  function getCount() {
    if (tab === 'agents') return agents.length;
    if (tab === 'users') return users.length;
    if (tab === 'conversations') return conversations.length;
    if (tab === 'messages') return messages.length;
    if (tab === 'media') return media.length;
    if (tab === 'templates') return dbTemplates.length;
    if (tab === 'appointments') return appointments.length;
    if (tab === 'reminders') return reminders.length;
    if (tab === 'followups') return followups.length;
    if (tab === 'summaries') return summaries.length;
    if (tab === 'usage') return usageStats.length;
    return 0;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowRightIcon />
                  <span className="hidden sm:inline">חזרה</span>
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-700" />
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-lg md:text-xl shrink-0">
                  🗄️
                </div>
                <div>
                  <h1 className="font-semibold text-white text-sm md:text-base">Database</h1>
                  <p className="text-xs text-slate-400 hidden sm:block">ניהול נתונים</p>
                </div>
              </div>
            </div>

            {/* Delete Button */}
            {selected.size > 0 && (
              <Button 
                variant="danger" 
                size="sm"
                onClick={handleDelete}
              >
                <TrashIcon />
                <span className="hidden sm:inline">מחק</span> {selected.size}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 md:px-6">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`
                  px-2 md:px-3 py-3 text-xs md:text-sm font-medium whitespace-nowrap
                  border-b-2 transition-all duration-200
                  ${tab === t.id 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                  }
                `}
              >
                <span className="ml-1 md:ml-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-6">
        {/* Stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            {getCount()} רשומות
          </div>
          <button 
            onClick={loadData} 
            className="text-sm text-slate-400 hover:text-white flex items-center gap-1"
          >
            <RefreshIcon />
            רענן
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <Card className="py-12">
            <div className="flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            {tab === 'agents' && (
              <DataTable data={agents} columns={agentColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'users' && (
              <DataTable data={users} columns={userColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'conversations' && (
              <DataTable data={conversations} columns={conversationColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'messages' && (
              <DataTable data={messages} columns={messageColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'media' && (
              <DataTable data={media} columns={mediaColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'templates' && (
              <DataTable data={dbTemplates} columns={templateColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'appointments' && (
              <DataTable data={appointments} columns={appointmentColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'reminders' && (
              <DataTable data={reminders} columns={reminderColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'followups' && (
              <DataTable data={followups} columns={followupColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'summaries' && (
              <DataTable data={summaries} columns={summaryColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'usage' && (
              <DataTable data={usageStats} columns={usageColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

