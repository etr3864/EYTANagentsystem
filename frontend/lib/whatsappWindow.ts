import type { WhatsAppTemplate } from '@/lib/types';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function customerWindowOpen(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < WINDOW_MS;
}

export function templateComponents(tpl: WhatsAppTemplate): Record<string, unknown>[] {
  return Array.isArray(tpl.components) ? tpl.components : [];
}

export function templateBodyText(tpl: WhatsAppTemplate): string {
  const body = templateComponents(tpl).find(c => String(c.type).toUpperCase() === 'BODY');
  return typeof body?.text === 'string' ? body.text : '';
}

export function templateFooterText(tpl: WhatsAppTemplate): string {
  const footer = templateComponents(tpl).find(c => String(c.type).toUpperCase() === 'FOOTER');
  return typeof footer?.text === 'string' ? footer.text : '';
}

export function templateVarCount(tpl: WhatsAppTemplate): number {
  const nums = [...templateBodyText(tpl).matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function templateHeaderFormat(tpl: WhatsAppTemplate): string {
  const header = templateComponents(tpl).find(c => String(c.type).toUpperCase() === 'HEADER');
  return typeof header?.format === 'string' ? header.format.toUpperCase() : 'NONE';
}

export function fillTemplateBody(tpl: WhatsAppTemplate, params: string[]): string {
  let text = templateBodyText(tpl);
  params.forEach((val, i) => {
    text = text.split(`{{${i + 1}}}`).join(val || `{{${i + 1}}}`);
  });
  return text;
}
