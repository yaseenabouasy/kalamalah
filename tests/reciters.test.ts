import { findReciterStrict } from '../src/server/reciters-catalog';
import { sanitizeKeyToFile } from '../src/server/prerender-cache';
import { expect, test } from 'bun:test';

test('findReciterStrict finds by slug', () => {
  const r = findReciterStrict('haitham-al-dukhin');
  expect(r).not.toBeNull();
  expect(r?.slug).toBe('haitham-al-dukhin');
});

test('findReciterStrict finds by kalamalahSlug', () => {
  const r = findReciterStrict('haitham-al-dukhin');
  expect(r).not.toBeNull();
});

test('findReciterStrict finds by numeric id', () => {
  const r = findReciterStrict(1);
  expect(r).not.toBeNull();
  expect(r?.id).toBe(1);
});

test('findReciterStrict returns null for unknown', () => {
  expect(findReciterStrict('nonexistent-reciter')).toBeNull();
  expect(findReciterStrict(99999)).toBeNull();
  expect(findReciterStrict('')).toBeNull();
  expect(findReciterStrict('a'.repeat(65))).toBeNull(); // too long
});

test('sanitizeKeyToFile produces consistent output', () => {
  const h1 = sanitizeKeyToFile('view-1,from-2,to-3');
  const h2 = sanitizeKeyToFile('view-1,from-2,to-3');
  expect(h1).toBe(h2);
  expect(h1.length).toBeGreaterThan(0);
});

test('sanitizeKeyToFile produces different output for different keys', () => {
  const h1 = sanitizeKeyToFile('view-1,from-2,to-3');
  const h2 = sanitizeKeyToFile('view-1,from-2,to-4');
  expect(h1).not.toBe(h2);
});
