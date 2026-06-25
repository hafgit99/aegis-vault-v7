import { describe, expect, it } from 'vitest';
import { parseCSV } from './csvParser';

describe('CSV parser helper', () => {
  it('detects delimiters from the first LF-only row only', () => {
    expect(parseCSV('name,url\none\ttwo\tthree')).toEqual([
      ['name', 'url'],
      ['one\ttwo\tthree'],
    ]);
  });

  it('keeps comma as the delimiter when comma and tab counts tie', () => {
    expect(parseCSV('name,url\tlabel\nSite,https://example.test\tprimary')).toEqual([
      ['name', 'url\tlabel'],
      ['Site', 'https://example.test\tprimary'],
    ]);
  });

  it('ignores rows that contain only delimiters or quoted empty fields', () => {
    expect(parseCSV('name,value\n,\n"",""\nalpha,beta')).toEqual([
      ['name', 'value'],
      ['alpha', 'beta'],
    ]);
  });

  it('unquotes single-character quoted fields', () => {
    expect(parseCSV('left,right\n"x","y"')).toEqual([
      ['left', 'right'],
      ['x', 'y'],
    ]);
  });

  it('does not strip malformed one-sided quotes', () => {
    expect(parseCSV('name,value\n"open,closed"tail')).toEqual([
      ['name', 'value'],
      ['"open,closed"tail'],
    ]);
  });
});
