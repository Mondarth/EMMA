/**
 * What to suggest when an install fails, from what Foundry answered. Foundry 14's downloader reports a download that
 * fails as "An unexpected error occurred when downloading file <url>: <reason>" when the host refuses it, or "The
 * download of <url> failed: <reason>" when it breaks off, the reason being the host's status text, such as "Too Many
 * Requests" (checked on Foundry 14.368, `dist/files/downloader.mjs` and `common/utils/http.mjs`). Anything else, such
 * as a manifest that gives another version, keeps the manifest hint.
 */
import { format, localize } from './i18n';

const DOWNLOAD_FAILED =
  /(?:An unexpected error occurred when downloading file|The download of) (\S+?)(?: failed)?: (.*)$/s;

/** Why a download failed, as far as the host's status text says. */
export type DownloadFailure = 'rate-limited' | 'not-found' | 'refused' | 'other';

/** A download that failed: the host asked, and why it failed. */
export interface FailedDownload {
  readonly host: string;
  readonly why: DownloadFailure;
}

/**
 * Read a failed download from Foundry's answer.
 * @param message - What Foundry answered, perhaps after the package's id in brackets
 * @returns The download, or `undefined` when the answer is not of one
 */
export function failedDownload(message: string): FailedDownload | undefined {
  const match = DOWNLOAD_FAILED.exec(message);
  if (match === null) return undefined;
  const [, url = '', reason = ''] = match;
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }
  const status = reason.trim().toLowerCase();
  const why: DownloadFailure =
    status === 'too many requests'
      ? 'rate-limited'
      : status === 'not found' || status === 'gone'
        ? 'not-found'
        : status === 'unauthorized' || status === 'forbidden'
          ? 'refused'
          : 'other';
  return { host, why };
}

const HINTS: Readonly<Record<DownloadFailure, string>> = {
  'rate-limited': 'Failure.RateLimitedHint',
  'not-found': 'Failure.NotFoundHint',
  refused: 'Failure.RefusedHint',
  other: 'Failure.DownloadHint',
};

/**
 * The hint to show beneath a failed install.
 * @param message - What Foundry answered, if anything
 * @returns The hint
 */
export function failureHint(message: string | undefined): string {
  const download = message === undefined ? undefined : failedDownload(message);
  return download === undefined
    ? localize('Failure.ManifestHint')
    : format(HINTS[download.why], { host: download.host });
}
