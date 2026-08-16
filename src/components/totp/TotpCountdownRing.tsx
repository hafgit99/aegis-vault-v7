/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface TotpCountdownRingProps {
  secondsLeft: number;
  totalDuration?: number;
  size?: number;
}

export function TotpCountdownRing({
  secondsLeft,
  totalDuration = 30,
  size = 20,
}: TotpCountdownRingProps) {
  const { t } = useLanguage();
  const clampedSeconds = Math.max(0, Math.min(secondsLeft, totalDuration));
  const isUrgent = clampedSeconds <= 5;

  const strokeWidth = 2.5;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedSeconds / totalDuration) * circumference;

  return (
    <div
      data-testid="totp-countdown-ring"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all duration-300 select-none ${
        isUrgent
          ? 'bg-red-500/15 border-red-500/40 text-red-400 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.25)]'
          : 'bg-[#141614] border-outline-variant/15 text-on-surface-variant'
      }`}
      title={`${clampedSeconds} ${t('loginDetail.secondsLeft')}`}
    >
      {/* SVG Radial Progress Ring */}
      <svg
        width={size}
        height={size}
        className="-rotate-90 shrink-0"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background Track Circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        {/* Animated Progress Circle */}
        <circle
          data-testid="totp-ring-circle"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isUrgent ? '#ef4444' : '#00ffb2'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>

      {/* Countdown Text Indicator */}
      <span
        data-testid="totp-countdown-text"
        className={`font-mono text-xs font-bold leading-none ${
          isUrgent ? 'text-red-400' : 'text-on-surface-variant'
        }`}
      >
        {clampedSeconds} {t('loginDetail.secondsLeft')}
      </span>
    </div>
  );
}
