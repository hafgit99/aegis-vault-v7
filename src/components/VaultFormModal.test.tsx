/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import VaultFormModal from './VaultFormModal';
import { getAttachmentBlob, saveAttachment } from '../lib/attachments';

vi.mock('../lib/attachments', () => ({
  getAttachmentBlob: vi.fn(),
  saveAttachment: vi.fn(),
}));

vi.mock('../lib/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/security')>();
  return {
    ...actual,
    generatePassword: vi.fn(() => 'Generated-Password-123!'),
  };
});

vi.mock('../lib/random', () => ({
  secureRandomIndex: vi.fn(() => 0),
  secureRandomToken: vi.fn(() => 'attach-id'),
}));

const editingItem: VaultItem = {
  id: 'item-1',
  title: 'GitHub',
  username: 'hafgit99',
  password: 'secret-password',
  url: 'https://github.com',
  notes: 'Recovery codes are stored offline.',
  createdAt: '2026-06-10',
  updatedAt: '2026-06-10',
  category: 'login',
  favorite: true,
};

const editingItemWithAttachment: VaultItem = {
  ...editingItem,
  attachmentId: 'attachment-1',
  attachmentName: 'contract.pdf',
  attachmentSize: 2048,
  attachmentType: 'application/pdf',
};

function formInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type="file"])'));
}

