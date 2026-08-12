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
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#121412] text-[#e2e3df] select-none">
      {/* Animated Glowing Shield Logo */}
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute inset-0 rounded-2xl bg-brand-primary/20 blur-xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center shadow-2xl shadow-brand-primary/20 backdrop-blur-md">
          <ShieldCheck className="w-9 h-9 text-brand-primary animate-bounce-subtle" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold font-display tracking-wider text-neutral-100 mb-1.5 flex items-center gap-2">
        <span>{APP_NAME}</span>
      </h1>
      
      <p className="text-xs text-neutral-400 font-medium tracking-wide mb-6 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 text-brand-primary/80" />
        <span>{t('app.initializingVault')}</span>
      </p>

      {/* Progress Spinner */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
      </div>
    </div>
  );
}
