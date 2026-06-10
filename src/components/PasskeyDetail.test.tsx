/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import PasskeyDetail from './PasskeyDetail';

const passkeyItem: VaultItem = {
  id: 'passkey-1',
  title: 'GitHub API',
  username: 'public-key-id',
  url: '',
  passkeyService: 'GitHub',
  passkeyPrivateExponent: 'private-secret-value',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'passkey',
};

afterEach(() => {
  cleanup();
});

describe('PasskeyDetail', () => {
  it('renders nothing for non-passkey items', () => {
    const { container } = render(
      <PasskeyDetail
        item={{ ...passkeyItem, category: 'login' }}
        copiedField={null}
        isPrivateExponentRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders passkey service and masked private secret', () => {
    render(
      <PasskeyDetail
        item={passkeyItem}
        copiedField={null}
        isPrivateExponentRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('HİZMET ADI')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('public-key-id')).toBeTruthy();
    expect(screen.queryByText('private-secret-value')).toBeNull();
  });

  it('reveals and copies passkey fields', () => {
    const onToggleReveal = vi.fn();
    const onCopyText = vi.fn();

    render(
      <PasskeyDetail
        item={passkeyItem}
        copiedField={null}
        isPrivateExponentRevealed={true}
        onToggleReveal={onToggleReveal}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByText('private-secret-value')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getAllByRole('button')[1]);
    fireEvent.click(screen.getByTitle('Kopyala'));

    expect(onCopyText).toHaveBeenCalledWith('public-key-id', 'passkeyPublicId');
    expect(onToggleReveal).toHaveBeenCalledTimes(1);
    expect(onCopyText).toHaveBeenCalledWith('private-secret-value', 'passkeyPrivateExponent');
  });
});
