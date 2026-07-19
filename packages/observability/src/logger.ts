/**
 * Structured logger for workflow/app processes.
 *
 * Everything goes to STDERR: stdout is reserved for RunEvent NDJSON (the
 * event stream consumed by the coordinator / demo tooling), so logs and
 * events never interleave on the same stream.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(name: string): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVEL_ORDER[env] ?? LEVEL_ORDER.info;
}

export function createLogger(name: string): Logger {
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < minLevel()) return;
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      logger: name,
      msg,
      ...fields,
    };
    process.stderr.write(
      `${JSON.stringify(line, (_, v) => (typeof v === "bigint" ? v.toString() : v))}\n`,
    );
  };
  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (child) => createLogger(`${name}.${child}`),
  };
}
