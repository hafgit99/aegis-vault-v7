import type { VaultItem } from '../types';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from './androidAutofill';
import { isAndroidAutofillTargetMatch } from './androidAutofillMatching';
import { logSecurityEvent, securityEventCodes, type SecurityEventSeverity } from './securityEvents';

type AndroidAutofillAuditAction = 'requested' | 'cancelled' | 'completed' | 'failed';

const eventCodeByAction: Record<AndroidAutofillAuditAction, (typeof securityEventCodes)[keyof typeof securityEventCodes]> = {
  requested: securityEventCodes.androidAutofillRequested,
  cancelled: securityEventCodes.androidAutofillCancelled,
  completed: securityEventCodes.androidAutofillCompleted,
  failed: securityEventCodes.androidAutofillFailed,
};

const severityByAction: Record<AndroidAutofillAuditAction, SecurityEventSeverity> = {
  requested: 'info',
  cancelled: 'info',
  completed: 'info',
  failed: 'warning',
};

export function logAndroidAutofillSecurityEvent(
  action: AndroidAutofillAuditAction,
  request: AndroidAutofillRequest | null | undefined,
  item?: VaultItem,
): void {
  const target = androidAutofillTargetLabel(request);
  const itemMatchesTarget = item ? isAndroidAutofillTargetMatch(item, request) : undefined;

  logSecurityEvent(
    eventCodeByAction[action],
    `Android Autofill ${action}.`,
    severityByAction[action],
    {
      requestId: request?.requestId,
      target,
      appPackage: request?.appPackage,
      webDomain: request?.webDomain,
      usernameFieldCount: request?.usernameFieldCount,
      passwordFieldCount: request?.passwordFieldCount,
      fillableFieldCount: request?.fillableFieldCount,
      itemId: item?.id,
      itemCategory: item?.category,
      itemMatchesTarget,
    },
  );
}
