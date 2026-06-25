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

  it('keeps semicolon as delimiter only when it beats tab count', () => {
    expect(parseCSV('name;url\tlabel;notes\nPortal;https://example.test\tprimary;main')).toEqual([
      ['name', 'url\tlabel', 'notes'],
      ['Portal', 'https://example.test\tprimary', 'main'],
    ]);
  });

  it('keeps tab as delimiter only when it beats semicolon count', () => {
    expect(parseCSV('name\turl;label\tnotes\nPortal\thttps://example.test;primary\tmain')).toEqual([
      ['name', 'url;label', 'notes'],
      ['Portal', 'https://example.test;primary', 'main'],
    ]);
  });

  it('preserves escaped quotes inside quoted fields', () => {
    expect(parseCSV('title,notes\nVault,"contains ""quoted"" text"')).toEqual([
      ['title', 'notes'],
      ['Vault', 'contains "quoted" text'],
    ]);
  });

  it('does not trim characters from unquoted fields at delimiters, newlines, or EOF', () => {
    expect(parseCSV('first,second\nplain,text\nomega,theta')).toEqual([
      ['first', 'second'],
      ['plain', 'text'],
      ['omega', 'theta'],
    ]);
  });

  it('handles CRLF rows without leaking carriage returns or blank rows', () => {
    expect(parseCSV('first,second\r\nplain,text\r\nomega,theta')).toEqual([
      ['first', 'second'],
      ['plain', 'text'],
      ['omega', 'theta'],
    ]);
  });

  it('keeps comma fallback when semicolon and tab counts tie above comma count', () => {
    expect(parseCSV('name;url\tlabel\nPortal;https://example.test\tprimary')).toEqual([
      ['name;url\tlabel'],
      ['Portal;https://example.test\tprimary'],
    ]);
  });

  it('detects single-semicolon exports without a comma count fallback', () => {
    expect(parseCSV('name;url\nPortal;https://example.test')).toEqual([
      ['name', 'url'],
      ['Portal', 'https://example.test'],
    ]);
  });

  it('detects single-tab exports without semicolon count fallback', () => {
    expect(parseCSV('name\turl\nPortal\thttps://example.test')).toEqual([
      ['name', 'url'],
      ['Portal', 'https://example.test'],
    ]);
  });

  it('keeps comma fallback for plain one-column text without synthetic delimiter counts', () => {
    expect(parseCSV('plain text only')).toEqual([
      ['plain text only'],
    ]);
  });

  it('does not strip a one-sided trailing quote before a delimiter', () => {
    expect(parseCSV('name,value\nleft,open",right')).toEqual([
      ['name', 'value'],
      ['left', 'open"', 'right'],
    ]);
  });

  it('does not strip a one-sided trailing quote before a newline', () => {
    expect(parseCSV('name,value\nleft,open"\nright,ok')).toEqual([
      ['name', 'value'],
      ['left', 'open"'],
      ['right', 'ok'],
    ]);
  });

  it('does not strip a one-sided trailing quote at EOF', () => {
    expect(parseCSV('name,value\nleft,open"')).toEqual([
      ['name', 'value'],
      ['left', 'open"'],
    ]);
  });

  it('drops trailing blank records after CRLF and delimiter-only rows', () => {
    expect(parseCSV('name,value\r\n,\r\n"",""\r\n')).toEqual([
      ['name', 'value'],
    ]);
  });

  it('returns no rows for an empty export', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('handles CR-only row separators without dropping the first character of the next row', () => {
    expect(parseCSV('first,second\rplain,text\romega,theta')).toEqual([
      ['first', 'second'],
      ['plain', 'text'],
      ['omega', 'theta'],
    ]);
  });

  it('ignores whitespace after a closing quote before delimiters and row breaks', () => {
    expect(parseCSV('name,value\n"alpha"  ,"beta"\t\n"gamma" ,delta')).toEqual([
      ['name', 'value'],
      ['alpha', 'beta'],
      ['gamma', 'delta'],
    ]);
  });

  it('preserves malformed quoted fields when text follows closing-quote whitespace', () => {
    expect(parseCSV('name,value\n"alpha"  tail,beta')).toEqual([
      ['name', 'value'],
      ['"alpha"  tail', 'beta'],
    ]);
  });

  it('drops blank records between valid rows without losing final empty fields', () => {
    expect(parseCSV('name,value\n\nalpha,\n\nomega,theta')).toEqual([
      ['name', 'value'],
      ['alpha', ''],
      ['omega', 'theta'],
    ]);
  });
});
