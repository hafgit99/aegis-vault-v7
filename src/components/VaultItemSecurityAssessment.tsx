interface VaultItemSecurityAssessmentProps {
  score: number;
  onOpenAudit: () => void;
}

function getToneClass(score: number): string {
  if (score >= 85) return 'text-brand-tertiary';
  if (score >= 50) return 'text-brand-secondary';
  return 'text-brand-error';
}

function getBorderClass(score: number): string {
  if (score >= 85) return 'border-l-brand-tertiary';
  if (score >= 50) return 'border-l-brand-secondary';
  return 'border-l-brand-error';
}

function getButtonClass(score: number): string {
  if (score >= 85) return 'bg-brand-tertiary/15 text-brand-tertiary hover:bg-brand-tertiary/20';
  if (score >= 50) return 'bg-brand-secondary/15 text-brand-secondary hover:bg-brand-secondary/20';
  return 'bg-brand-error/15 text-brand-error hover:bg-brand-error/20 animate-pulse';
}

function getDescription(score: number): string {
  if (score >= 85) {
    return 'Muazzam güç. Bu parolanın siber saldırılarla ele geçirilmesi neredeyse imkansızdır.';
  }
  if (score >= 50) {
    return 'Güçlü yapıda, fakat semboller veya uzunluk artırılarak askeri aşamaya taşınabilir.';
  }
  return 'Kritik derecede zayıf veya kısa parola! En kısa sürede Şifre Üretici ile değiştirin.';
}

export default function VaultItemSecurityAssessment({ score, onOpenAudit }: VaultItemSecurityAssessmentProps) {
  const toneClass = getToneClass(score);

  return (
    <div
      className={`glass-panel p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border-l-4 ${getBorderClass(score)}`}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-[#1e201e] stroke-current"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeWidth="3"
            ></path>
            <path
              className={`${toneClass} stroke-current`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeDasharray={`${score}, 100`}
              strokeLinecap="round"
              strokeWidth="3"
            ></path>
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-xs truncate ${toneClass}`}>
            %{score}
          </div>
        </div>
        <div>
          <h4 className="font-bold text-sm text-on-surface">Güvenlik Değerlendirmesi</h4>
          <p className="text-on-surface-variant text-[11px] mt-0.5">{getDescription(score)}</p>
        </div>
      </div>
      <button onClick={onOpenAudit} className={`text-xs font-bold px-3 py-2 rounded-lg shrink-0 ${getButtonClass(score)}`}>
        Tümünü Denetle
      </button>
    </div>
  );
}
