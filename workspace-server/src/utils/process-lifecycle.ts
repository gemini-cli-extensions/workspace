/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ShutdownReason =
  | 'stdin-end'
  | 'stdin-close'
  | 'disconnect'
  | 'SIGINT'
  | 'SIGTERM';

interface EventSource {
  once(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

interface StdinEventSource extends EventSource {
  destroyed?: boolean;
  readableEnded?: boolean;
}

export interface ProcessLifecycleOptions {
  close: () => Promise<void>;
  stdin?: StdinEventSource;
  signals?: EventSource;
  exit?: (code: number) => void;
  onError?: (reason: ShutdownReason, error: unknown) => void;
}

export interface ProcessLifecycleController {
  dispose: () => void;
  getShutdownPromise: () => Promise<void> | undefined;
  shutdown: (reason: ShutdownReason) => Promise<void>;
}

const SIGNAL_EXIT_CODES: Partial<Record<ShutdownReason, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

/**
 * Installs the process-level lifecycle events that are outside the MCP stdio
 * transport's responsibility. All events share one shutdown promise so the
 * server close operation runs at most once.
 */
export function installProcessLifecycle(
  options: ProcessLifecycleOptions,
): ProcessLifecycleController {
  const stdin = options.stdin ?? process.stdin;
  const signals = options.signals ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const onError =
    options.onError ??
    ((reason: ShutdownReason, error: unknown) => {
      console.error(`Failed to close MCP server after ${reason}:`, error);
    });

  let disposed = false;
  let shutdownPromise: Promise<void> | undefined;
  let requestedExitCode: number | undefined;

  const onStdinEnd = () => {
    void shutdown('stdin-end');
  };
  const onStdinClose = () => {
    void shutdown('stdin-close');
  };
  const onDisconnect = () => {
    void shutdown('disconnect');
  };
  const onSigint = () => {
    void shutdown('SIGINT');
  };
  const onSigterm = () => {
    void shutdown('SIGTERM');
  };

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    stdin.off('end', onStdinEnd);
    stdin.off('close', onStdinClose);
    signals.off('disconnect', onDisconnect);
    signals.off('SIGINT', onSigint);
    signals.off('SIGTERM', onSigterm);
  }

  function shutdown(reason: ShutdownReason): Promise<void> {
    const signalExitCode = SIGNAL_EXIT_CODES[reason];
    if (signalExitCode !== undefined) {
      requestedExitCode = signalExitCode;
    }

    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      let closeFailed = false;

      try {
        await options.close();
      } catch (error) {
        closeFailed = true;
        onError(reason, error);
      } finally {
        dispose();
      }

      if (closeFailed) {
        exit(1);
      } else if (requestedExitCode !== undefined) {
        exit(requestedExitCode);
      }
    })();

    return shutdownPromise;
  }

  stdin.once('end', onStdinEnd);
  stdin.once('close', onStdinClose);
  signals.once('disconnect', onDisconnect);
  signals.once('SIGINT', onSigint);
  signals.once('SIGTERM', onSigterm);

  if (stdin.readableEnded || stdin.destroyed) {
    void shutdown('stdin-close');
  }

  return {
    dispose,
    getShutdownPromise: () => shutdownPromise,
    shutdown,
  };
}
