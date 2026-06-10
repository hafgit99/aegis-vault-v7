// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrashInfoBanner from './TrashInfoBanner';

describe('TrashInfoBanner', () => {
  it('renders the trash data protection notice', () => {
    render(<TrashInfoBanner />);

    expect(screen.getByText('Güvenlik ve Veri Koruma Bilgilendirmesi')).toBeTruthy();
    expect(screen.getByText(/local-first mimariyi esas alır/i)).toBeTruthy();
  });
});
