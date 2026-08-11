import React from 'react';
import { Check, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PrivacyShieldBackdropProps {
  visible: boolean;
  screenRecordingDetected: boolean;
}

export const PrivacyShieldBackdrop: React.FC<PrivacyShieldBackdropProps> = ({
  visible,
  screenRecordingDetected,
}) => {
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#080a09] text-[#e2e3df]"
    >
      <div className="text-center px-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[#84cc16]/40 bg-[#172012]">
          {screenRecordingDetected ? (
            <ShieldAlert size={24} className="text-red-500 animate-pulse" />
          ) : (
            <Check size={24} className="text-[#a3e635]" />
          )}
        </div>
        <p className="text-sm font-semibold tracking-[0.18em] uppercase">Aegis Vault</p>
        <p className="mt-2 text-xs text-[#aeb5aa]">
          {screenRecordingDetected
            ? t('security.screenCaptureDetected')
            : 'Secure display shield active'}
        </p>
      </div>
    </div>
  );
};
