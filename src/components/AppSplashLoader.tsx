/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lock } from 'lucide-react';
import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';
import KalderaShieldLogo from '../../assets/KalderaShield-app-icon.png';

/*
 * Accent ramp lifted from src-tauri/icon-source/kalderashield-icon.svg
 * (ks-caldera-crest / ks-magma-glow). This component used to be emerald around
 * a Lucide ShieldCheck glyph, which matched no other icon the product ships, so
 * the splash was the first thing a user saw that was not the caldera mark.
 * Keep these classes in step with public/splash.css.
 *
 * Everything is a Tailwind arbitrary value rather than an inline style prop:
 * scripts/security-csp-no-unsafe-inline.cjs fails the build on the React style
 * attribute. The glow animation itself lives in public/splash.css, which
 * index.html loads, so its @keyframes splash-glow overrides the static shadow
 * below.
 */

export function AppSplashLoader() {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_#2b1508_0%,_#121412_70%,_#050605_100%)] text-white select-none text-center overflow-hidden">
      {/* The caldera mark. assets/KalderaShield-app-icon.png is rendered from the
          master vector by `npm run icon:apply`, the same artwork the launcher
          tile and the lock screen draw. */}
      <div className="relative flex items-center justify-center mb-8">
        <div className="w-[120px] h-[120px] rounded-[28px] flex items-center justify-center bg-[rgba(255,109,0,0.14)] border-2 border-[rgba(255,145,0,0.42)] shadow-[0_0_50px_rgba(255,77,0,0.4),inset_0_0_30px_rgba(255,77,0,0.1)] animate-[splash-glow_1.5s_ease-in-out_infinite]">
          <img
            src={KalderaShieldLogo}
            alt=""
            width={96}
            height={96}
            decoding="sync"
            className="w-24 h-24 rounded-[22px] block"
          />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[32px] font-extrabold font-display tracking-[0.08em] text-white mb-3 [text-shadow:0_0_30px_rgba(255,109,0,0.6)]">
        {APP_NAME}
      </h1>

      {/* Subtitle */}
      <p className="text-[16px] text-gray-300 font-medium tracking-[0.04em] mb-9 flex items-center justify-center gap-2">
        <Lock className="w-4 h-4 text-[#ff8a00]" />
        <span>{t('app.initializingVault')}</span>
      </p>

      {/* Progress Spinner */}
      <div className="w-[40px] h-[40px] border-[3px] border-[rgba(255,109,0,0.25)] border-t-[#ff8a00] rounded-full animate-spin shadow-[0_0_25px_rgba(255,109,0,0.3)]" />

      {/* Indeterminate Progress Bar */}
      <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 w-[280px] h-[3px] rounded-[2px] overflow-hidden bg-[rgba(255,109,0,0.1)]">
        <div className="w-[30%] h-full rounded-[1px] animate-[progress-indeterminate_1.2s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,#ff8a00,transparent)] shadow-[0_0_12px_rgba(255,109,0,0.6)]" />
      </div>
    </div>
  );
}