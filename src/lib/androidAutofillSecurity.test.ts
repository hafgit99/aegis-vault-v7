import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import type { AndroidAutofillRequest } from './androidAutofill';
import { logAndroidAutofillSecurityEvent } from './androidAutofillSecurity';
import { securityEventCodes } from './securityEvents';

const request: AndroidAutofillRequest = {
  requestId: 'request-1',
  createdAt: 123,
  source: 'android-autofill',
  appPackage: 'com.example.app',
  webDomain: 'login.example.com',
};

const item: VaultItem = {
  id: 'login-1',
  title: 'Example Login',
  username: 'ada@example.com',
  password: 'CorrectHorseBatteryStaple',
  url: 'https://login.example.com',
  category: 'login',
  favorite: false,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('androidAutofillSecurity', () => {
  it('logs completed Autofill events without secret fields', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logAndroidAutofillSecurityEvent('completed', request, item);

    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      source: 'AegisSecurity',
      code: securityEventCodes.androidAutofillCompleted,
      severity: 'info',
      meta: expect.objectContaining({
        requestId: 'request-1',
        target: 'login.example.com',
        itemId: 'login-1',
        itemCategory: 'login',
        itemMatchesTarget: true,
      }),
    }));
    expect(JSON.stringify(info.mock.calls[0][0])).not.toContain('CorrectHorseBatteryStaple');
    expect(JSON.stringify(info.mock.calls[0][0])).not.toContain('ada@example.com');
  });

  it('logs failed Autofill events as warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logAndroidAutofillSecurityEvent('failed', request, {
      ...item,
      id: 'other-login',
      url: 'https://unrelated.test',
    });

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      code: securityEventCodes.androidAutofillFailed,
      severity: 'warning',
      meta: expect.objectContaining({
        itemId: 'other-login',
        itemMatchesTarget: false,
      }),
    }));
  });
});
