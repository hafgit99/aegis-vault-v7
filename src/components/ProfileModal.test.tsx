/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import ProfileModal, { isGradient } from './ProfileModal';

class MockFileReader {
  public result: string | ArrayBuffer | null = null;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,avatar`;
    this.onload?.();
  }
}

class FailingFileReader {
  public result: string | ArrayBuffer | null = null;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  readAsDataURL() {
    this.onerror?.();
  }
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ProfileModal', () => {
  it('detects gradient avatar strings', () => {
    expect(isGradient('linear-gradient(135deg, #fff, #000)')).toBe(true);
    expect(isGradient('gradient-brand')).toBe(true);
    expect(isGradient('data:image/png;base64,abc')).toBe(false);
  });

  it('does not render while closed', () => {
    render(
      <ProfileModal
        isOpen={false}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText('Profili Özelleştir')).toBeNull();
  });

  it('saves a trimmed profile name and selected preset avatar', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByLabelText('avatar-preset-2'));
    fireEvent.change(screen.getByLabelText(/KULLANICI ADI/), {
      target: { value: '  Ada Vault  ' },
    });
    fireEvent.click(screen.getByText('Değişiklikleri Kaydet'));

    expect(onSave).toHaveBeenCalledWith('Ada Vault', 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows validation errors for empty names and invalid files', () => {
    const onSave = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/KULLANICI ADI/), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Değişiklikleri Kaydet'));

    expect(screen.getByText('Lütfen geçerli bir isim giriniz.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    const textFile = new File(['not image'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [textFile] },
    });

    expect(screen.getByText(/geçerli bir görsel/)).toBeTruthy();
  });

  it('keeps the fallback avatar initial and ignores empty file selections', () => {
    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName=""
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const clickSpy = vi.spyOn(fileInput, 'click');

    expect(screen.getByText('A')).toBeTruthy();

    fireEvent.change(fileInput, { target: { files: [] } });

    expect(screen.queryByText(/hata/)).toBeNull();

    const uploadIconButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Resim'))!;
    fireEvent.click(uploadIconButton);
    fireEvent.click(screen.getByText(/Cihazdan/));

    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized profile images', () => {
    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const largeImage = new File(['image'], 'large.png', { type: 'image/png' });
    Object.defineProperty(largeImage, 'size', { value: 2 * 1024 * 1024 + 1 });

    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [largeImage] },
    });

    expect(screen.getByText(/2MB/)).toBeTruthy();
  });

  it('loads a valid local image preview and saves it', async () => {
    vi.stubGlobal('FileReader', MockFileReader);
    const onSave = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const imageFile = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [imageFile] },
    });

    await waitFor(() => {
      expect(screen.getByAltText('Profil').getAttribute('src')).toBe('data:image/png;base64,avatar');
    });

    fireEvent.click(screen.getByText('Değişiklikleri Kaydet'));

    expect(onSave).toHaveBeenCalledWith('Hafiz', 'data:image/png;base64,avatar');
  });

  it('shows an error when a valid profile image cannot be read', () => {
    vi.stubGlobal('FileReader', FailingFileReader);

    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const imageFile = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [imageFile] },
    });

    expect(screen.getByText(/okunurken hata/)).toBeTruthy();
    expect(screen.queryByAltText('Profil')).toBeNull();
  });

  it('forwards cancel actions to onClose', () => {
    const onClose = vi.fn();

    render(
      <ProfileModal
        isOpen={true}
        currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        currentName="Hafiz"
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Vazgeç'));
    fireEvent.click(screen.getByTitle('Kapat'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders profile controls in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <ProfileModal
          isOpen={true}
          currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
          currentName="Hafiz"
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Customize Profile')).toBeTruthy();
    expect(screen.getByText(/Update your appearance and name/i)).toBeTruthy();
    expect(screen.getByText('Upload Image from Device (.png, .jpg)')).toBeTruthy();
    expect(screen.getByText('CHOOSE COLOR (GRADIENT PRESETS)')).toBeTruthy();
    expect(screen.getByLabelText('USERNAME OR NICKNAME')).toBeTruthy();
    expect(screen.getByPlaceholderText('Name of your backup password')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
    expect(screen.getByTitle('Upload New Image')).toBeTruthy();
    expect(screen.getByTitle('Close')).toBeTruthy();
  });

  it('renders validation feedback in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <ProfileModal
          isOpen={true}
          currentAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
          currentName="Hafiz"
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('USERNAME OR NICKNAME'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(screen.getByText('Please enter a valid name.')).toBeTruthy();

    const textFile = new File(['not image'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [textFile] },
    });

    expect(screen.getByText('Please choose a valid image file (PNG, JPG, WebP).')).toBeTruthy();
  });
});
