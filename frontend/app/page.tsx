'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Agent, getAgents, deleteAgent, updateAgent } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/auth';

function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
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
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img 
                src="https://res.cloudinary.com/daowx6msw/image/upload/v1761607495/white_logogg_uf3usn.png" 
                alt="Logo"
                className="h-10 w-10 object-contain"
              />
              <img 
                src="https://res.cloudinary.com/daowx6msw/image/upload/v1763910407/white_logoggfdsdfgdfsgds_bdqrww.png" 
                alt="WhatsApp Agents"
                className="h-8 object-contain"
              />
            </div>
            <div className="flex items-center gap-4">
              {/* User Info */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">{user?.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                  {user?.role === 'super_admin' ? 'מנהל ראשי' : 
                   user?.role === 'admin' ? 'לקוח' : 'עובד'}
                </span>
              </div>
              
              <div className="flex gap-3">
                {(isSuperAdmin(user) || user?.role === 'admin') && (
                  <Link href="/users">
                    <Button variant="secondary" icon={<UsersIcon />}>
                      משתמשים
                    </Button>
                  </Link>
                )}
                {isSuperAdmin(user) && (
                  <Link href="/database">
                    <Button variant="secondary" icon={<DatabaseIcon />}>
                      Database
                    </Button>
                  </Link>
                )}
                {isSuperAdmin(user) && (
                  <Link href="/new">
                    <Button variant="success" icon={<PlusIcon />}>
                      סוכן חדש
                    </Button>
                  </Link>
                )}
                <Button 
                  variant="ghost" 
                  onClick={logout}
                  className="text-slate-400 hover:text-white"
                >
                  <LogoutIcon />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
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
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4 mb-6">
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
            {agents.map((agent, index) => (
              <Card 
                key={agent.id} 
                hover 
                padding="none"
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
              >
                <div className="p-5 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-12 h-12 rounded-xl flex items-center justify-center text-xl
                      ${agent.is_active 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : 'bg-slate-700/50 text-slate-400'
                      }
                    `}>
                      🤖
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${agent.is_active ? 'active' : 'inactive'}`} />
                        <span className="text-lg font-semibold text-white">{agent.name}</span>
                        {/* Provider Badge */}
                        <span className={`
                          text-xs px-2 py-0.5 rounded flex items-center gap-1
                          ${agent.provider === 'wasender' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-blue-500/20 text-blue-400'
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
                        <span className="text-sm text-slate-400">{agent.phone_number_id}</span>
                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                          {agent.model.split('-').slice(0, 2).join(' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Icons
function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function MetaSmallIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  );
}

function WaSenderSmallIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
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
