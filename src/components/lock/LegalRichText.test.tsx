/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalRichText } from './LegalRichText';

afterEach(cleanup);

const mixed = '<strong>kalın</strong> ve <code>kod</code> ile <a href="mailto:a@b.com">bağlantı</a>';

describe('LegalRichText', () => {
  it('turns strong, em, code and mailto into elements', () => {
    const { container } = render(<LegalRichText>{mixed}</LegalRichText>);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.querySelectorAll('code')).toHaveLength(1);
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('mailto:a@b.com');
  });

  it('does not leak the markup as text', () => {
    const { container } = render(<LegalRichText>{mixed}</LegalRichText>);
    expect(container.textContent).not.toContain('<strong>');
    expect(container.textContent).toContain('kalın');
  });

  it('renders an unknown tag as literal text rather than an element', () => {
    // The reason this parser exists at all instead of dangerouslySetInnerHTML: a
    // translation string must not be able to introduce an element.
    const { container } = render(<LegalRichText>{'<img src=x onerror=alert(1)>metin'}</LegalRichText>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img');
  });

  it('refuses a link that is not mailto', () => {
    const { container } = render(<LegalRichText>{'<a href="https://evil.example">git</a>'}</LegalRichText>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('git');
  });

  it('drops the {{DOMAIN}} token', () => {
    const { container } = render(<LegalRichText>{'admin@{{DOMAIN}}'}</LegalRichText>);
    expect(container.textContent).not.toContain('{{DOMAIN}}');
  });

  it('keeps plain text with no markup intact', () => {
    const { container } = render(<LegalRichText>{'sadece düz metin'}</LegalRichText>);
    expect(container.textContent).toBe('sadece düz metin');
  });
});