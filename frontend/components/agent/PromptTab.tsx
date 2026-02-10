'use client';

import { Button, Card, CardHeader } from '@/components/ui';
import { Textarea } from '@/components/ui/Input';

interface PromptTabProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}

export function PromptTab({ value, onChange, onSave, saving }: PromptTabProps) {
  const charCount = value.length;
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <Card>
      <CardHeader action={
        <div className="text-xs text-slate-500">
          {charCount} תווים • {wordCount} מילים
        </div>
      }>
        🎯 System Prompt
      </CardHeader>
      
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          הגדר את האופי והתפקיד של הסוכן. הפרומפט הזה יתווסף לכל שיחה.
        </p>
        
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-h-[300px] font-mono text-sm"
          dir="rtl"
          placeholder="לדוגמה: אתה נציג שירות לקוחות מקצועי ואדיב..."
        />

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            💡 טיפ: כתוב הנחיות ברורות ותן דוגמאות לתגובות רצויות
          </div>
          <Button 
            onClick={onSave} 
            disabled={saving} 
            loading={saving}
            variant="success"
          >
            שמור שינויים
          </Button>
        </div>
      </div>
    </Card>
  );
}
