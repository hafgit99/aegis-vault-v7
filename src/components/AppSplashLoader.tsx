/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';

export function AppSplashLoader() {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_#1a2e1a_0%,_#121412_70%,_#050605_100%)] text-white select-none text-center overflow-hidden">
      {/* Animated Glowing Shield Logo */}
      <div className="relative flex items-center justify-center mb-8">
        <div className="w-[120px] h-[120px] rounded-[28px] bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.4),_inset_0_0_30px_rgba(34,197,94,0.1)] animate-[splash-glow_1.5s_ease-in-out_infinite]">
          <ShieldCheck className="w-[64px] h-[64px] text-emerald-400 stroke-[2.5]" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[32px] font-extrabold font-display tracking-[0.08em] text-white mb-3 drop-shadow-[0_0_30px_rgba(34,197,94,0.6)]">
        {APP_NAME}
      </h1>

      {/* Subtitle */}
      <p className="text-[16px] text-gray-300 font-medium tracking-[0.04em] mb-9 flex items-center justify-center gap-2">
        <Lock className="w-4 h-4 text-emerald-400" />
        <span>{t('app.initializingVault')}</span>
      </p>

      {/* Progress Spinner */}
      <div className="w-[40px] h-[40px] border-[3px] border-emerald-500/25 border-t-emerald-400 rounded-full animate-spin shadow-[0_0_25px_rgba(34,197,94,0.3)]" />

      {/* Indeterminate Progress Bar */}
      <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 w-[280px] h-[3px] bg-emerald-500/10 rounded-[2px] overflow-hidden">
        <div className="w-[30%] h-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-[1px] animate-[progress-indeterminate_1.2s_ease-in-out_infinite] shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
      </div>
    </div>
  );
}

