import { AlertTriangle } from 'lucide-react';

export default function TrashInfoBanner() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex gap-3 text-xs text-yellow-400">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div>
        <p className="font-bold mb-1">Güvenlik ve Veri Koruma Bilgilendirmesi</p>
        <p className="leading-relaxed opacity-90">
          Sistemimiz local-first mimariyi esas alır. Şifre kayıtlarınızı yanlışlıkla sildiğinizde kaybetmemeniz
          için verileriniz geçici olarak şifreli yerel çöp kutusuna taşınır. Çöp kutusundaki öğeler cihazınızda
          saklanır, dilediğiniz an geri yükleyebilir veya hemen kalıcı olarak silebilirsiniz.
        </p>
      </div>
    </div>
  );
}