function submitForm() {
  fireEvent.click(document.querySelector<HTMLButtonElement>('button[type="submit"]')!);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('VaultFormModal', () => {
  it('does not render when closed', () => {
    render(
      <VaultFormModal
        isOpen={false}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText('Kasaya Güvenli Öge Ekle')).toBeNull();
  });

  it('saves a new login item with trimmed fields', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('örn. GitHub, Chase Bank, Nüfus Cüzdanı'), {
      target: { value: '  GitHub  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. github.com'), {
      target: { value: '  https://github.com  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. blt1.koc@gmail.com'), {
      target: { value: '  hafgit99  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Şifrenizi belirleyin'), {
      target: { value: 'secret-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('Kurtarma ipuçları, ek bilgiler vb.'), {
      target: { value: '  backup codes  ' },
    });

    fireEvent.click(screen.getByText('Güvenle Kaydet'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '',
          title: 'GitHub',
          username: 'hafgit99',
          password: 'secret-password',
          url: 'https://github.com',
          notes: 'backup codes',
          category: 'login',
          favorite: false,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hydrates existing item fields in edit mode', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItem}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Kasa Ögesini Güncelle')).toBeTruthy();
    expect(screen.getByDisplayValue('GitHub')).toBeTruthy();
    expect(screen.getByDisplayValue('hafgit99')).toBeTruthy();
    expect(screen.getByDisplayValue('secret-password')).toBeTruthy();
    expect(screen.getByDisplayValue('https://github.com')).toBeTruthy();
    expect(screen.getByDisplayValue('Recovery codes are stored offline.')).toBeTruthy();
  });

  it('saves credit card fields and maps the visible username to the card number', async () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText('Kart'));
    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: '  Business Card  ' } });
    fireEvent.change(inputs[2], { target: { value: '  Ada Lovelace  ' } });
    fireEvent.change(inputs[3], { target: { value: '4111 1111 1111 1111' } });
    fireEvent.change(inputs[4], { target: { value: ' 12/30 ' } });
    fireEvent.change(inputs[5], { target: { value: '123' } });
    fireEvent.change(inputs[6], { target: { value: '9876' } });

    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Business Card',
        category: 'card',
        username: '4111111111111111',
        cardholderName: 'Ada Lovelace',
        cardNumber: '4111111111111111',
        cardExpiry: '12/30',
        cardCvv: '123',
        cardPin: '9876',
      }));
    });
  });

  it('saves passkey fields and can generate a deterministic private exponent', async () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText('Passkey'));
    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: 'API Key' } });
    fireEvent.change(inputs[2], { target: { value: '  Google Login  ' } });
    fireEvent.change(inputs[3], { target: { value: '  public-id-1  ' } });

    const exponentButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Exponent'))!;
    fireEvent.click(exponentButton);
    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        title: 'API Key',
        category: 'passkey',
        username: 'public-id-1',
        passkeyService: 'Google Login',
        passkeyPublicId: 'public-id-1',
        passkeyPrivateExponent: '0'.repeat(64),
      }));
    });
  });

  it('saves identity fields with document number as the visible username', async () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText('Kimlik'));
    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: 'Passport' } });
    fireEvent.change(inputs[1], { target: { value: 'https://identity.example' } });
    fireEvent.change(inputs[2], { target: { value: '  U1234567  ' } });
    fireEvent.change(inputs[3], { target: { value: '  Ada Lovelace  ' } });
    const dateInputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '1815-12-10' } });
    fireEvent.change(dateInputs[1], { target: { value: '2030-12-10' } });
    fireEvent.change(document.querySelector('select')!, { target: { value: 'Female' } });

    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        category: 'identity',
        username: 'U1234567',
        idNumber: 'U1234567',
        idFullName: 'Ada Lovelace',
        idBirthDate: '1815-12-10',
        idExpiryDate: '2030-12-10',
        idGender: 'Female',
      }));
    });
  });

  it('saves secure notes with the expanded note field', async () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText('Not'));
    fireEvent.change(formInputs()[0], { target: { value: 'Recovery Notes' } });
    const notesArea = document.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(notesArea.rows).toBe(8);
    fireEvent.change(notesArea, {
      target: { value: '  seed phrase lives offline  ' },
    });

    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        category: 'secure_note',
        notes: 'seed phrase lives offline',
      }));
    });
  });

  it('uploads a selected attachment and stores metadata in the saved item', async () => {
    vi.mocked(saveAttachment).mockImplementation(async (_id, _file, onProgress) => {
      onProgress(100);
    });
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: 'Login With File' } });
    fireEvent.change(inputs[2], { target: { value: 'ada' } });
    const file = new File(['secret attachment'], 'secret.txt', { type: 'text/plain' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [file] },
    });

    expect(screen.getByText('secret.txt')).toBeTruthy();

    submitForm();

    await waitFor(() => {
      expect(saveAttachment).toHaveBeenCalledWith('attach-id', file, expect.any(Function));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        attachmentId: 'attach-id',
        attachmentName: 'secret.txt',
        attachmentSize: file.size,
        attachmentType: 'text/plain',
      }));
    });
  });

  it('rejects files above the attachment size limit before upload', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const oversizedFile = new File(['x'], 'huge.zip', { type: 'application/zip' });
    Object.defineProperty(oversizedFile, 'size', { value: 251 * 1024 * 1024 });

    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [oversizedFile] },
    });

    expect(screen.getAllByText(/250MB/).length).toBeGreaterThan(0);
    expect(screen.queryByText('huge.zip')).toBeNull();
    expect(saveAttachment).not.toHaveBeenCalled();
  });

  it('downloads and removes an existing attachment in edit mode', async () => {
    const createObjectURL = vi.fn(() => 'blob:attachment');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.mocked(getAttachmentBlob).mockResolvedValue({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      name: 'contract.pdf',
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItemWithAttachment}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const downloadButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('ndir'))!;
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(getAttachmentBlob).toHaveBeenCalledWith('attachment-1');
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:attachment');
    });

    const removeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Eki'))!;
    fireEvent.click(removeButton);
    expect(screen.queryByText('contract.pdf')).toBeNull();
  });

  it('notifies when an existing attachment cannot be downloaded', async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(null);
    const onNotify = vi.fn();

    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItemWithAttachment}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onNotify={onNotify}
      />,
    );

    const downloadButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('ndir'))!;
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({
        type: 'warning',
      }));
    });
  });
});
