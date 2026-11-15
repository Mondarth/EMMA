import { describe, expect, test } from 'vitest';

import { failedDownload, failureHint } from '../../../src/lib/failures';

// Foundry 14.368's answer when GitLab refused Chat Log Prune 14.0.2's zip, as EMMA showed it.
const RATE_LIMITED =
  '[chatlog-prune] An unexpected error occurred when downloading file ' +
  'https://gitlab.com/tposney/chatlog-prune/-/raw/v14/package/chatlog-prune.zip: Too Many Requests';

describe('failedDownload', () => {
  test('reads the host and why from a download the host refused', () => {
    expect(failedDownload(RATE_LIMITED)).toEqual({ host: 'gitlab.com', why: 'rate-limited' });
  });

  test('reads a download that broke off', () => {
    expect(failedDownload('The download of https://example.org/a.zip failed: terminated')).toEqual({
      host: 'example.org',
      why: 'other',
    });
  });

  test.each([
    ['Not Found', 'not-found'],
    ['Gone', 'not-found'],
    ['Forbidden', 'refused'],
    ['Unauthorized', 'refused'],
    ['too many requests', 'rate-limited'],
    ['Service Unavailable', 'other'],
    ['', 'other'],
  ] as const)('takes "%s" as %s', (reason, why) => {
    expect(
      failedDownload(`An unexpected error occurred when downloading file https://h.test/x.zip: ${reason}`)?.why,
    ).toBe(why);
  });

  test('keeps a URL it cannot read as the host', () => {
    expect(failedDownload('An unexpected error occurred when downloading file nowhere: Not Found')?.host).toBe(
      'nowhere',
    );
  });

  test('is nothing for an answer not of a download', () => {
    expect(failedDownload('No version 2.0.0 found in the manifest')).toBeUndefined();
  });
});

describe('failureHint', () => {
  test('says a refusal for too many requests may be the host limiting a file for everyone, and to try again', () => {
    expect(failureHint(RATE_LIMITED)).toBe(
      'gitlab.com refused the download for too many requests. That is often its limit on one file for everyone ' +
        'downloading it, not only this server: try again in a few minutes.',
    );
  });

  test.each([
    ['Not Found', 'has no file at the address the manifest gives'],
    ['Forbidden', 'may need signing in, or buying'],
    ['Bad Gateway', "Foundry could not download the package's file from h.test"],
  ])('fits "%s"', (reason, hint) => {
    expect(failureHint(`An unexpected error occurred when downloading file https://h.test/x.zip: ${reason}`)).toContain(
      hint,
    );
  });

  test.each([['No version 2.0.0 found in the manifest'], [undefined], ['']])(
    'keeps the manifest hint for %s',
    message => {
      expect(failureHint(message)).toMatch(/^A manifest URL can give a version other than/);
    },
  );
});
