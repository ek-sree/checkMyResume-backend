type Level = 'error' | 'warn' | 'info' | 'debug';

const levels: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const current = (process.env.LOG_LEVEL as Level) || 'info';

function emit(level: Level, args: unknown[]): void {
  if (levels[level] > levels[current]) return;
  const time = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  const sink = level === 'debug' ? console.log : console[level];
  sink(`[${time}] ${tag}`, ...args);
}

export const logger = {
  error: (...args: unknown[]) => emit('error', args),
  warn: (...args: unknown[]) => emit('warn', args),
  info: (...args: unknown[]) => emit('info', args),
  debug: (...args: unknown[]) => emit('debug', args),
};
