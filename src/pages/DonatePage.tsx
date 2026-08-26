import DonationPanel from '../components/DonationPanel';

interface DonatePageProps {
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

export function DonatePage({ copiedField, onCopyText }: DonatePageProps) {
  return (
    <div data-testid="donate-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
      <DonationPanel copiedField={copiedField} onCopyText={onCopyText} />
    </div>
  );
}
