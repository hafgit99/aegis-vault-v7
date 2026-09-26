/**
 * @file OnboardingTour.tsx
 * @description Interactive 4-step quick start checklist for new Aegis Vault users.
 *
 * @license Apache-2.0
 */

import { Check, CheckCircle2, Compass, ExternalLink, FileText, KeyRound, ShieldCheck, X } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { ProgressFill } from './ui/ProgressFill';
import type { UseOnboardingTourResult } from '../hooks/useOnboardingTour';

interface OnboardingTourProps {
  tour: UseOnboardingTourResult;
  onNewItem: () => void;
  onNavigate: (tab: 'vault' | 'audit' | 'settings') => void;
}

export default function OnboardingTour({ tour, onNewItem, onNavigate }: OnboardingTourProps) {
  const { t } = useLanguage();
  const { isVisible, completedCount, totalSteps, steps, dismissTour, markStepComplete } = tour;

  if (!isVisible) {
    return null;
  }

  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const handleStep2Click = () => {
    markStepComplete(2);
    // Link or guide to browser extension
    window.open('https://github.com/hafgit99/aegis-vault-v7#browser-extension', '_blank', 'noopener,noreferrer');
  };

  const handleStep3Click = () => {
    markStepComplete(3);
    onNavigate('settings');
  };

  const handleStep4Click = () => {
    markStepComplete(4);
    onNavigate('audit');
  };

  return (
    <div
      data-testid="onboarding-tour-panel"
      className="mx-3 sm:mx-6 my-3 p-4 sm:p-5 rounded-2xl border border-brand-primary/25 bg-surface-high/90 backdrop-blur-md shadow-xl text-left animate-in fade-in-50 duration-300"
    >
      {/* Header with Title, Progress, and Dismiss */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/15">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center text-brand-primary">
              <Compass className="w-4 h-4" />
            </span>
            <h3 className="font-display font-bold text-sm sm:text-base text-on-surface">
              {t('onboarding.tourTitle')}
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant font-medium">
            {t('onboarding.tourProgress', { completed: completedCount, total: totalSteps })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-28 sm:w-36 h-2 bg-surface-low rounded-full overflow-hidden border border-outline-variant/20">
            <ProgressFill
              data-testid="tour-progress-bar"
              className="h-full bg-brand-tertiary transition-all duration-500 rounded-full"
              percent={progressPercent}
            />
          </div>

          <button
            type="button"
            data-testid="tour-dismiss-button"
            onClick={dismissTour}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-low rounded-lg transition-colors cursor-pointer"
            title={t('onboarding.dismiss')}
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('onboarding.dismiss')}</span>
          </button>
        </div>
      </div>

      {/* 4 Steps Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3.5">
        {/* Step 1: Add first item */}
        <div
          data-testid="tour-step-1"
          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
            steps[0]?.isComplete
              ? 'bg-surface-low/50 border-brand-tertiary/20'
              : 'bg-surface-container/70 border-brand-primary/20 hover:border-brand-primary/40'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-lg bg-surface-high flex items-center justify-center text-brand-primary">
                <KeyRound className="w-3.5 h-3.5" />
              </div>
              {steps[0]?.isComplete ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-tertiary bg-brand-tertiary/10 px-2 py-0.5 rounded-full border border-brand-tertiary/20">
                  <Check className="w-3 h-3" />
                  <span>1</span>
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary text-[10px] font-bold flex items-center justify-center">
                  1
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-on-surface">{t('onboarding.step1.title')}</h4>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              {t('onboarding.step1.desc')}
            </p>
          </div>

          <button
            type="button"
            data-testid="tour-step-1-action"
            onClick={onNewItem}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              steps[0]?.isComplete
                ? 'bg-surface-high text-on-surface-variant hover:text-on-surface'
                : 'bg-brand-primary text-surface-lowest hover:bg-brand-primary/90 shadow-sm'
            }`}
          >
            {steps[0]?.isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                <span>{t('onboarding.step1.action')}</span>
              </>
            ) : (
              <span>{t('onboarding.step1.action')}</span>
            )}
          </button>
        </div>

        {/* Step 2: Browser extension */}
        <div
          data-testid="tour-step-2"
          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
            steps[1]?.isComplete
              ? 'bg-surface-low/50 border-brand-tertiary/20'
              : 'bg-surface-container/70 border-brand-primary/20 hover:border-brand-primary/40'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-lg bg-surface-high flex items-center justify-center text-brand-primary">
                <Compass className="w-3.5 h-3.5" />
              </div>
              {steps[1]?.isComplete ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-tertiary bg-brand-tertiary/10 px-2 py-0.5 rounded-full border border-brand-tertiary/20">
                  <Check className="w-3 h-3" />
                  <span>2</span>
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary text-[10px] font-bold flex items-center justify-center">
                  2
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-on-surface">{t('onboarding.step2.title')}</h4>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              {t('onboarding.step2.desc')}
            </p>
          </div>

          <button
            type="button"
            data-testid="tour-step-2-action"
            onClick={handleStep2Click}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              steps[1]?.isComplete
                ? 'bg-surface-high text-on-surface-variant hover:text-on-surface'
                : 'bg-brand-primary text-surface-lowest hover:bg-brand-primary/90 shadow-sm'
            }`}
          >
            {steps[1]?.isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                <span>{t('onboarding.step2.action')}</span>
              </>
            ) : (
              <>
                <span>{t('onboarding.step2.action')}</span>
                <ExternalLink className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

        {/* Step 3: Emergency Kit */}
        <div
          data-testid="tour-step-3"
          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
            steps[2]?.isComplete
              ? 'bg-surface-low/50 border-brand-tertiary/20'
              : 'bg-surface-container/70 border-brand-primary/20 hover:border-brand-primary/40'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-lg bg-surface-high flex items-center justify-center text-brand-primary">
                <FileText className="w-3.5 h-3.5" />
              </div>
              {steps[2]?.isComplete ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-tertiary bg-brand-tertiary/10 px-2 py-0.5 rounded-full border border-brand-tertiary/20">
                  <Check className="w-3 h-3" />
                  <span>3</span>
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary text-[10px] font-bold flex items-center justify-center">
                  3
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-on-surface">{t('onboarding.step3.title')}</h4>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              {t('onboarding.step3.desc')}
            </p>
          </div>

          <button
            type="button"
            data-testid="tour-step-3-action"
            onClick={handleStep3Click}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              steps[2]?.isComplete
                ? 'bg-surface-high text-on-surface-variant hover:text-on-surface'
                : 'bg-brand-primary text-surface-lowest hover:bg-brand-primary/90 shadow-sm'
            }`}
          >
            {steps[2]?.isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                <span>{t('onboarding.step3.action')}</span>
              </>
            ) : (
              <span>{t('onboarding.step3.action')}</span>
            )}
          </button>
        </div>

        {/* Step 4: Security Audit */}
        <div
          data-testid="tour-step-4"
          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
            steps[3]?.isComplete
              ? 'bg-surface-low/50 border-brand-tertiary/20'
              : 'bg-surface-container/70 border-brand-primary/20 hover:border-brand-primary/40'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-lg bg-surface-high flex items-center justify-center text-brand-primary">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              {steps[3]?.isComplete ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-tertiary bg-brand-tertiary/10 px-2 py-0.5 rounded-full border border-brand-tertiary/20">
                  <Check className="w-3 h-3" />
                  <span>4</span>
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/25 text-brand-primary text-[10px] font-bold flex items-center justify-center">
                  4
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-on-surface">{t('onboarding.step4.title')}</h4>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              {t('onboarding.step4.desc')}
            </p>
          </div>

          <button
            type="button"
            data-testid="tour-step-4-action"
            onClick={handleStep4Click}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              steps[3]?.isComplete
                ? 'bg-surface-high text-on-surface-variant hover:text-on-surface'
                : 'bg-brand-primary text-surface-lowest hover:bg-brand-primary/90 shadow-sm'
            }`}
          >
            {steps[3]?.isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-tertiary" />
                <span>{t('onboarding.step4.action')}</span>
              </>
            ) : (
              <span>{t('onboarding.step4.action')}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
