import { describe, it, expect } from 'vitest';
import {
  extractRegistrableDomain,
  extractRegistrableDomainFromUrl,
  isSameRegistrableDomain,
} from './psl-utils';

describe('psl-utils (Public Suffix List domain extractor)', () => {
  describe('extractRegistrableDomain', () => {
    it('handles simple single-part TLDs', () => {
      expect(extractRegistrableDomain('example.com')).toBe('example.com');
      expect(extractRegistrableDomain('www.example.com')).toBe('example.com');
      expect(extractRegistrableDomain('login.sub.example.org')).toBe('example.org');
      expect(extractRegistrableDomain('vault.aegis.app')).toBe('aegis.app');
    });

    it('correctly handles multi-part ccTLDs (.co.uk, .com.tr, .org.au, etc.)', () => {
      expect(extractRegistrableDomain('login.facebook.co.uk')).toBe('facebook.co.uk');
      expect(extractRegistrableDomain('www.google.co.uk')).toBe('google.co.uk');
      expect(extractRegistrableDomain('sub.bank.com.tr')).toBe('bank.com.tr');
      expect(extractRegistrableDomain('portal.unsw.edu.au')).toBe('unsw.edu.au');
      expect(extractRegistrableDomain('auth.service.co.jp')).toBe('service.co.jp');
    });

    it('correctly handles service suffixes (.github.io, etc.)', () => {
      expect(extractRegistrableDomain('my-site.github.io')).toBe('my-site.github.io');
      expect(extractRegistrableDomain('app.vercel.app')).toBe('app.vercel.app');
    });

    it('preserves registrable domains for phishing comparisons', () => {
      // Phishing domain login.facebo0k.co.uk vs genuine facebook.co.uk
      const phish = extractRegistrableDomain('login.facebo0k.co.uk');
      const legit = extractRegistrableDomain('login.facebook.co.uk');
      expect(phish).toBe('facebo0k.co.uk');
      expect(legit).toBe('facebook.co.uk');
      expect(phish).not.toBe(legit);
    });

    it('handles short or apex domains gracefully', () => {
      expect(extractRegistrableDomain('localhost')).toBe('localhost');
      expect(extractRegistrableDomain('example.com')).toBe('example.com');
    });
  });

  describe('extractRegistrableDomainFromUrl', () => {
    it('extracts eTLD+1 from full URLs', () => {
      expect(extractRegistrableDomainFromUrl('https://login.facebook.co.uk/auth')).toBe('facebook.co.uk');
      expect(extractRegistrableDomainFromUrl('http://www.example.com:8080/login')).toBe('example.com');
      expect(extractRegistrableDomainFromUrl('invalid-url')).toBe('');
    });
  });

  describe('isSameRegistrableDomain', () => {
    it('returns true when URLs share the same eTLD+1', () => {
      expect(isSameRegistrableDomain('https://login.example.com', 'https://www.example.com/account')).toBe(true);
      expect(isSameRegistrableDomain('https://sub.facebook.co.uk', 'https://facebook.co.uk')).toBe(true);
    });

    it('returns false for different registrable domains (phishing detection)', () => {
      expect(isSameRegistrableDomain('https://login.facebo0k.co.uk', 'https://facebook.co.uk')).toBe(false);
      expect(isSameRegistrableDomain('https://evil.com', 'https://example.com')).toBe(false);
      expect(isSameRegistrableDomain('https://invalid', 'not-a-url')).toBe(false);
    });
  });
});
