// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordGenerator from './PasswordGenerator';

const generatePassword = vi.hoisted(() => vi.fn(() => 'CharPassword-123!'));
const generateDiceware = vi.hoisted(() => vi.fn(() => 'Dice-Ware-123'));

vi.mock('../lib/security', () => ({
  calculatePasswordScore: vi.fn((password: string) => password.length > 12 ? 92 : 45),
  generatePassword,
  getStrengthLabel: vi.fn((password: string) => ({
    label: password.length > 12 ? 'Güçlü' : 'Orta',
    colorClass: 'text-brand-tertiary',
  })),
}));

vi.mock('../lib/diceware', () => ({
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

    fireEvent.click(checkboxes[0]);
    expect(generatePassword).toHaveBeenLastCalledWith(expect.objectContaining({ uppercase: false }));

    fireEvent.click(refreshButton!);
    expect(generatePassword).toHaveBeenCalledTimes(4);
  });

  it('switches to diceware mode and forwards word options to the generator', () => {
    const { container } = render(<PasswordGenerator />);
    const dicewareTab = container.querySelector<HTMLButtonElement>('#mode-diceware-tab');

    fireEvent.click(dicewareTab!);

    expect(container.querySelector('#diceware-spec-panel')).not.toBeNull();
    expect(container.textContent).toContain('Dice-Ware-123');
    expect(generateDiceware).toHaveBeenLastCalledWith({
      wordCount: 4,
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
    fireEvent.click(separatorButtons[2]);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ separator: 'underscore' }));

    const languageButtons = container.querySelectorAll<HTMLButtonElement>('#diceware-options-checkboxes button');
    fireEvent.click(languageButtons[1]);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));

    const dicewareCheckboxes = container.querySelectorAll<HTMLInputElement>('#diceware-options-checkboxes input[type="checkbox"]');
    fireEvent.click(dicewareCheckboxes[2]);
    expect(generateDiceware).toHaveBeenLastCalledWith(expect.objectContaining({ addSymbol: true }));
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
});
