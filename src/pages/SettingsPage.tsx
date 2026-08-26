import type { AppNotification } from '../types';
import SettingsPanel from '../components/SettingsPanel';

interface SettingsPageProps {
  autoLockDuration: number;
  onDatabaseChanged: () => void | Promise<void>;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify: (notification: AppNotification) => void;
}

export function SettingsPage({
  autoLockDuration,
  onDatabaseChanged,
  onAutoLockDurationChange,
  onNotify,
}: SettingsPageProps) {
  return (
    <div data-testid="settings-workspace" className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
      <SettingsPanel
        onDatabaseChanged={onDatabaseChanged}
        autoLockDuration={autoLockDuration}
        onAutoLockDurationChange={onAutoLockDurationChange}
        onNotify={onNotify}
      />
    </div>
  );
}
