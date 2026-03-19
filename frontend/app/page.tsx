'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Agent, getAgents, deleteAgent, updateAgent } from '@/lib/api';
import { Button, Card, PlusIcon, ArrowLeftIcon, TrashIcon, MetaSmallIcon, WaSenderSmallIcon } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/auth';
import { LegalFooter } from '@/components/ui/LegalModals';

function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user, logout } = useAuth();

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('למחוק את הסוכן?')) return;
    try {
      await deleteAgent(id);
      setAgents(agents.filter(a => a.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleToggleActive(id: number, currentStatus: boolean) {
    try {
      await updateAgent(id, { is_active: !currentStatus });
      setAgents(agents.map(a => 
        a.id === id ? { ...a, is_active: !currentStatus } : a
      ));
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-8">
        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl skeleton" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card className="text-center py-16">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-xl font-semibold text-white mb-2">אין סוכנים עדיין</h2>
            <p className="text-slate-400 mb-6">צור את הסוכן הראשון שלך כדי להתחיל</p>
            <Link href="/new">
              <Button variant="success" size="lg" icon={<PlusIcon />}>
                צור סוכן חדש
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש סוכן..."
                className="w-full bg-white/[0.03] border border-purple-500/10 rounded-xl py-2.5 pr-10 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/40 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
              <Card padding="sm" className="text-center">
                <div className="text-2xl font-bold text-white">{agents.length}</div>
                <div className="text-xs text-slate-400">סוכנים</div>
              </Card>
              <Card padding="sm" className="text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {agents.filter(a => a.is_active).length}
                </div>
                <div className="text-xs text-slate-400">פעילים</div>
              </Card>
              <Card padding="sm" className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {agents.filter(a => !a.is_active).length}
                </div>
                <div className="text-xs text-slate-400">מושבתים</div>
              </Card>
            </div>

            {/* Agent Cards */}
            {(() => {
              const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
              if (filtered.length === 0 && search) {
                return (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    לא נמצאו סוכנים עבור &quot;{search}&quot;
                  </div>
                );
              }
              return filtered.map((agent, index) => (
              <Card 
                key={agent.id} 
                hover 
                padding="none"
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
              >
                <div className="p-3 md:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className={`
                      w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-lg md:text-xl shrink-0
                      ${agent.is_active 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : 'bg-slate-700/50 text-slate-400'
                      }
                    `}>
                      🤖
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`status-dot ${agent.is_active ? 'active' : 'inactive'}`} />
                        <span className="text-base md:text-lg font-semibold text-white truncate">{agent.name}</span>
                        {/* Provider Badge */}
                        <span className={`
                          text-xs px-2 py-0.5 rounded flex items-center gap-1
                          ${agent.provider === 'wasender' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-purple-500/20 text-purple-300'
                          }
                        `}>
                          {agent.provider === 'wasender' ? (
                            <>
                              <WaSenderSmallIcon />
                              WA Sender
                            </>
                          ) : (
                            <>
                              <MetaSmallIcon />
                              Meta
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs md:text-sm text-slate-400 truncate">{agent.phone_number_id}</span>
                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded hidden sm:inline">
                          {agent.model.split('-').slice(0, 2).join(' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 self-end sm:self-center shrink-0">
                    {/* Toggle Switch - Super Admin only */}
                    {isSuperAdmin(user) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(agent.id, agent.is_active);
                        }}
                        className={`
                          relative w-12 h-6 rounded-full transition-colors duration-200
                          ${agent.is_active ? 'bg-emerald-500' : 'bg-slate-600'}
                        `}
                        title={agent.is_active ? 'לחץ להשבתה' : 'לחץ להפעלה'}
                      >
                        <span className={`
                          absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                          ${agent.is_active ? 'right-1' : 'left-1'}
                        `} />
                      </button>
                    )}

                    <Link href={`/agent/${agent.id}`}>
                      <Button variant="primary" size="sm">
                        הכנס
                        <ArrowLeftIcon />
                      </Button>
                    </Link>
                    {isSuperAdmin(user) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(agent.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <TrashIcon />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ));
            })()}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-800 mt-8">
        <LegalFooter />
      </footer>
    </div>
  );
}

// Main export with AuthGuard
export default function Home() {
  return (
    <AuthGuard>
      <HomePage />
    </AuthGuard>
  );
}
