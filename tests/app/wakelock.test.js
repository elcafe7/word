import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as wakelock from '../../src/app/wakelock.js';

let hidden = false;
let request;
let sentinel;

function mockSentinel() {
  const s = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
      s._onRelease?.();
    }),
    addEventListener: vi.fn((type, fn) => {
      if (type === 'release') s._onRelease = fn;
    }),
  };
  return s;
}

beforeAll(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  wakelock.init();
});

beforeEach(() => {
  hidden = false;
  sentinel = mockSentinel();
  request = vi.fn(async () => sentinel);
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    writable: true,
    value: { request },
  });
});

afterEach(async () => {
  await wakelock.release();
  vi.restoreAllMocks();
});

describe('wakelock', () => {
  it('requests a screen lock while playing', async () => {
    await wakelock.request();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinel.addEventListener).toHaveBeenCalledWith('release', expect.any(Function));
  });

  it('is a no-op when wakeLock is missing', async () => {
    delete navigator.wakeLock;
    await wakelock.request();
    expect(request).not.toHaveBeenCalled();
  });

  it('is a no-op when the tab is hidden', async () => {
    hidden = true;
    await wakelock.request();
    expect(request).not.toHaveBeenCalled();
  });

  it('swallows request errors', async () => {
    request.mockRejectedValueOnce(new Error('denied'));
    await expect(wakelock.request()).resolves.toBeUndefined();
  });

  it('does not request twice while the lock is held', async () => {
    await wakelock.request();
    await wakelock.request();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases the lock on pause', async () => {
    await wakelock.request();
    await wakelock.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(sentinel.released).toBe(true);
  });

  it('swallows release errors', async () => {
    sentinel.release.mockRejectedValueOnce(new Error('gone'));
    await wakelock.request();
    await expect(wakelock.release()).resolves.toBeUndefined();
  });

  it('re-requests on visibilitychange when the tab is visible again', async () => {
    await wakelock.request();
    expect(request).toHaveBeenCalledTimes(1);
    hidden = true;
    sentinel.released = true;
    sentinel._onRelease?.();
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does not re-request on visibilitychange after release', async () => {
    await wakelock.request();
    await wakelock.release();
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('init is safe to call more than once', async () => {
    wakelock.init();
    wakelock.init();
    await wakelock.request();
    hidden = true;
    sentinel.released = true;
    sentinel._onRelease?.();
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
