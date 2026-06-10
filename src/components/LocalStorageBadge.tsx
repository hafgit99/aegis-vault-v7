import { Shield } from 'lucide-react';

export default function LocalStorageBadge() {
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-full">
      <Shield className="text-brand-tertiary w-3.5 h-3.5 fill-brand-tertiary" />
      <span className="font-display font-bold text-[9px] text-brand-tertiary uppercase tracking-wider">
        LOCAL STORAGE ONLY
      </span>
    </div>
  );
}
