'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, ArrowRightIcon, PlusIcon, UserIcon, EditIcon, TrashIcon, KeyIcon } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { CreateUserModal, EditUserModal, ResetPasswordModal, AgentAssignmentModal } from '@/components/users/UserModals';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/auth';
import {
  getAdmins, updateAdmin, deleteAdmin,
  getEmployees, updateEmployee, deleteEmployee,
  getSuperAdmins, createSuperAdmin, resetSuperAdminPassword, deleteSuperAdmin,
  AuthUserResponse, AuthUserWithAgents,
} from '@/lib/api';

type TabType = 'admins' | 'employees';

function UsersPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(isSuperAdmin(user) ? 'admins' : 'employees');
  const [admins, setAdmins] = useState<AuthUserWithAgents[]>([]);
  const [employees, setEmployees] = useState<AuthUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUserResponse | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<AuthUserResponse | null>(null);
  const [showAgentModal, setShowAgentModal] = useState<AuthUserWithAgents | null>(null);

  // Super admin management state
  const [superAdmins, setSuperAdmins] = useState<AuthUserResponse[]>([]);
  const [showCreateSA, setShowCreateSA] = useState(false);
  const [resetSAPassword, setResetSAPassword] = useState<AuthUserResponse | null>(null);
  const [saForm, setSaForm] = useState({ email: '', password: '', name: '' });
  const [saNewPassword, setSaNewPassword] = useState('');
  const [saLoading, setSaLoading] = useState(false);

  useEffect(() => {
    loadData();
    if (isSuperAdmin(user)) loadSuperAdmins();
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'admins' && isSuperAdmin(user)) {
        const data = await getAdmins();
        setAdmins(data.admins);
      } else {
        const data = await getEmployees();
        setEmployees(data.employees);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuperAdmins() {
    try {
      const data = await getSuperAdmins();
      setSuperAdmins(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateSA() {
    if (!saForm.email || !saForm.password || !saForm.name) return;
    setSaLoading(true);
    try {
      const created = await createSuperAdmin(saForm);
      setSuperAdmins(prev => [created, ...prev]);
      setShowCreateSA(false);
      setSaForm({ email: '', password: '', name: '' });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה ביצירת מנהל מערכת');
    } finally {
      setSaLoading(false);
    }
  }

  async function handleResetSAPassword() {
    if (!resetSAPassword || !saNewPassword) return;
    setSaLoading(true);
    try {
      await resetSuperAdminPassword(resetSAPassword.id, { new_password: saNewPassword });
      setResetSAPassword(null);
      setSaNewPassword('');
    } catch {
      alert('שגיאה באיפוס סיסמה');
    } finally {
      setSaLoading(false);
    }
  }

  async function handleDeleteSA(id: number) {
    if (!confirm('למחוק מנהל מערכת זה?')) return;
    try {
      await deleteSuperAdmin(id);
      setSuperAdmins(prev => prev.filter(u => u.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'שגיאה במחיקה');
    }
  }

  async function handleDelete(id: number) {
    const type = activeTab === 'admins' ? 'לקוח' : 'עובד';
    if (!confirm(`למחוק את ה${type}?`)) return;
    
    try {
      if (activeTab === 'admins') {
        await deleteAdmin(id);
        setAdmins(admins.filter(a => a.id !== id));
      } else {
        await deleteEmployee(id);
        setEmployees(employees.filter(e => e.id !== id));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה במחיקה');
    }
  }

  async function handleToggleActive(userItem: AuthUserResponse) {
    try {
      if (activeTab === 'admins') {
        await updateAdmin(userItem.id, { is_active: !userItem.is_active });
        setAdmins(admins.map(a => a.id === userItem.id ? { ...a, is_active: !a.is_active } : a));
      } else {
        await updateEmployee(userItem.id, { is_active: !userItem.is_active });
        setEmployees(employees.map(e => e.id === userItem.id ? { ...e, is_active: !e.is_active } : e));
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 md:gap-3">
              <Link href="/" className="text-slate-400 hover:text-white transition">
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-base md:text-xl font-bold text-white">ניהול משתמשים</h1>
                <p className="text-xs text-slate-400 hidden sm:block">
                  {isSuperAdmin(user) ? 'ניהול לקוחות ועובדים' : 'ניהול עובדים'}
                </p>
              </div>
            </div>
            <Button variant="success" icon={<PlusIcon />} onClick={() => setShowCreateModal(true)}>
              <span className="hidden sm:inline">{activeTab === 'admins' ? 'לקוח חדש' : 'עובד חדש'}</span>
              <span className="sm:hidden">חדש</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-8">
        {/* Super Admin Management Section */}
        {isSuperAdmin(user) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">מנהלי מערכת</h2>
              <Button variant="secondary" size="sm" icon={<PlusIcon />} onClick={() => setShowCreateSA(true)}>
                מנהל מערכת חדש
              </Button>
            </div>

            {superAdmins.length === 0 ? (
              <Card className="text-center py-6">
                <p className="text-slate-400 text-sm">אין מנהלי מערכת נוספים</p>
              </Card>
            ) : (
              <div className="grid gap-3">
                {superAdmins.map((sa) => (
                  <Card key={sa.id} padding="none">
                    <div className="p-3 md:p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                          <KeyIcon />
                        </div>
                        <div className="min-w-0">
                          <span className="text-white font-medium text-sm md:text-base">{sa.name}</span>
                          <div className="text-xs md:text-sm text-slate-400 truncate">{sa.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<KeyIcon />}
                          onClick={() => { setResetSAPassword(sa); setSaNewPassword(''); }}
                        >
                          <span className="hidden sm:inline">איפוס סיסמה</span>
                        </Button>
                        {sa.id !== user?.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<TrashIcon />}
                            onClick={() => handleDeleteSA(sa.id)}
                          >
                            <span className="hidden sm:inline">מחק</span>
                          </Button>
                        )}
                        {sa.id === user?.id && (
                          <span className="text-xs text-slate-500 px-2">אתה</span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Create Super Admin Modal */}
            {showCreateSA && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCreateSA(false)}>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-4">מנהל מערכת חדש</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-slate-400 block mb-1">שם</label>
                      <input
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                        value={saForm.name}
                        onChange={e => setSaForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="שם מנהל המערכת"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 block mb-1">אימייל</label>
                      <input
                        type="email"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                        value={saForm.email}
                        onChange={e => setSaForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 block mb-1">סיסמה</label>
                      <input
                        type="password"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                        value={saForm.password}
                        onChange={e => setSaForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="לפחות 8 תווים"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <Button variant="secondary" onClick={() => setShowCreateSA(false)}>ביטול</Button>
                    <Button variant="success" onClick={handleCreateSA} disabled={saLoading || !saForm.email || !saForm.password || !saForm.name}>
                      {saLoading ? 'יוצר...' : 'צור מנהל מערכת'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Super Admin Password Modal */}
            {resetSAPassword && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setResetSAPassword(null)}>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-2">איפוס סיסמה</h3>
                  <p className="text-sm text-slate-400 mb-4">{resetSAPassword.name} ({resetSAPassword.email})</p>
                  <div>
                    <label className="text-sm text-slate-400 block mb-1">סיסמה חדשה</label>
                    <input
                      type="password"
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                      value={saNewPassword}
                      onChange={e => setSaNewPassword(e.target.value)}
                      placeholder="לפחות 8 תווים"
                    />
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <Button variant="secondary" onClick={() => setResetSAPassword(null)}>ביטול</Button>
                    <Button variant="success" onClick={handleResetSAPassword} disabled={saLoading || saNewPassword.length < 8}>
                      {saLoading ? 'מאפס...' : 'אפס סיסמה'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <hr className="border-slate-700/50 mt-6" />
          </div>
        )}

        {/* Tabs - only for super admin */}
        {isSuperAdmin(user) && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('admins')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'admins'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              לקוחות ({admins.length})
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'employees'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              עובדים ({employees.length})
            </button>
          </div>
        )}

        {/* Users List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl skeleton" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {(activeTab === 'admins' ? admins : employees).length === 0 ? (
              <Card className="text-center py-12">
                <p className="text-slate-400 mb-4">
                  {activeTab === 'admins' ? 'אין לקוחות עדיין' : 'אין עובדים עדיין'}
                </p>
                <Button variant="success" onClick={() => setShowCreateModal(true)}>
                  {activeTab === 'admins' ? 'הוסף לקוח' : 'הוסף עובד'}
                </Button>
              </Card>
            ) : activeTab === 'admins' ? (
              admins.map((adminItem) => (
                <Card key={adminItem.id} hover padding="none">
                  <div className="p-3 md:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      <div className={`
                        w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-lg md:text-xl shrink-0
                        ${adminItem.is_active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700/50 text-slate-400'}
                      `}>
                        <UserIcon />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`status-dot ${adminItem.is_active ? 'active' : 'inactive'}`} />
                          <span className="text-base md:text-lg font-semibold text-white truncate">{adminItem.name}</span>
                        </div>
                        <div className="text-xs md:text-sm text-slate-400 truncate">{adminItem.email}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {adminItem.agent_ids.length} סוכנים משויכים
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 self-end sm:self-center shrink-0">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggleActive(adminItem)}
                        className={`
                          relative w-12 h-6 rounded-full transition-colors duration-200
                          ${adminItem.is_active ? 'bg-emerald-500' : 'bg-slate-600'}
                        `}
                        title={adminItem.is_active ? 'לחץ להשבתה' : 'לחץ להפעלה'}
                      >
                        <span className={`
                          absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                          ${adminItem.is_active ? 'right-1' : 'left-1'}
                        `} />
                      </button>

                      {/* Agent Assignment */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowAgentModal(adminItem)}
                      >
                        סוכנים
                      </Button>

                      {/* Reset Password */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPasswordModal(adminItem)}
                        title="איפוס סיסמה"
                      >
                        <KeyIcon />
                      </Button>

                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(adminItem)}
                      >
                        <EditIcon />
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(adminItem.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              employees.map((empItem) => (
                <Card key={empItem.id} hover padding="none">
                  <div className="p-3 md:p-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      <div className={`
                        w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-lg md:text-xl shrink-0
                        ${empItem.is_active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700/50 text-slate-400'}
                      `}>
                        <UserIcon />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`status-dot ${empItem.is_active ? 'active' : 'inactive'}`} />
                          <span className="text-base md:text-lg font-semibold text-white truncate">{empItem.name}</span>
                          {isSuperAdmin(user) && empItem.parent_name && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                              עובד של {empItem.parent_name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs md:text-sm text-slate-400 truncate">{empItem.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 self-end sm:self-center shrink-0">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggleActive(empItem)}
                        className={`
                          relative w-12 h-6 rounded-full transition-colors duration-200
                          ${empItem.is_active ? 'bg-emerald-500' : 'bg-slate-600'}
                        `}
                        title={empItem.is_active ? 'לחץ להשבתה' : 'לחץ להפעלה'}
                      >
                        <span className={`
                          absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
                          ${empItem.is_active ? 'right-1' : 'left-1'}
                        `} />
                      </button>

                      {/* Reset Password */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPasswordModal(empItem)}
                        title="איפוס סיסמה"
                      >
                        <KeyIcon />
                      </Button>

                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(empItem)}
                      >
                        <EditIcon />
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(empItem.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateUserModal
          type={activeTab}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          type={activeTab}
          onClose={() => setEditingUser(null)}
          onUpdated={() => {
            setEditingUser(null);
            loadData();
          }}
        />
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <ResetPasswordModal
          user={showPasswordModal}
          type={activeTab}
          onClose={() => setShowPasswordModal(null)}
        />
      )}

      {/* Agent Assignment Modal */}
      {showAgentModal && (
        <AgentAssignmentModal
          admin={showAgentModal}
          onClose={() => setShowAgentModal(null)}
          onUpdated={() => {
            setShowAgentModal(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ============ Export with Auth Guard ============
export default function UsersPageWrapper() {
  return (
    <AuthGuard allowedRoles={['super_admin', 'admin']}>
      <UsersPage />
    </AuthGuard>
  );
}
