/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import ConfirmModal from './ConfirmModal';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('ConfirmModal', () => {
  it('does not render while closed', () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Delete item"
        message="This should stay hidden"
        type="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText('Delete item')).toBeNull();
  });

  it('renders confirmation content and closes after confirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Delete item"
        message="This action cannot be undone."
        type="danger"
        confirmText="Delete"
        cancelText="Keep"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Delete item')).toBeTruthy();
    expect(screen.getByText('This action cannot be undone.')).toBeTruthy();

    fireEvent.click(screen.getByText('Delete'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('supports cancel and header close actions', () => {
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Warning"
        message="Review before continuing."
        type="warning"
        cancelText="Back"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByTitle('Kapat'));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('renders alert mode with only the automatic Tamam action', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        title="Saved"
        message="Your changes were saved."
        type="success"
        isAlert={true}
        confirmText="Ignored"
        cancelText="Hidden"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByText('Hidden')).toBeNull();

    fireEvent.click(screen.getByText('Tamam'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders default actions in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <ConfirmModal
          isOpen={true}
          title="Default actions"
          message="Use translated defaults."
          type="info"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByTitle('Close')).toBeTruthy();
  });

  it('renders alert action in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <ConfirmModal
          isOpen={true}
          title="Saved"
          message="Your changes were saved."
          type="success"
          isAlert={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
});
