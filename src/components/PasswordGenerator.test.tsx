// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import PasswordGenerator from './PasswordGenerator';

const generatePassword = vi.hoisted(() => vi.fn(() => 'CharPassword-123!'));
const generateDiceware = vi.hoisted(() => vi.fn(() => 'Dice-Ware-123'));

vi.mock('../lib/security', () => ({
  calculatePasswordScore: vi.fn((password: string) => {
    if (password.includes('Strong')) return 75;
    if (password.includes('Medium')) return 45;
    if (password.includes('Weak')) return 10;
    return password.length > 12 ? 92 : 45;
  }),
  generatePassword,
  getStrengthLabel: vi.fn((password: string) => ({
    label: password.length > 12 ? 'Güçlü' : 'Orta',
    colorClass: 'text-brand-tertiary',
  })),
}));

vi.mock('../lib/diceware', () => ({
  calculateDicewareEntropyBits: vi.fn(({ wordCount }: { wordCount: number }) => wordCount * 13),
  generateDiceware,
}));

describe('PasswordGenerator', () => {
  let clipboardText = '';
  let readText: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardText = '';
    readText = vi.fn().mockImplementation(() => Promise.resolve(clipboardText));
    writeText = vi.fn().mockImplementation((text: string) => {
      clipboardText = text;
      return Promise.resolve();
    });
    Object.assign(navigator, {
      clipboard: {
        readText,
        writeText,
      },
    });
    generatePassword.mockClear();
    generateDiceware.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('clears generated passwords from the clipboard when unchanged', async () => {
    const { container } = render(<PasswordGenerator />);
    const copyButton = container.querySelector<HTMLButtonElement>('#copy-password-btn');

    expect(copyButton).not.toBeNull();
    fireEvent.click(copyButton!);

    const copiedPassword = clipboardText;
    expect(writeText).toHaveBeenCalledWith(copiedPassword);
    expect(copiedPassword.length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(clipboardText).toBe('');
  });

  it('generates character passwords on mount and when options change', () => {
    const { container } = render(<PasswordGenerator />);
    const lengthSlider = container.querySelector<HTMLInputElement>('#chars-spec-panel input[type="range"]');
    const checkboxes = container.querySelectorAll<HTMLInputElement>('#chars-spec-panel input[type="checkbox"]');
    const refreshButton = container.querySelector<HTMLButtonElement>('#refresh-password-btn');

    expect(container.textContent).toContain('CharPassword-123!');
    expect(generatePassword).toHaveBeenCalledWith({
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });

    fireEvent.change(lengthSlider!, { target: { value: '24' } });
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ length: 24 }));

    fireEvent.click(checkboxes[0]!);
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ uppercase: false }));

    fireEvent.click(refreshButton!);
    expect(generatePassword).toHaveBeenCalledTimes(4);
  });

  it('forwards every character option toggle to the generator', () => {
    const { container } = render(<PasswordGenerator />);
    const checkboxes = container.querySelectorAll<HTMLInputElement>('#chars-spec-panel input[type="checkbox"]');

    fireEvent.click(checkboxes[1]!);
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ lowercase: false }));

    fireEvent.click(checkboxes[2]!);
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ numbers: false }));

    fireEvent.click(checkboxes[3]!);
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ symbols: false }));
  });

  it('renders each strength bar tone from the generated password score', () => {
    generatePassword
      .mockReturnValueOnce('SecurePassword-123!')
      .mockReturnValueOnce('StrongPassword')
      .mockReturnValueOnce('MediumPassword')
      .mockReturnValueOnce('Weak');
    const { container } = render(<PasswordGenerator />);
    const refreshButton = container.querySelector<HTMLButtonElement>('#refresh-password-btn');
    const getStrengthBar = () => container.querySelector<HTMLElement>('.h-full.transition-all');

    expect(getStrengthBar()?.className).toContain('bg-brand-tertiary');

    fireEvent.click(refreshButton!);
    expect(getStrengthBar()?.className).toContain('bg-brand-secondary');

    fireEvent.click(refreshButton!);
    expect(getStrengthBar()?.className).toContain('bg-amber-400');

    fireEvent.click(refreshButton!);
    expect(getStrengthBar()?.className).toContain('bg-brand-error');
  });

  it('switches to diceware mode and forwards word options to the generator', () => {
    const { container } = render(<PasswordGenerator />);
    const dicewareTab = container.querySelector<HTMLButtonElement>('#mode-diceware-tab');

    fireEvent.click(dicewareTab!);

    expect(container.querySelector('#diceware-spec-panel')).not.toBeNull();
    expect(container.textContent).toContain('Dice-Ware-123');
    expect(generateDiceware).toHaveBeenLastCalledWith({
      wordCount: 6,
      separator: 'hyphen',
      language: 'tr',
      capitalize: true,
      addNumber: true,
      addSymbol: false,
    });

    const wordSlider = container.querySelector<HTMLInputElement>('#diceware-spec-panel input[type="range"]');
    fireEvent.change(wordSlider!, { target: { value: '6' } });
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ wordCount: 6 }));

    const separatorButtons = container.querySelectorAll<HTMLButtonElement>('#separator-selection-grid button');
    fireEvent.click(separatorButtons[2]!);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ separator: 'underscore' }));

    const languageButtons = container.querySelectorAll<HTMLButtonElement>('#diceware-options-checkboxes button');
    fireEvent.click(languageButtons[1]!);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));

    const dicewareCheckboxes = container.querySelectorAll<HTMLInputElement>('#diceware-options-checkboxes input[type="checkbox"]');
    fireEvent.click(dicewareCheckboxes[2]!);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ addSymbol: true }));
  });

  it('renders diceware strength descriptions across word-count boundaries', () => {
    const { container } = render(<PasswordGenerator />);
    const dicewareTab = container.querySelector<HTMLButtonElement>('#mode-diceware-tab');

    fireEvent.click(dicewareTab!);
    const wordSlider = container.querySelector<HTMLInputElement>('#diceware-spec-panel input[type="range"]');

    fireEvent.change(wordSlider!, { target: { value: '4' } });
    expect(container.textContent).toContain('Orta');

    fireEvent.change(wordSlider!, { target: { value: '6' } });
    expect(container.textContent).toContain('Çok Yüksek');

    fireEvent.change(wordSlider!, { target: { value: '10' } });
    expect(container.textContent).toContain('Maksimum Güvenlik');
  });

  it('forwards diceware capitalization and number toggles', () => {
    const { container } = render(<PasswordGenerator />);
    fireEvent.click(container.querySelector<HTMLButtonElement>('#mode-diceware-tab')!);

    const dicewareCheckboxes = container.querySelectorAll<HTMLInputElement>('#diceware-options-checkboxes input[type="checkbox"]');

    fireEvent.click(dicewareCheckboxes[0]!);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ capitalize: false }));

    fireEvent.click(dicewareCheckboxes[1]!);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ addNumber: false }));
  });

  it('resets copy feedback without clearing a clipboard value changed by the user', async () => {
    const { container } = render(<PasswordGenerator />);
    const copyButton = container.querySelector<HTMLButtonElement>('#copy-password-btn');

    fireEvent.click(copyButton!);
    expect(container.textContent).toContain('Kopyaland');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(container.textContent).toContain('Kopyala');

    clipboardText = 'user-overrode-clipboard';

    await act(async () => {
      vi.advanceTimersByTime(28000);
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenLastCalledWith('');
    expect(clipboardText).toBe('user-overrode-clipboard');
  });

  it('clears pending timers and unchanged clipboard content when unmounted', async () => {
    const { container, unmount } = render(<PasswordGenerator />);
    const copyButton = container.querySelector<HTMLButtonElement>('#copy-password-btn');

    fireEvent.click(copyButton!);
    const copiedPassword = clipboardText;

    unmount();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenLastCalledWith('');

    expect(readText).toHaveBeenCalled();
    expect(clipboardText).toBe('');
    expect(copiedPassword).toBeTruthy();
  });

  it('renders generator controls in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <PasswordGenerator />
      </LanguageProvider>,
    );

    expect(screen.getByText('Password Generation Panel')).toBeTruthy();
    expect(screen.getByText('Character Based')).toBeTruthy();
    expect(screen.getByText('Diceware (Word Based)')).toBeTruthy();
    expect(screen.getByText('STRENGTH LEVEL')).toBeTruthy();
    expect(screen.getByText('CHARACTER CUSTOMIZATION')).toBeTruthy();
    expect(screen.getByText('Character Length')).toBeTruthy();
    expect(screen.getByText('Uppercase Letters')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByTitle('Refresh')).toBeTruthy();

    fireEvent.click(screen.getByText('Diceware (Word Based)'));

    expect(screen.getByText('DICEWARE SYSTEM CUSTOMIZATION')).toBeTruthy();
    expect(screen.getByText('Word Count')).toBeTruthy();
    expect(screen.getByText('Word Separator Type')).toBeTruthy();
    expect(screen.getByText('Word Dictionary')).toBeTruthy();
    expect(screen.getByText('Why Use Diceware Word Passwords?')).toBeTruthy();
  });
});
