'use strict';

const {
  getDidYouMean,
  suggestDomain,
  levenshtein,
} = require('../src/typoDetector');

describe('levenshtein', () => {
  test('returns 0 for identical strings', () => {
    expect(levenshtein('gmail.com', 'gmail.com')).toBe(0);
  });

  test('returns the length of the other string when one is empty', () => {
    expect(levenshtein('', 'gmail')).toBe(5);
    expect(levenshtein('gmail', '')).toBe(5);
  });

  test('counts single-character substitutions, insertions and deletions', () => {
    expect(levenshtein('gmial', 'gmail')).toBe(2);   // swap of two chars
    expect(levenshtein('yahooo', 'yahoo')).toBe(1);  // extra char
    expect(levenshtein('yaho', 'yahoo')).toBe(1);    // missing char
  });
});

describe('suggestDomain', () => {
  test('returns null for a clean popular domain', () => {
    expect(suggestDomain('gmail.com')).toBeNull();
    expect(suggestDomain('outlook.com')).toBeNull();
  });

  test('catches gmial.com → gmail.com', () => {
    expect(suggestDomain('gmial.com')).toBe('gmail.com');
  });

  test('catches yahooo.com → yahoo.com', () => {
    expect(suggestDomain('yahooo.com')).toBe('yahoo.com');
  });

  test('catches hotmial.com → hotmail.com', () => {
    expect(suggestDomain('hotmial.com')).toBe('hotmail.com');
  });

  test('catches outlok.com → outlook.com', () => {
    expect(suggestDomain('outlok.com')).toBe('outlook.com');
  });

  test('does not suggest for completely unrelated domains', () => {
    expect(suggestDomain('mycompany.io')).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(suggestDomain(null)).toBeNull();
    expect(suggestDomain(undefined)).toBeNull();
    expect(suggestDomain(42)).toBeNull();
  });
});

describe('getDidYouMean', () => {
  test('returns a corrected full email for a typo domain', () => {
    expect(getDidYouMean('user@gmial.com')).toBe('user@gmail.com');
    expect(getDidYouMean('demo@yahooo.com')).toBe('demo@yahoo.com');
    expect(getDidYouMean('test@hotmial.com')).toBe('test@hotmail.com');
    expect(getDidYouMean('hello@outlok.com')).toBe('hello@outlook.com');
  });

  test('returns null when the address is fine', () => {
    expect(getDidYouMean('user@gmail.com')).toBeNull();
  });

  test('returns null when input is invalid', () => {
    expect(getDidYouMean('not-an-email')).toBeNull();
    expect(getDidYouMean(null)).toBeNull();
  });
});
