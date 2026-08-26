import PasswordGenerator from '../components/PasswordGenerator';

interface GeneratorPageProps {
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

export function GeneratorPage({ copiedField, onCopyText }: GeneratorPageProps) {
  return (
    <div data-testid="generator-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
      <PasswordGenerator onCopyText={onCopyText} copiedField={copiedField} />
    </div>
  );
}
