import { safeAudioUrl } from '../src/server/audio-hosts';
import { expect, test } from 'bun:test';

const fb = 'https://api.kalamalah.com/fallback';

test.each([
  ['http://api.kalamalah.com/a.mp3', fb],  // http not https
  ['https://evil.tld/?api.kalamalah.com', fb],  // evil host
  ['//x.y', fb],  // protocol-relative
  ['javascript:1', fb],  // javascript scheme
  ['ftp://api.kalamalah.com/a.mp3', fb],  // ftp scheme
  ['not-a-url', fb],  // not a URL
  [null, fb],  // null
  [undefined, fb],  // undefined
  [123, fb],  // number
])('rejects %s', (u: unknown) => {
  expect(safeAudioUrl(u, fb)).toBe(fb);
});

test('allows https api.kalamalah.com', () => {
  expect(safeAudioUrl('https://api.kalamalah.com/a.mp3', fb)).toBe('https://api.kalamalah.com/a.mp3');
});

test('allows https cdn.islam-online.net', () => {
  expect(safeAudioUrl('https://cdn.islam-online.net/audio/a.mp3', fb)).toBe('https://cdn.islam-online.net/audio/a.mp3');
});

test('allows https download.quranicaudio.com', () => {
  expect(safeAudioUrl('https://download.quranicaudio.com/a.mp3', fb)).toBe('https://download.quranicaudio.com/a.mp3');
});
