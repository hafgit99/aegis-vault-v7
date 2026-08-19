/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VaultFormAttachmentSection } from './VaultFormAttachmentSection';
import { VaultFormFolderTagsSection } from './VaultFormFolderTagsSection';
import { VaultFormLoginFields } from './VaultFormLoginFields';
import { VaultFormPasskeyFields } from './VaultFormPasskeyFields';
import { VaultFormNoteFields } from './VaultFormNoteFields';
import { VaultFormCardFields } from './VaultFormCardFields';
import { VaultFormIdentityFields } from './VaultFormIdentityFields';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    language: 'en',
    setLanguage: vi.fn(),
  }),
  LanguageProvider: ({ children }: any) => children,
}));

afterEach(() => {
  cleanup();
});

describe('Vault Form Child Components', () => {
  it('handles attachment dropzone and file selection', () => {
    const onFileChange = vi.fn();
    const onRemoveSelectedFile = vi.fn();
    const onRemoveExistingAttachment = vi.fn();
    const onDownloadExistingAttachment = vi.fn();
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const fileInputRef = React.createRef<HTMLInputElement | null>();

    const { rerender } = render(
      <VaultFormAttachmentSection
        existingAttachment={null}
        selectedFile={null}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onRemoveSelectedFile={onRemoveSelectedFile}
        onRemoveExistingAttachment={onRemoveExistingAttachment}
        onDownloadExistingAttachment={onDownloadExistingAttachment}
        isUploading={false}
        uploadProgress={0}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    );

    const dropzone = screen.getByTestId('vault-item-attachment-dropzone');
    expect(dropzone).toBeDefined();
    fireEvent.click(dropzone);
    fireEvent.dragOver(dropzone);
    expect(onDragOver).toHaveBeenCalled();

    // Re-render with selected file
    const mockFile = new File(['test-content'], 'sample.pdf', { type: 'application/pdf' });
    rerender(
      <VaultFormAttachmentSection
        existingAttachment={null}
        selectedFile={mockFile}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onRemoveSelectedFile={onRemoveSelectedFile}
        onRemoveExistingAttachment={onRemoveExistingAttachment}
        onDownloadExistingAttachment={onDownloadExistingAttachment}
        isUploading={false}
        uploadProgress={0}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    );

    const removeBtn = screen.getByTestId('vault-item-selected-attachment-remove-button');
    fireEvent.click(removeBtn);
    expect(onRemoveSelectedFile).toHaveBeenCalled();
  });

  it('renders folders dropdown and handles selection', () => {
    const onFolderIdChange = vi.fn();
    const onItemTagsChange = vi.fn();
    const folders = [
      { id: 'f-1', name: 'Work', createdAt: '2026-01-01', parentId: null, color: 'emerald' as const, icon: 'folder' as const },
      { id: 'f-2', name: 'Finance', createdAt: '2026-01-01', parentId: null, color: 'blue' as const, icon: 'folder' as const },
    ];
    const tags = [
      { id: 't-1', name: 'Critical', slug: 'critical', color: 'red' as const, createdAt: '2026-01-01' },
    ];

    render(
      <VaultFormFolderTagsSection
        folderId="f-1"
        onFolderIdChange={onFolderIdChange}
        folders={folders}
        itemTags={['Critical']}
        onItemTagsChange={onItemTagsChange}
        tags={tags}
      />
    );

    const select = screen.getByTestId('vault-item-folder-select') as HTMLSelectElement;
    expect(select.value).toBe('f-1');
    fireEvent.change(select, { target: { value: 'f-2' } });
    expect(onFolderIdChange).toHaveBeenCalledWith('f-2');
  });

  it('renders VaultFormLoginFields', () => {
    const onUsernameChange = vi.fn();
    const onPasswordChange = vi.fn();
    const onAutoGeneratePassword = vi.fn();
    const onTogglePasswordVisibility = vi.fn();
    const onTotpSecretChange = vi.fn();

    render(
      <VaultFormLoginFields
        username="alice"
        onUsernameChange={onUsernameChange}
        password="secretpassword123!"
        onPasswordChange={onPasswordChange}
        isPasswordVisible={false}
        onTogglePasswordVisibility={onTogglePasswordVisibility}
        onAutoGeneratePassword={onAutoGeneratePassword}
        totpSecret="JBSWY3DPEHPK3PXP"
        onTotpSecretChange={onTotpSecretChange}
      />
    );

    const userInput = screen.getByTestId('vault-item-username-input');
    fireEvent.change(userInput, { target: { value: 'bob' } });
    expect(onUsernameChange).toHaveBeenCalledWith('bob');

    const toggleVisBtn = screen.getByTitle('vaultForm.login.show');
    fireEvent.click(toggleVisBtn);
    expect(onTogglePasswordVisibility).toHaveBeenCalled();

    const passGenBtn = screen.getByTitle('vaultForm.login.generatePasswordTitle');
    fireEvent.click(passGenBtn);
    expect(onAutoGeneratePassword).toHaveBeenCalled();
  });

  it('renders VaultFormPasskeyFields and triggers auto-generate', () => {
    const onPasskeyServiceChange = vi.fn();
    const onPasskeyPublicIdChange = vi.fn();
    const onPasskeyPrivateExponentChange = vi.fn();
    const onAutoGenerate = vi.fn();

    render(
      <VaultFormPasskeyFields
        passkeyService="github.com"
        onPasskeyServiceChange={onPasskeyServiceChange}
        passkeyPublicId="alice-pub"
        onPasskeyPublicIdChange={onPasskeyPublicIdChange}
        passkeyPrivateExponent="priv-key-hex"
        onPasskeyPrivateExponentChange={onPasskeyPrivateExponentChange}
        onAutoGeneratePrivateExponent={onAutoGenerate}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'google.com' } });
    expect(onPasskeyServiceChange).toHaveBeenCalledWith('google.com');

    if (inputs[1]) {
      fireEvent.change(inputs[1]!, { target: { value: 'alice-2' } });
      expect(onPasskeyPublicIdChange).toHaveBeenCalledWith('alice-2');
    }

    const genBtn = screen.getByRole('button');
    fireEvent.click(genBtn);
    expect(onAutoGenerate).toHaveBeenCalled();
  });

  it('renders VaultFormCardFields', () => {
    const onCardholderNameChange = vi.fn();
    const onCardNumberChange = vi.fn();
    const onCardExpiryChange = vi.fn();
    const onCardCvvChange = vi.fn();
    const onCardPinChange = vi.fn();

    render(
      <VaultFormCardFields
        cardholderName="John Doe"
        onCardholderNameChange={onCardholderNameChange}
        cardNumber="4111222233334444"
        onCardNumberChange={onCardNumberChange}
        cardExpiry="12/28"
        onCardExpiryChange={onCardExpiryChange}
        cardCvv="123"
        onCardCvvChange={onCardCvvChange}
        cardPin="9999"
        onCardPinChange={onCardPinChange}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders VaultFormIdentityFields and VaultFormNoteFields', () => {
    const onIdNumberChange = vi.fn();
    const onIdFullNameChange = vi.fn();
    const onIdBirthDateChange = vi.fn();
    const onIdExpiryDateChange = vi.fn();
    const onIdGenderChange = vi.fn();

    render(
      <VaultFormIdentityFields
        idNumber="TR12345678"
        onIdNumberChange={onIdNumberChange}
        idFullName="Jane Doe"
        onIdFullNameChange={onIdFullNameChange}
        idBirthDate="1990-01-01"
        onIdBirthDateChange={onIdBirthDateChange}
        idExpiryDate="2030-01-01"
        onIdExpiryDateChange={onIdExpiryDateChange}
        idGender="female"
        onIdGenderChange={onIdGenderChange}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);

    cleanup();

    const onNotesChange = vi.fn();
    render(<VaultFormNoteFields category="secure_note" notes="Private notes" onNotesChange={onNotesChange} />);
    const notesInput = screen.getByTestId('vault-item-notes-input');
    fireEvent.change(notesInput, { target: { value: 'Updated notes' } });
    expect(onNotesChange).toHaveBeenCalledWith('Updated notes');
  });
});
