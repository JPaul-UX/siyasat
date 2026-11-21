import { describe, expect, it } from 'vitest';
import { describeDevice } from './request-info.js';

describe('describing the device behind a user agent', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Samsung Internet on Android'],
    ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox on Linux'],
  ])('names the browser and system: %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it.each([
    ['curl/8.7.1', 'curl'],
    ['python-requests/2.32.3', 'Python script'],
    ['PostmanRuntime/7.42.0', 'Postman'],
    ['node-fetch/1.0 (+https://github.com/bitinn/node-fetch)', 'Node.js script'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Bot'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36', 'Bot'],
  ])('calls a script or bot what it is: %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it('does not take a phone whose name ends in "bot" for a bot', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 13; CUBOT_X70) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe('Chrome on Android');
  });

  it('says nothing when there is no user agent', () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice('')).toBeNull();
  });
});
