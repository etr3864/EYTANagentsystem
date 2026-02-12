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
                <ArrowRightIcon className="w-5 h-5" />
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

// ============ Export with Auth Guard ============
export default function UsersPageWrapper() {
  return (
    <AuthGuard allowedRoles={['super_admin', 'admin']}>
      <UsersPage />
    </AuthGuard>
  );
}
