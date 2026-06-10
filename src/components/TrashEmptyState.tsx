import { Trash2 } from 'lucide-react';

export default function TrashEmptyState() {
  return (
    <div className="bg-[#161816]/30 border border-outline-variant/10 rounded-2xl p-12 text-center text-on-surface-variant/40">
      <div className="w-16 h-16 rounded-2xl bg-surface-high border border-outline-variant/20 flex items-center justify-center mx-auto mb-4 text-on-surface-variant/30">
        <Trash2 className="w-8 h-8" />
      </div>
      <h3 className="font-bold text-sm text-on-surface">Çöp Kutusu Boş</h3>
      <p className="text-xs max-w-sm mx-auto mt-1">
        Şu anda çöp kutusunda bekleyen silinmiş herhangi bir parola veya kart kaydı bulunmuyor.
      </p>
    </div>
  );
}
