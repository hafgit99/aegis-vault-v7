import { Fingerprint } from 'lucide-react';

export default function CryptoShieldPanel() {
  return (
    <div className="bg-[#101210]/60 border border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#059669] flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-brand-primary animate-pulse" />
            <span>Kriptoloji Kalkanı Bilgileri</span>
          </h3>
          <span className="text-[10px] text-on-surface-variant font-mono">Status: Active</span>
        </div>
        <div className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">Şifreleme Motoru</span>
            <span className="font-mono text-[10px] text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded border border-brand-primary/25 font-bold">
              AES-256-GCM (Yerel)
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">İstemci Güvenliği</span>
            <span className="font-mono text-[10px] text-brand-tertiary bg-[#059669]/10 px-2.5 py-0.5 rounded border border-brand-tertiary/25 font-bold">
              Zero-Knowledge (Tümleşik)
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">Mekanik Hash Derinliği</span>
            <span className="font-mono text-[10px] text-brand-secondary bg-brand-secondary/10 px-2.5 py-0.5 rounded border border-brand-secondary/25 font-bold">
              100.000 İterasyon
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-on-surface">Güvenlik Durumu</span>
            <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/25 uppercase tracking-wider">
              Aegis Kalkanı Koruyor
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
