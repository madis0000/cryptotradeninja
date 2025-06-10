import fs from 'fs';
import path from 'path';

export class BotLogger {
  private botId: number;
  private tradingPair: string;
  private logFilePath: string;

  constructor(botId: number, tradingPair: string) {
    this.botId = botId;
    this.tradingPair = tradingPair;
    this.logFilePath = path.join(process.cwd(), 'logs', `bot_${botId}_${tradingPair}.log`);
    
    // Ensure logs directory exists
    const logsDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  private writeLog(level: string, category: string, message: string, data?: any): void {
    const timestamp = this.formatTimestamp();
    let logEntry = `[${timestamp}] [${level}] [${category}] ${message}`;
    
    if (data) {
      logEntry += `\n${JSON.stringify(data, null, 2)}`;
    }
    
    logEntry += '\n';
    
    try {
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  // Bot lifecycle logging
  logBotCreated(botConfig: any): void {
    this.writeLog('INFO', 'BOT_LIFECYCLE', `Bot ${this.botId} created for ${this.tradingPair}`, {
      botId: this.botId,
      tradingPair: this.tradingPair,
      strategy: botConfig.strategy,
      direction: botConfig.direction,
      baseOrderAmount: botConfig.baseOrderAmount,
      safetyOrderAmount: botConfig.safetyOrderAmount,
      maxSafetyOrders: botConfig.maxSafetyOrders,
      priceDeviation: botConfig.priceDeviation,
      takeProfitPercentage: botConfig.takeProfitPercentage,
      exchangeId: botConfig.exchangeId,
      isActive: botConfig.isActive
    });
  }

  logBotStarted(): void {
    this.writeLog('INFO', 'BOT_LIFECYCLE', `Bot ${this.botId} started trading`);
  }

  logBotStopped(reason: string = 'Manual stop'): void {
    this.writeLog('INFO', 'BOT_LIFECYCLE', `Bot ${this.botId} stopped`, { reason });
  }

  logBotDeleted(): void {
    this.writeLog('INFO', 'BOT_LIFECYCLE', `Bot ${this.botId} deleted`);
  }

  // Cycle logging
  logCycleStarted(cycleNumber: number, cycleId: number): void {
    this.writeLog('INFO', 'CYCLE', `Cycle #${cycleNumber} started`, {
      cycleId,
      cycleNumber,
      botId: this.botId
    });
  }

  logCycleCompleted(cycleNumber: number, cycleId: number, profit: number, duration: string): void {
    this.writeLog('INFO', 'CYCLE', `Cycle #${cycleNumber} completed`, {
      cycleId,
      cycleNumber,
      profit,
      duration,
      botId: this.botId
    });
  }

  logCycleFailed(cycleNumber: number, cycleId: number, error: string): void {
    this.writeLog('ERROR', 'CYCLE', `Cycle #${cycleNumber} failed`, {
      cycleId,
      cycleNumber,
      error,
      botId: this.botId
    });
  }

  // Order logging
  logOrderPlaced(orderData: any): void {
    this.writeLog('INFO', 'ORDER', 'Order placed', {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      type: orderData.type,
      side: orderData.side,
      quantity: orderData.quantity,
      price: orderData.price,
      status: orderData.status,
      cycleId: orderData.cycleId
    });
  }

  logOrderFilled(orderData: any): void {
    this.writeLog('INFO', 'ORDER', 'Order filled', {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      type: orderData.type,
      side: orderData.side,
      filledQuantity: orderData.filledQuantity,
      filledPrice: orderData.filledPrice,
      cycleId: orderData.cycleId
    });
  }

  logOrderCancelled(orderData: any): void {
    this.writeLog('INFO', 'ORDER', 'Order cancelled', {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      type: orderData.type,
      side: orderData.side,
      reason: orderData.reason || 'Manual cancellation',
      cycleId: orderData.cycleId
    });
  }

  logOrderFailed(orderData: any, error: string): void {
    this.writeLog('ERROR', 'ORDER', 'Order failed', {
      orderId: orderData.id,
      type: orderData.type,
      side: orderData.side,
      quantity: orderData.quantity,
      price: orderData.price,
      error,
      cycleId: orderData.cycleId
    });
  }

  // Strategy logging
  logStrategyAction(action: string, details: any): void {
    this.writeLog('INFO', 'STRATEGY', action, details);
  }

  logStrategyError(action: string, error: string, details?: any): void {
    this.writeLog('ERROR', 'STRATEGY', `${action} failed: ${error}`, details);
  }

  // Martingale specific logging
  logBaseOrderExecution(orderData: any): void {
    this.writeLog('INFO', 'MARTINGALE', 'Base order execution started', {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      price: orderData.price,
      quantity: orderData.quantity,
      cycleId: orderData.cycleId
    });
  }

  logSafetyOrderExecution(orderData: any, safetyOrderNumber: number): void {
    this.writeLog('INFO', 'MARTINGALE', `Safety order #${safetyOrderNumber} execution`, {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      price: orderData.price,
      quantity: orderData.quantity,
      safetyOrderNumber,
      cycleId: orderData.cycleId
    });
  }

  logTakeProfitExecution(orderData: any): void {
    this.writeLog('INFO', 'MARTINGALE', 'Take profit order execution', {
      orderId: orderData.id,
      exchangeOrderId: orderData.exchangeOrderId,
      price: orderData.price,
      quantity: orderData.quantity,
      cycleId: orderData.cycleId
    });
  }

  logTakeProfitUpdate(oldPrice: string, newPrice: string, reason: string): void {
    this.writeLog('INFO', 'MARTINGALE', 'Take profit price updated', {
      oldPrice,
      newPrice,
      reason
    });
  }

  logPriceDeviation(currentPrice: string, entryPrice: string, deviation: string): void {
    this.writeLog('INFO', 'MARTINGALE', 'Price deviation detected', {
      currentPrice,
      entryPrice,
      deviation
    });
  }

  // Market data logging
  logMarketData(price: string, volume?: string): void {
    this.writeLog('DEBUG', 'MARKET', 'Price update', {
      price,
      volume,
      timestamp: this.formatTimestamp()
    });
  }

  // Error logging
  logError(category: string, error: string, details?: any): void {
    this.writeLog('ERROR', category, error, details);
  }

  // Warning logging
  logWarning(category: string, warning: string, details?: any): void {
    this.writeLog('WARN', category, warning, details);
  }

  // Custom logging
  logCustom(level: string, category: string, message: string, data?: any): void {
    this.writeLog(level, category, message, data);
  }

  // Performance logging
  logPerformance(action: string, duration: number, details?: any): void {
    this.writeLog('PERF', 'PERFORMANCE', `${action} took ${duration}ms`, details);
  }

  // Validation logging
  logValidation(action: string, result: boolean, details?: any): void {
    const level = result ? 'INFO' : 'WARN';
    this.writeLog(level, 'VALIDATION', `${action}: ${result ? 'PASSED' : 'FAILED'}`, details);
  }

  // Balance logging
  logBalanceUpdate(asset: string, oldBalance: string, newBalance: string): void {
    this.writeLog('INFO', 'BALANCE', 'Balance updated', {
      asset,
      oldBalance,
      newBalance,
      change: (parseFloat(newBalance) - parseFloat(oldBalance)).toString()
    });
  }

  // Connection logging
  logConnectionEvent(event: string, details?: any): void {
    this.writeLog('INFO', 'CONNECTION', event, details);
  }

  // Get log file path for external access
  getLogFilePath(): string {
    return this.logFilePath;
  }

  // Read recent logs
  getRecentLogs(lines: number = 100): string[] {
    try {
      const content = fs.readFileSync(this.logFilePath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      return [];
    }
  }

  // Clear logs
  clearLogs(): void {
    try {
      fs.writeFileSync(this.logFilePath, '');
      this.writeLog('INFO', 'SYSTEM', 'Log file cleared');
    } catch (error) {
      console.error(`Failed to clear log file: ${error}`);
    }
  }
}

// Singleton manager for bot loggers
export class BotLoggerManager {
  private static loggers: Map<number, BotLogger> = new Map();

  static getLogger(botId: number, tradingPair: string): BotLogger {
    if (!this.loggers.has(botId)) {
      this.loggers.set(botId, new BotLogger(botId, tradingPair));
    }
    return this.loggers.get(botId)!;
  }

  static removeLogger(botId: number): void {
    this.loggers.delete(botId);
  }

  static getAllLoggers(): BotLogger[] {
    return Array.from(this.loggers.values());
  }

  static logSystemEvent(event: string, details?: any): void {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const logEntry = `[${timestamp}] [INFO] [SYSTEM] ${event}\n${details ? JSON.stringify(details, null, 2) + '\n' : ''}`;
    
    const systemLogPath = path.join(process.cwd(), 'logs', 'system.log');
    try {
      fs.appendFileSync(systemLogPath, logEntry);
    } catch (error) {
      console.error(`Failed to write to system log: ${error}`);
    }
  }
}