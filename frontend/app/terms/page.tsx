import { TermsContent } from '@/components/ui/LegalModals';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-xl p-8 text-gray-300 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold text-white mb-6">Terms of Service</h1>
        <TermsContent />
      </div>
    </div>
  );
}
