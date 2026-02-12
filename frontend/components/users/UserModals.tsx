'use client';

import { useState, useEffect } from 'react';
import { Button, Input, PasswordInput, Modal } from '@/components/ui';
import {
  createAdmin, updateAdmin, resetAdminPassword,
  createEmployee, updateEmployee, resetEmployeePassword,
  getAgents, assignAgentToAdmin, unassignAgentFromAdmin, getUnassignedAgents,
  AuthUserResponse, AuthUserWithAgents,
} from '@/lib/api';

type TabType = 'admins' | 'employees';

// ─── Create ─────────────────────────────────────────────
export function CreateUserModal({ type, onClose, onCreated }: {
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
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'נא להזין שם';
    if (!email.trim()) newErrors.email = 'נא להזין אימייל';
    if (!password || password.length < 8) newErrors.password = 'סיסמה חייבת להיות לפחות 8 תווים';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setLoading(true);
    setErrors({});
    try {
      if (type === 'admins') await createAdmin({ name, email, password });
      else await createEmployee({ name, email, password });
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
        <Input label="שם" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} disabled={loading} />
        <Input label="אימייל" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} disabled={loading} />
        <PasswordInput label="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} disabled={loading} hint="לפחות 8 תווים" />
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>ביטול</Button>
          <Button type="submit" variant="success" disabled={loading}>{loading ? 'יוצר...' : 'צור'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit ───────────────────────────────────────────────
export function EditUserModal({ user: userItem, type, onClose, onUpdated }: {
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
      if (type === 'admins') await updateAdmin(userItem.id, { name });
      else await updateEmployee(userItem.id, { name });
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
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <Input label="שם" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
        <Input label="אימייל" value={userItem.email} disabled hint="לא ניתן לשנות אימייל" />
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>ביטול</Button>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'שומר...' : 'שמור'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reset Password ─────────────────────────────────────
export function ResetPasswordModal({ user: userItem, type, onClose }: {
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
    if (password.length < 8) { setError('סיסמה חייבת להיות לפחות 8 תווים'); return; }
    setLoading(true);
    setError('');
    try {
      if (type === 'admins') await resetAdminPassword(userItem.id, { new_password: password });
      else await resetEmployeePassword(userItem.id, { new_password: password });
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
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <PasswordInput label="סיסמה חדשה" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} hint="לפחות 8 תווים" />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>ביטול</Button>
            <Button type="submit" variant="primary" disabled={loading}>{loading ? 'מאפס...' : 'אפס סיסמה'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Agent Assignment ───────────────────────────────────
export function AgentAssignmentModal({ admin, onClose, onUpdated }: {
  admin: AuthUserWithAgents;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [allAgents, setAllAgents] = useState<{ id: number; name: string }[]>([]);
  const [unassignedAgents, setUnassignedAgents] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => { loadAgents(); }, []);

  async function loadAgents() {
    try {
      const [all, unassigned] = await Promise.all([getAgents(), getUnassignedAgents()]);
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
    try { await assignAgentToAdmin(admin.id, agentId); onUpdated(); }
    catch (e) { alert(e instanceof Error ? e.message : 'שגיאה בשיוך'); }
    finally { setActionLoading(null); }
  }

  async function handleUnassign(agentId: number) {
    setActionLoading(agentId);
    try { await unassignAgentFromAdmin(admin.id, agentId); onUpdated(); }
    catch (e) { alert(e instanceof Error ? e.message : 'שגיאה בהסרה'); }
    finally { setActionLoading(null); }
  }

  return (
    <Modal onClose={onClose} title={`סוכנים של ${admin.name}`} wide>
      {loading ? (
        <div className="text-center py-8 text-slate-400">טוען...</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">סוכנים משויכים</h3>
            {assignedAgents.length === 0 ? (
              <p className="text-slate-500 text-sm">אין סוכנים משויכים</p>
            ) : (
              <div className="space-y-2">
                {assignedAgents.map(agent => (
                  <div key={agent.id} className="flex justify-between items-center bg-slate-800 rounded-lg p-3">
                    <span className="text-white">{agent.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleUnassign(agent.id)} disabled={actionLoading === agent.id} className="text-red-400 hover:text-red-300">
                      {actionLoading === agent.id ? '...' : 'הסר'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {unassignedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">סוכנים זמינים לשיוך</h3>
              <div className="space-y-2">
                {unassignedAgents.map(agent => (
                  <div key={agent.id} className="flex justify-between items-center bg-slate-700/50 rounded-lg p-3">
                    <span className="text-slate-300">{agent.name}</span>
                    <Button variant="primary" size="sm" onClick={() => handleAssign(agent.id)} disabled={actionLoading === agent.id}>
                      {actionLoading === agent.id ? '...' : 'שייך'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4">
            <Button variant="secondary" onClick={onClose}>סגור</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
