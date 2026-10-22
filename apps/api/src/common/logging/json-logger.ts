import { ConsoleLogger, LoggerService } from '@nestjs/common';

/** LOG_FORMAT=json (the default in production) prints one JSON object per line, ready for any log tool; "pretty" is Nest's readable console output. */
export const jsonLogs = (env: NodeJS.ProcessEnv = process.env): boolean => (env.LOG_FORMAT || (env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';
const NAME: Record<Level, string> = { log: 'info', error: 'error', warn: 'warn', debug: 'debug', verbose: 'debug', fatal: 'fatal' };

/** One line of text with no line breaks, so a caller cannot forge a second log line. */
export const oneLine = (v: unknown, max = 500): string => String(v ?? '').replace(/[\r\n\t\u0000-\u001f]+/g, ' ').slice(0, max);

export class JsonLogger implements LoggerService {
  constructor(private readonly write: (line: string, level: Level) => void = (line, level) => (level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(line + '\n')) {}

  private emit(level: Level, message: unknown, rest: unknown[]) {
    // Nest calls (message, context) and, for errors, (message, stack, context)
    const strings = rest.filter((r): r is string => typeof r === 'string');
    const context = strings.length ? strings[strings.length - 1] : undefined;
    const stack = level === 'error' && strings.length > 1 ? strings[0] : undefined;
    const fields = message && typeof message === 'object' && !(message instanceof Error) ? (message as Record<string, unknown>) : { msg: message instanceof Error ? message.message : String(message) };
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level: NAME[level], context, ...fields };
    if (stack) entry.stack = stack;
    else if (message instanceof Error) entry.stack = message.stack;
    this.write(JSON.stringify(entry), level);
  }
  log(m: unknown, ...r: unknown[]) { this.emit('log', m, r); }
  error(m: unknown, ...r: unknown[]) { this.emit('error', m, r); }
  warn(m: unknown, ...r: unknown[]) { this.emit('warn', m, r); }
  debug(m: unknown, ...r: unknown[]) { this.emit('debug', m, r); }
  verbose(m: unknown, ...r: unknown[]) { this.emit('verbose', m, r); }
  fatal(m: unknown, ...r: unknown[]) { this.emit('fatal', m, r); }
}

/** The logger the server starts with. */
export const makeLogger = (): LoggerService => (jsonLogs() ? new JsonLogger() : new ConsoleLogger());

/** Log an event with fields: a JSON object in json mode, a readable line otherwise. */
export function logEvent(log: { log(m: unknown): void; error(m: unknown): void; warn(m: unknown): void }, level: 'log' | 'warn' | 'error', fields: Record<string, unknown> & { msg: string }) {
  const out = jsonLogs() ? fields : `${fields.msg} ${Object.entries(fields).filter(([k, v]) => k !== 'msg' && v !== undefined && v !== '').map(([k, v]) => `${k}=${oneLine(v, 200)}`).join(' ')}`;
  log[level](out);
}
