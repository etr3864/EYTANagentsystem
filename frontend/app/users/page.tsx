'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Input, PasswordInput } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin, isAdmin } from '@/lib/auth';
import {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  resetAdminPassword,
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  resetEmployeePassword,
  getAgents,
  assignAgentToAdmin,
  unassignAgentFromAdmin,
  getUnassignedAgents,
  AuthUserResponse,
  AuthUserWithAgents,
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

  useEffect(() => {
    loadData();
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
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-slate-400 hover:text-white transition">
                <ArrowRightIcon />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">ניהול משתמשים</h1>
                <p className="text-xs text-slate-400">
                  {isSuperAdmin(user) ? 'ניהול לקוחות ועובדים' : 'ניהול עובדים'}
                </p>
              </div>
            </div>
            <Button variant="success" icon={<PlusIcon />} onClick={() => setShowCreateModal(true)}>
              {activeTab === 'admins' ? 'לקוח חדש' : 'עובד חדש'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
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
                  <div className="p-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center text-xl
                        ${adminItem.is_active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700/50 text-slate-400'}
                      `}>
                        <UserIcon />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`status-dot ${adminItem.is_active ? 'active' : 'inactive'}`} />
                          <span className="text-lg font-semibold text-white">{adminItem.name}</span>
                        </div>
                        <div className="text-sm text-slate-400">{adminItem.email}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {adminItem.agent_ids.length} סוכנים משויכים
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                  <div className="p-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center text-xl
                        ${empItem.is_active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700/50 text-slate-400'}
                      `}>
                        <UserIcon />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`status-dot ${empItem.is_active ? 'active' : 'inactive'}`} />
                          <span className="text-lg font-semibold text-white">{empItem.name}</span>
                          {isSuperAdmin(user) && empItem.parent_name && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                              עובד של {empItem.parent_name}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-400">{empItem.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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

// ============ Create User Modal ============
function CreateUserModal({ 
  type, 
  onClose, 
  onCreated 
}: { 
  type: TabType; 
  onClose: () => void; 
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; general?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validation
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'נא להזין שם';
    if (!email.trim()) newErrors.email = 'נא להזין אימייל';
    if (!password || password.length < 8) newErrors.password = 'סיסמה חייבת להיות לפחות 8 תווים';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      if (type === 'admins') {
        await createAdmin({ name, email, password });
      } else {
        await createEmployee({ name, email, password });
      }
      onCreated();
    } catch (e) {
      setErrors({ general: e instanceof Error ? e.message : 'שגיאה ביצירה' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={type === 'admins' ? 'לקוח חדש' : 'עובד חדש'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
            {errors.general}
          </div>
        )}
        <Input
          label="שם"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={loading}
        />
        <Input
          label="אימייל"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          disabled={loading}
        />
        <PasswordInput
          label="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={loading}
          hint="לפחות 8 תווים"
        />
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            ביטול
          </Button>
          <Button type="submit" variant="success" disabled={loading}>
            {loading ? 'יוצר...' : 'צור'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============ Edit User Modal ============
function EditUserModal({
  user: userItem,
  type,
  onClose,
  onUpdated,
}: {
  user: AuthUserResponse;
  type: TabType;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(userItem.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');

    try {
      if (type === 'admins') {
        await updateAdmin(userItem.id, { name });
      } else {
        await updateEmployee(userItem.id, { name });
      }
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדכון');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title="עריכת משתמש">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        <Input
          label="שם"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
        <Input
          label="אימייל"
          value={userItem.email}
          disabled
          hint="לא ניתן לשנות אימייל"
        />
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            ביטול
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============ Reset Password Modal ============
function ResetPasswordModal({
  user: userItem,
  type,
  onClose,
}: {
  user: AuthUserResponse;
  type: TabType;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('סיסמה חייבת להיות לפחות 8 תווים');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (type === 'admins') {
        await resetAdminPassword(userItem.id, { new_password: password });
      } else {
        await resetEmployeePassword(userItem.id, { new_password: password });
      }
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה באיפוס');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`איפוס סיסמה - ${userItem.name}`}>
      {success ? (
        <div className="text-center py-4">
          <div className="text-emerald-400 text-lg mb-2">הסיסמה אופסה בהצלחה</div>
          <p className="text-slate-400 text-sm">סוגר...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <PasswordInput
            label="סיסמה חדשה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            hint="לפחות 8 תווים"
          />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              ביטול
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'מאפס...' : 'אפס סיסמה'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ============ Agent Assignment Modal ============
function AgentAssignmentModal({
  admin,
  onClose,
  onUpdated,
}: {
  admin: AuthUserWithAgents;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [allAgents, setAllAgents] = useState<{ id: number; name: string }[]>([]);
  const [unassignedAgents, setUnassignedAgents] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      const [all, unassigned] = await Promise.all([
        getAgents(),
        getUnassignedAgents(),
      ]);
      setAllAgents(all.map(a => ({ id: a.id, name: a.name })));
      setUnassignedAgents(unassigned.map(a => ({ id: a.id, name: a.name })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const assignedAgents = allAgents.filter(a => admin.agent_ids.includes(a.id));

  async function handleAssign(agentId: number) {
    setActionLoading(agentId);
    try {
      await assignAgentToAdmin(admin.id, agentId);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה בשיוך');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnassign(agentId: number) {
    setActionLoading(agentId);
    try {
      await unassignAgentFromAdmin(admin.id, agentId);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה בהסרה');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Modal onClose={onClose} title={`סוכנים של ${admin.name}`} wide>
      {loading ? (
        <div className="text-center py-8 text-slate-400">טוען...</div>
      ) : (
        <div className="space-y-6">
          {/* Assigned Agents */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">סוכנים משויכים</h3>
            {assignedAgents.length === 0 ? (
              <p className="text-slate-500 text-sm">אין סוכנים משויכים</p>
            ) : (
              <div className="space-y-2">
                {assignedAgents.map(agent => (
                  <div key={agent.id} className="flex justify-between items-center bg-slate-800 rounded-lg p-3">
                    <span className="text-white">{agent.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnassign(agent.id)}
                      disabled={actionLoading === agent.id}
                      className="text-red-400 hover:text-red-300"
                    >
                      {actionLoading === agent.id ? '...' : 'הסר'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unassigned Agents */}
          {unassignedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">סוכנים זמינים לשיוך</h3>
              <div className="space-y-2">
                {unassignedAgents.map(agent => (
                  <div key={agent.id} className="flex justify-between items-center bg-slate-700/50 rounded-lg p-3">
                    <span className="text-slate-300">{agent.name}</span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAssign(agent.id)}
                      disabled={actionLoading === agent.id}
                    >
                      {actionLoading === agent.id ? '...' : 'שייך'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4">
            <Button variant="secondary" onClick={onClose}>
              סגור
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============ Modal Component ============
function Modal({ 
  children, 
  onClose, 
  title,
  wide = false,
}: { 
  children: React.ReactNode; 
  onClose: () => void; 
  title: string;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 rounded-xl shadow-xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <XIcon />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ============ Icons ============
function ArrowRightIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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

function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
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
