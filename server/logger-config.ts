// Logger configuration for focused Martingale strategy logging
export class LoggerConfig {
  private static enabledCategories = new Set([
    'MARTINGALE_STRATEGY',
    'ORDER_MONITOR',
    'BOT_CREATION',
    'CRITICAL_ERROR'
  ]);

  private static disabledCategories = new Set([
    'WEBSOCKET',
    'BINANCE_STREAM', 
    'KLINE_STREAM',
    'BALANCE',
    'TICKER'
  ]);

  static log(category: string, message: string, ...args: any[]) {
    if (this.enabledCategories.has(category)) {
      console.log(`[${category}] ${message}`, ...args);
    }
  }

  static error(category: string, message: string, ...args: any[]) {
    if (this.enabledCategories.has(category) || category === 'CRITICAL_ERROR') {
      console.error(`[${category}] ${message}`, ...args);
    }
  }

  static isEnabled(category: string): boolean {
    return this.enabledCategories.has(category);
  }

  static isDisabled(category: string): boolean {
    return this.disabledCategories.has(category);
  }
}