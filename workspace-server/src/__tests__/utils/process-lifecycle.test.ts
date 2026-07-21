/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, jest } from '@jest/globals';
import { installProcessLifecycle } from '../../utils/process-lifecycle';

class FakeStdin extends EventEmitter {
  destroyed = false;
  readableEnded = false;
}

describe('installProcessLifecycle', () => {
  it('closes once when stdin ends and then closes', async () => {
    const stdin = new FakeStdin();
    const signals = new EventEmitter();
    const close = jest.fn(async () => {});
    const exit = jest.fn<(code: number) => void>();
    const controller = installProcessLifecycle({
      close,
      stdin,
      signals,
      exit,
    });

    stdin.emit('end');
    stdin.emit('close');

    await controller.getShutdownPromise();

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('upgrades an in-flight stdin shutdown when SIGTERM arrives', async () => {
    const stdin = new FakeStdin();
    const signals = new EventEmitter();
    let finishClose: (() => void) | undefined;
    const close = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    );
    const exit = jest.fn<(code: number) => void>();
    const controller = installProcessLifecycle({
      close,
      stdin,
      signals,
      exit,
    });

    stdin.emit('end');
    signals.emit('SIGTERM');

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    finishClose?.();
    await controller.getShutdownPromise();

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(143);
  });

  it('waits for close before exiting on SIGINT', async () => {
    const stdin = new FakeStdin();
    const signals = new EventEmitter();
    let finishClose: (() => void) | undefined;
    const close = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    );
    const exit = jest.fn<(code: number) => void>();
    const controller = installProcessLifecycle({
      close,
      stdin,
      signals,
      exit,
    });

    signals.emit('SIGINT');

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    finishClose?.();
    await controller.getShutdownPromise();

    expect(exit).toHaveBeenCalledWith(130);
  });

  it('reports close errors and exits with failure for a signal', async () => {
    const stdin = new FakeStdin();
    const signals = new EventEmitter();
    const error = new Error('close failed');
    const onError = jest.fn<(reason: string, error: unknown) => void>();
    const exit = jest.fn<(code: number) => void>();
    const controller = installProcessLifecycle({
      close: jest.fn(async () => {
        throw error;
      }),
      stdin,
      signals,
      exit,
      onError,
    });

    signals.emit('SIGTERM');
    await controller.getShutdownPromise();

    expect(onError).toHaveBeenCalledWith('SIGTERM', error);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('closes immediately when stdin had already ended', async () => {
    const stdin = new FakeStdin();
    stdin.readableEnded = true;
    const close = jest.fn(async () => {});
    const controller = installProcessLifecycle({
      close,
      stdin,
      signals: new EventEmitter(),
      exit: jest.fn<(code: number) => void>(),
    });

    await controller.getShutdownPromise();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('removes listeners without closing when disposed', () => {
    const stdin = new FakeStdin();
    const signals = new EventEmitter();
    const close = jest.fn(async () => {});
    const controller = installProcessLifecycle({ close, stdin, signals });

    controller.dispose();
    stdin.emit('end');
    signals.emit('SIGTERM');

    expect(close).not.toHaveBeenCalled();
    expect(stdin.listenerCount('end')).toBe(0);
    expect(stdin.listenerCount('close')).toBe(0);
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  });
});
