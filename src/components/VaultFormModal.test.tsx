/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import VaultFormModal from './VaultFormModal';
import { getAttachmentBlob, saveAttachment } from '../lib/attachments';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';

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
  return Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type="file"]):not([data-testid="tag-picker-input"])'));
}

function submitForm() {
  fireEvent.click(document.querySelector<HTMLButtonElement>('button[type="submit"]')!);
}

function attachmentDropZone(): HTMLElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!.parentElement as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
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

  it('renders the shell and common fields in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <VaultFormModal
          isOpen={true}
          editingItem={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Add Secure Vault Item')).toBeTruthy();
    expect(screen.getByText('Your data is encrypted locally in your browser processor instantly.')).toBeTruthy();
    expect(screen.getByText('Login')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Secure Key')).toBeTruthy();
    expect(screen.getByText('Identity')).toBeTruthy();
    expect(screen.getByText('Note')).toBeTruthy();
    expect(screen.getByText('GENERAL DETAILS')).toBeTruthy();
    expect(screen.getByText('ITEM TITLE / PLATFORM')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Developer Portal, Billing Vault, National ID')).toBeTruthy();
    expect(screen.getByText('SECURE URL')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. github.com')).toBeTruthy();
    expect(screen.getByText('User Login Credentials')).toBeTruthy();
    expect(screen.getByText('Authenticator data used for websites and cloud services.')).toBeTruthy();
    expect(screen.getByText('USERNAME OR EMAIL')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. user@example.com')).toBeTruthy();
    expect(screen.getByText('SECURE PASSWORD')).toBeTruthy();
    expect(screen.getByText('Generate Strong')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(screen.getByTitle('Show')).toBeTruthy();
    expect(screen.getByTitle('Generate Password Automatically')).toBeTruthy();
    expect(screen.getByText('TWO-FACTOR (2FA / TOTP) AUTH KEY (STEP-BASED RAPID CODES - OPTIONAL)')).toBeTruthy();
    expect(screen.getByPlaceholderText('E.g. JBSWY3DPEHPK3PXP')).toBeTruthy();
    fireEvent.click(screen.getByText('Card'));
    expect(screen.getByText('Credit / Debit Card Details')).toBeTruthy();
    expect(screen.getByText('All private payment card details are locked with your local key.')).toBeTruthy();
    expect(screen.getByText('NAME ON CARD (CARDHOLDER)')).toBeTruthy();
    expect(screen.getByPlaceholderText('E.g. AHMET YILMAZ')).toBeTruthy();
    expect(screen.getByText('CARD NUMBER')).toBeTruthy();
    expect(screen.getByText('EXPIRY (MM/YY)')).toBeTruthy();
    expect(screen.getByText('SECURITY CODE (CVV)')).toBeTruthy();
    expect(screen.getByText('ATM / CARD PIN (OPTIONAL)')).toBeTruthy();
    fireEvent.click(screen.getByText('Secure Key'));
    expect(screen.getByText('Secure Keys & API Secrets')).toBeTruthy();
    expect(screen.getByText('Store API tokens, crypto keys, SSH secrets, manually managed secure identifiers, and platform WebAuthn passkey records. Browser credential-provider/proxy support remains a separate phase.')).toBeTruthy();
    expect(screen.getByText('SERVICE / USE CASE')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. GitHub API, Solana Wallet, SSH Key')).toBeTruthy();
    expect(screen.getByText('IDENTIFIER / PUBLIC ID')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. github-prod-key-01...')).toBeTruthy();
    expect(screen.getByText('SECRET KEY / TOKEN / PRIVATE PARAMETER')).toBeTruthy();
    expect(screen.getByTitle('Generate Strong Random 256-Bit Secret')).toBeTruthy();
    expect(screen.getByText('Generate Secret')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter or generate high-entropy key material (hex string)')).toBeTruthy();
    fireEvent.click(screen.getByText('Identity'));
    expect(screen.getByText('Personal Identity / Document Details')).toBeTruthy();
    expect(screen.getByText('National IDs, passports, driver licenses, or social security records.')).toBeTruthy();
    expect(screen.getByText('DOCUMENT / ID / PASSPORT NUMBER')).toBeTruthy();
    expect(screen.getByPlaceholderText('E.g. 10000000000 or U1234567')).toBeTruthy();
    expect(screen.getByText('FULL LEGAL NAME ON DOCUMENT')).toBeTruthy();
    expect(screen.getByPlaceholderText('Full name as written on the document')).toBeTruthy();
    expect(screen.getByText('BIRTH DATE')).toBeTruthy();
    expect(screen.getByText('EXPIRY DATE')).toBeTruthy();
    expect(screen.getByText('GENDER')).toBeTruthy();
    expect(screen.getByText('Unspecified / Male (M)')).toBeTruthy();
    expect(screen.getByText('Female (F)')).toBeTruthy();
    expect(screen.getByText('Other / Company Document')).toBeTruthy();
    fireEvent.click(screen.getByText('Note'));
    expect(screen.getByText('Secure Note Content')).toBeTruthy();
    expect(screen.getByText('A plain-text encrypted notes area only you can access.')).toBeTruthy();
    expect(screen.getByText('You can write notes of any length; they are stored fully AES-encrypted on disk.')).toBeTruthy();
    expect(screen.getByText('DOCUMENT / NOTE CONTENT')).toBeTruthy();
    expect(screen.getByPlaceholderText('Write private recovery keys, system passwords, API logs, or sensitive notes here...')).toBeTruthy();
    expect(screen.getByText('Local File Encryption (Max: 250MB)')).toBeTruthy();
    expect(screen.getByText('HTML5 IndexedDB Protected')).toBeTruthy();
    expect(screen.getByText('Click or Drag File')).toBeTruthy();
    expect(screen.getByText('Attach PDFs, images, videos, ZIPs, and other files up to 250MB with fully local encryption.')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save Securely')).toBeTruthy();
    expect(screen.getByTitle('Close')).toBeTruthy();
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

    fireEvent.change(screen.getByPlaceholderText('örn. Geliştirici Portalı, Fatura Kasası, Nüfus Cüzdanı'), {
      target: { value: '  GitHub  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. github.com'), {
      target: { value: '  https://github.com  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. user@example.com'), {
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

  it('falls back safely when editing a legacy item with missing fields and attachment metadata', async () => {
    const onSave = vi.fn();
    const legacyItem = {
      id: 'legacy-item',
      title: undefined,
      username: undefined,
      password: undefined,
      url: undefined,
      notes: undefined,
      createdAt: '2026-06-01',
      updatedAt: '2026-06-01',
      category: undefined,
      favorite: undefined,
      attachmentId: 'legacy-attachment',
      attachmentName: undefined,
      attachmentSize: undefined,
      attachmentType: undefined,
    } as unknown as VaultItem;

    render(
      <VaultFormModal
        isOpen={true}
        editingItem={legacyItem}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByText('Ekli Dosya')).toBeTruthy();
    expect(screen.getByText(/0 B/)).toBeTruthy();

    fireEvent.change(formInputs()[0], {
      target: { value: 'Restored Legacy Login' },
    });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'legacy-item',
        title: 'Restored Legacy Login',
        username: '',
        password: '',
        url: '',
        notes: '',
        category: 'login',
        favorite: false,
        attachmentId: 'legacy-attachment',
        attachmentName: 'Ekli Dosya',
        attachmentSize: undefined,
        attachmentType: 'application/octet-stream',
      }));
    });
  });

  it('saves edits with the original identity, favorite flag, and created date', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItem}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('GitHub'), {
      target: { value: '  GitHub Updated  ' },
    });

    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'item-1',
        title: 'GitHub Updated',
        createdAt: '2026-06-10',
        favorite: true,
      }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows validation feedback when submitted without a title', () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/başlık belirleyin/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('toggles login password visibility and fills a generated password', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const passwordInput = screen.getByPlaceholderText('Şifrenizi belirleyin') as HTMLInputElement;
    const toggleButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Göster'))!;
    const generateButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Otomatik'))!;

    expect(passwordInput.type).toBe('password');
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    fireEvent.click(generateButton);
    expect(passwordInput.value).toBe('Generated-Password-123!');
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

    fireEvent.click(screen.getByTestId('vault-item-category-passkey'));
    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: 'API Key' } });
    fireEvent.change(inputs[2], { target: { value: '  Google Login  ' } });
    fireEvent.change(inputs[3], { target: { value: '  public-id-1  ' } });

    const exponentButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.toLowerCase().includes('gizli'))!;
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
    const genderSelect = Array.from(document.querySelectorAll('select')).find(s => s.querySelector('option[value="Female"]'))!;
    fireEvent.change(genderSelect, { target: { value: 'Female' } });

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

  it('selects an attachment through drag and drop', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const file = new File(['dropped attachment'], 'dropped.txt', { type: 'text/plain' });
    const target = attachmentDropZone();

    fireEvent.dragOver(target);
    fireEvent.drop(target, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(screen.getByText('dropped.txt')).toBeTruthy();
  });

  it('shows an upload error when attachment encryption fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(saveAttachment).mockRejectedValueOnce(new Error('encrypt failed'));
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(formInputs()[0], { target: { value: 'Login With Broken File' } });
    const file = new File(['secret attachment'], 'broken.txt', { type: 'text/plain' });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [file] },
    });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText(/AES-GCM koruması/)).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('can remove a selected file before saving', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const file = new File(['temporary'], 'temporary.txt', { type: 'text/plain' });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    let inputValue = 'C:\\fakepath\\temporary.txt';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => inputValue,
      set: (value) => {
        inputValue = value;
      },
    });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [file] },
    });
    expect(screen.getByText('temporary.txt')).toBeTruthy();

    const removeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Seçimi'))!;
    fireEvent.click(removeButton);

    expect(screen.queryByText('temporary.txt')).toBeNull();
    expect(inputValue).toBe('C:\\fakepath\\temporary.txt');
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

  it('clears existing attachment metadata when removed before saving', async () => {
    const onSave = vi.fn();
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItemWithAttachment}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const removeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.title.includes('Eki'))!;
    fireEvent.click(removeButton);
    submitForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        attachmentId: undefined,
        attachmentName: undefined,
        attachmentSize: undefined,
        attachmentType: undefined,
      }));
    });
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

  it('notifies when downloading an existing attachment throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getAttachmentBlob).mockRejectedValueOnce(new Error('decrypt failed'));
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
        type: 'danger',
      }));
    });
  });
});
