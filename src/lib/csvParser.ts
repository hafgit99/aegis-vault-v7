/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fast and robust, quote-aware CSV parser that handles quotes, nested commas, and newlines.
 * Automatically detects delimiter (comma, semicolon, or tab) to support Excel/European exports.
 */
export function parseCSV(text: string): string[][] {
  if (!text) return [];

  // Auto-detect delimiter based on occurrences in the first line
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  }

  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let startIdx = 0;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];

    if (char === '"') {
      // Look ahead to check if it's an escaped quote ("")
      if (inQuotes && text[i + 1] === '"') {
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      let val = text.substring(startIdx, i);
      
      // Clean quotes
      val = val.trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.substring(1, val.length - 1);
      }
      val = val.replace(/""/g, '"');
      
      row.push(val);
      startIdx = i + 1;
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      let val = text.substring(startIdx, i);
      
      val = val.trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.substring(1, val.length - 1);
      }
      val = val.replace(/""/g, '"');
      
      row.push(val);

      if (row.length > 0 && row.some(x => x !== '')) {
        result.push(row);
      }
      row = [];

      if (char === '\r' && text[i + 1] === '\n') {
        i++; // Skip LF after CR
      }
      startIdx = i + 1;
    }
  }

  // Handle last remaining field
  if (startIdx < len) {
    let val = text.substring(startIdx);
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.substring(1, val.length - 1);
    }
    val = val.replace(/""/g, '"');
    row.push(val);
  }

  if (row.length > 0 && row.some(x => x !== '')) {
    result.push(row);
  }

  return result.filter(r => r.length > 0 && r.some(val => val !== ''));
}
