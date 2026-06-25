/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImportLabels } from './importer';

export const defaultImportLabels: ImportLabels = {
  errorEmpty: 'File content is empty.',
  formatAegisJson: 'Aegis Secure JSON Backup',
  formatBitwardenJson: 'Bitwarden Password Manager (JSON)',
  errorUnsupportedJson: 'Unsupported or unrecognized JSON structure.',
  errorJsonPrefix: 'JSON format error',
  errorCsvHeader: 'Empty CSV file or missing header row.',
  formatBitwardenCsv: 'Bitwarden Import (CSV)',
  formatLastPassCsv: 'LastPass Password Import (CSV)',
  formatChromeCsv: 'Google Chrome / Password Manager (CSV)',
  formatOnePasswordCsv: '1Password Password Import (CSV)',
  untitledUniversal: 'Untitled Import',
  formatUniversalCsv: 'Universal Column-Compatible CSV',
  errorCsvColumns: 'CSV structure could not be resolved. No password or username columns were found.',
};
