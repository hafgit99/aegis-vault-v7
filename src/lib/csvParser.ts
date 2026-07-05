/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fast and robust, quote-aware CSV parser that handles quotes, nested commas, and newlines.
 * Automatically detects delimiter (comma, semicolon, or tab) to support Excel/European exports.
 * Strips a leading UTF-8 BOM (﻿) so Windows-saved CSVs do not poison the first header.
 */
export function parseCSV(text: string): string[][] {
  if (!text) return [];

  // Strip a leading UTF-8 BOM if present (common in Windows-saved CSV files).
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    if (!text) return [];
  }

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
  let field = '';
  let inQuotes = false;
  let quotedField = false;
  let lastWasDelimiter = false;
  let afterClosingQuote = false;
  let trailingQuoteWhitespace = '';

  const pushField = () => {
    row.push(quotedField ? field : field.trim().replace(/""/g, '"'));
    field = '';
    quotedField = false;
    afterClosingQuote = false;
    trailingQuoteWhitespace = '';
    lastWasDelimiter = false;
  };

  const pushRow = () => {
    if (row.some(value => value !== '')) {
      result.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (afterClosingQuote && !inQuotes) {
      if (char === ' ' || char === '\t') {
        trailingQuoteWhitespace += char;
        continue;
      }

      if (char !== delimiter && char !== '\r' && char !== '\n') {
        field = '"' + field + '"' + trailingQuoteWhitespace + char;
        quotedField = false;
        afterClosingQuote = false;
        trailingQuoteWhitespace = '';
        lastWasDelimiter = false;
        continue;
      }
    }

    if (char === '"') {
      if (inQuotes) {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
          trailingQuoteWhitespace = '';
        }
      } else if (field.trim() === '') {
        field = '';
        inQuotes = true;
        quotedField = true;
        afterClosingQuote = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      pushField();
      lastWasDelimiter = true;
      continue;
    }

    if ((char === '\r' || char === '\n') && !inQuotes) {
      pushField();
      pushRow();
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      continue;
    }

    field += char;
    lastWasDelimiter = false;
  }

  if (field !== '' || row.length > 0 || lastWasDelimiter) {
    pushField();
    pushRow();
  }

  return result;
}
