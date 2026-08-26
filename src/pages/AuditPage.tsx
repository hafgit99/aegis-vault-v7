import type { VaultItem } from '../types';
import SecurityAudit from '../components/SecurityAudit';

interface AuditPageProps {
  activeItems: VaultItem[];
  onSelectAuditItem: (item: VaultItem) => void;
}

export function AuditPage({ activeItems, onSelectAuditItem }: AuditPageProps) {
  return (
    <div data-testid="audit-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
      <SecurityAudit items={activeItems} onSelectItem={onSelectAuditItem} />
    </div>
  );
}
