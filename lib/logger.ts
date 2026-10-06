// Tiny logger: debug/info are compiled out of release builds so we never ship
// payload dumps to vendors' devices; warn/error always go through so crash
// reporters and `adb logcat` still see real failures.

import * as Sentry from "@sentry/react-native";

declare const __DEV__: boolean;

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

type Fields = Record<string, unknown>;

function format(scope: string, msg: string, fields?: Fields): string {
  if (!fields || Object.keys(fields).length === 0) return `[${scope}] ${msg}`;
  return `[${scope}] ${msg} ${JSON.stringify(fields)}`;
}

export function createLogger(scope: string) {
  return {
    debug(msg: string, fields?: Fields): void {
      if (isDev) console.log(format(scope, msg, fields));
    },
    info(msg: string, fields?: Fields): void {
      if (isDev) console.info(format(scope, msg, fields));
    },
    warn(msg: string, err?: unknown, fields?: Fields): void {
      console.warn(format(scope, msg, fields), err instanceof Error ? err.message : err ?? "");
    },
    error(msg: string, err?: unknown, fields?: Fields): void {
      console.error(format(scope, msg, fields), err instanceof Error ? err.message : err ?? "");
      // Errors (not warnings) also go to crash reporting when it is configured.
      Sentry.captureException(err instanceof Error ? err : new Error(`${scope}: ${msg}`), { tags: { scope }, extra: fields });
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
