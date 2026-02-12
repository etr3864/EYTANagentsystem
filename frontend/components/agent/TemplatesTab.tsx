'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui';
import { getTemplates, syncTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/api';
import type { WhatsAppTemplate, TemplateCategory, TemplateStatus } from '@/lib/types';
import { TemplateBuilder } from './TemplateBuilder';

interface TemplatesTabProps {
  agentId: number;
}

type View = 'list' | 'create' | 'edit';

const CATEGORY_LABELS: Record<TemplateCategory, { label: string; emoji: string; color: string }> = {
  MARKETING: { label: 'שיווקי', emoji: '📣', color: 'pink' },
  UTILITY: { label: 'שירותי', emoji: '⚙️', color: 'blue' },
  AUTHENTICATION: { label: 'אימות', emoji: '🔐', color: 'green' },
};

const STATUS_CONFIG: Record<TemplateStatus, { label: string; icon: string; color: string }> = {
  APPROVED: { label: 'מאושר', icon: '✓', color: 'emerald' },
  PENDING: { label: 'ממתין', icon: '⏳', color: 'yellow' },
  REJECTED: { label: 'נדחה', icon: '✕', color: 'red' },
  PAUSED: { label: 'מושהה', icon: '⏸', color: 'slate' },
};

export function TemplatesTab({ agentId }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<TemplateCategory | 'ALL'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await getTemplates(agentId);
      setTemplates(data);
    } catch {
      setError('שגיאה בטעינת templates');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncTemplates(agentId);
      await loadTemplates();
      showToast(`סונכרנו ${result.synced} templates`, 'success');
    } catch {
      showToast('שגיאה בסנכרון', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (tmpl: WhatsAppTemplate) => {
    if (!confirm(`למחוק את "${tmpl.name}"?`)) return;
    try {
      await deleteTemplate(agentId, tmpl.id);
      setTemplates(prev => prev.filter(t => t.id !== tmpl.id));
      showToast('נמחק בהצלחה', 'success');
    } catch {
      showToast('שגיאה במחיקה', 'error');
    }
  };

  const handleCreate = async (data: { name: string; language: string; category: string; components: Record<string, unknown>[] }) => {
    const tmpl = await createTemplate(agentId, data);
    setTemplates(prev => [tmpl, ...prev]);
    setView('list');
    showToast('Template נשלח לאישור Meta', 'success');
  };

  const handleUpdate = async (components: Record<string, unknown>[]) => {
    if (!editingTemplate) return;
    const updated = await updateTemplate(agentId, editingTemplate.id, { components });
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
    setView('list');
    setEditingTemplate(null);
    showToast('Template עודכן ונשלח לבדיקה מחדש', 'success');
  };

  const startEdit = (tmpl: WhatsAppTemplate) => {
    setEditingTemplate(tmpl);
    setView('edit');
  };

  // Stats
  const stats = {
    total: templates.length,
    approved: templates.filter(t => t.status === 'APPROVED').length,
    pending: templates.filter(t => t.status === 'PENDING').length,
    rejected: templates.filter(t => t.status === 'REJECTED').length,
  };

  const filtered = filterCategory === 'ALL' ? templates : templates.filter(t => t.category === filterCategory);

  if (loading) return <div className="text-slate-400 text-center py-12">טוען...</div>;
  if (error) return <div className="text-red-400 text-center py-12">{error}</div>;

  return (
    <div className="space-y-6 relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-down
          ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-green-500">WhatsApp</span> ניהול Templates
          </h2>
          <p className="text-sm text-slate-400 mt-1">יצירה, מעקב ואישור תבניות WhatsApp Business API</p>
        </div>
        <div className="flex gap-2">
          {view === 'list' ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm"
              >
                <span className={syncing ? 'animate-spin' : ''}>⟳</span>
                רענן סטטוסים
              </button>
              <button
                onClick={() => setView('create')}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium transition-colors text-sm"
              >
                + Template חדש
              </button>
            </>
          ) : (
            <button
              onClick={() => { setView('list'); setEditingTemplate(null); }}
              className="px-4 py-2 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors text-sm"
            >
              ← חזרה לרשימה
            </button>
          )}
        </div>
      </div>

      {/* Builder View */}
      {(view === 'create' || view === 'edit') && (
        <TemplateBuilder
          onSubmit={view === 'create' ? handleCreate : (data: { name: string; language: string; category: string; components: Record<string, unknown>[] }) => handleUpdate(data.components)}
          initialData={view === 'edit' && editingTemplate ? editingTemplate : undefined}
          isEdit={view === 'edit'}
        />
      )}

      {/* List View */}
      {view === 'list' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="סה״כ" value={stats.total} color="slate" />
            <StatCard label="מאושר" value={stats.approved} color="emerald" />
            <StatCard label="ממתין" value={stats.pending} color="yellow" />
            <StatCard label="נדחה" value={stats.rejected} color="red" />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <FilterChip
              active={filterCategory === 'ALL'}
              onClick={() => setFilterCategory('ALL')}
              label={`הכל (${templates.length})`}
            />
            {(Object.entries(CATEGORY_LABELS) as [TemplateCategory, typeof CATEGORY_LABELS[TemplateCategory]][]).map(([key, cfg]) => {
              const count = templates.filter(t => t.category === key).length;
              return (
                <FilterChip
                  key={key}
                  active={filterCategory === key}
                  onClick={() => setFilterCategory(key)}
                  label={`${cfg.emoji} ${cfg.label} (${count})`}
                  color={cfg.color}
                />
              );
            })}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <Card className="text-center py-12 text-slate-400">
              {templates.length === 0 ? 'אין templates. לחץ "רענן סטטוסים" לסנכרן מ-Meta או צור חדש.' : 'אין תוצאות לפילטר הנבחר.'}
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-right py-3 px-3 font-medium">שם</th>
                    <th className="text-right py-3 px-3 font-medium">קטגוריה</th>
                    <th className="text-right py-3 px-3 font-medium">סטטוס</th>
                    <th className="text-right py-3 px-3 font-medium">שפה</th>
                    <th className="text-right py-3 px-3 font-medium">תוכן</th>
                    <th className="text-right py-3 px-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tmpl => (
                    <TemplateRow
                      key={tmpl.id}
                      template={tmpl}
                      onEdit={() => startEdit(tmpl)}
                      onDelete={() => handleDelete(tmpl)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ============ Sub-components ============

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-300 border-slate-700',
    emerald: 'text-emerald-400 border-emerald-800',
    yellow: 'text-yellow-400 border-yellow-800',
    red: 'text-red-400 border-red-800',
  };
  return (
    <div className={`bg-slate-800/40 border rounded-lg p-4 text-center ${colorMap[color] || colorMap.slate}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  const activeColors: Record<string, string> = {
    pink: 'bg-pink-500/20 border-pink-500 text-pink-300',
    blue: 'bg-blue-500/20 border-blue-500 text-blue-300',
    green: 'bg-emerald-500/20 border-emerald-500 text-emerald-300',
  };
  const activeClass = color && activeColors[color] ? activeColors[color] : 'bg-slate-600/40 border-slate-500 text-white';

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
        active ? activeClass : 'border-slate-700 text-slate-400 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function TemplateRow({ template: t, onEdit, onDelete }: { template: WhatsAppTemplate; onEdit: () => void; onDelete: () => void }) {
  const cat = CATEGORY_LABELS[t.category] || CATEGORY_LABELS.UTILITY;
  const status = STATUS_CONFIG[t.status] || STATUS_CONFIG.PENDING;
  const bodyComponent = t.components.find((c: any) => c.type === 'BODY') as any;
  const bodyText = bodyComponent?.text || '';

  const catColorMap: Record<string, string> = {
    pink: 'bg-pink-500/10 text-pink-400',
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-400',
  };
  const statusColorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    red: 'bg-red-500/10 text-red-400',
    slate: 'bg-slate-500/10 text-slate-400',
  };

  const canEdit = t.status !== 'PENDING';

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="py-3 px-3">
        <code className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-200">{t.name}</code>
      </td>
      <td className="py-3 px-3">
        <span className={`text-xs px-2 py-1 rounded ${catColorMap[cat.color] || ''}`}>
          {cat.emoji} {cat.label}
        </span>
      </td>
      <td className="py-3 px-3">
        <span className={`text-xs px-2 py-1 rounded ${statusColorMap[status.color] || ''}`}>
          {status.icon} {status.label}
        </span>
        {t.status === 'REJECTED' && t.reject_reason && (
          <div className="text-xs text-red-400 mt-1 max-w-[200px] truncate" title={t.reject_reason}>
            {t.reject_reason}
          </div>
        )}
      </td>
      <td className="py-3 px-3 text-slate-400 text-xs">{t.language}</td>
      <td className="py-3 px-3">
        <span className="text-xs text-slate-300 max-w-[250px] truncate block">{bodyText}</span>
      </td>
      <td className="py-3 px-3">
        <div className="flex gap-1">
          {canEdit && (
            <button onClick={onEdit} className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-colors">
              עריכה
            </button>
          )}
          <button onClick={onDelete} className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors">
            מחיקה
          </button>
        </div>
      </td>
    </tr>
  );
}
