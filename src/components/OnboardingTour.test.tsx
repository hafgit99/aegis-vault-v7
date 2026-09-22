/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import OnboardingTour from './OnboardingTour';
import type { UseOnboardingTourResult } from '../hooks/useOnboardingTour';

const mockTour: UseOnboardingTourResult = {
  isVisible: true,
  completedCount: 1,
  totalSteps: 4,
  steps: [
    { id: 1, isComplete: true },
    { id: 2, isComplete: false },
    { id: 3, isComplete: false },
    { id: 4, isComplete: false },
  ],
  dismissTour: vi.fn(),
  markStepComplete: vi.fn(),
  resetTour: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OnboardingTour', () => {
  it('does not render when isVisible is false', () => {
    render(
      <OnboardingTour
        tour={{ ...mockTour, isVisible: false }}
        onNewItem={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('onboarding-tour-panel')).toBeNull();
  });

  it('renders all 4 steps and header information', () => {
    render(
      <LanguageProvider>
        <OnboardingTour
          tour={mockTour}
          onNewItem={vi.fn()}
          onNavigate={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('onboarding-tour-panel')).toBeTruthy();
    expect(screen.getByText('Aegis Vault Hızlı Başlangıç Rehberi')).toBeTruthy();
    expect(screen.getByTestId('tour-step-1')).toBeTruthy();
    expect(screen.getByTestId('tour-step-2')).toBeTruthy();
    expect(screen.getByTestId('tour-step-3')).toBeTruthy();
    expect(screen.getByTestId('tour-step-4')).toBeTruthy();
  });

  it('triggers onNewItem when step 1 action is clicked', () => {
    const onNewItem = vi.fn();
    render(
      <LanguageProvider>
        <OnboardingTour
          tour={mockTour}
          onNewItem={onNewItem}
          onNavigate={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('tour-step-1-action'));
    expect(onNewItem).toHaveBeenCalledTimes(1);
  });

  it('triggers onNavigate with settings when step 3 action is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <LanguageProvider>
        <OnboardingTour
          tour={mockTour}
          onNewItem={vi.fn()}
          onNavigate={onNavigate}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('tour-step-3-action'));
    expect(onNavigate).toHaveBeenCalledWith('settings');
    expect(mockTour.markStepComplete).toHaveBeenCalledWith(3);
  });

  it('triggers onNavigate with audit when step 4 action is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <LanguageProvider>
        <OnboardingTour
          tour={mockTour}
          onNewItem={vi.fn()}
          onNavigate={onNavigate}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('tour-step-4-action'));
    expect(onNavigate).toHaveBeenCalledWith('audit');
    expect(mockTour.markStepComplete).toHaveBeenCalledWith(4);
  });

  it('calls dismissTour when dismiss button is clicked', () => {
    render(
      <LanguageProvider>
        <OnboardingTour
          tour={mockTour}
          onNewItem={vi.fn()}
          onNavigate={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('tour-dismiss-button'));
    expect(mockTour.dismissTour).toHaveBeenCalledTimes(1);
  });
});
