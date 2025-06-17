// Main exports for the WebSocket module
export { WebSocketService, setGlobalWebSocketService, getGlobalWebSocketService } from './websocket-service';
export { TickerStreamManager } from './streams/ticker-stream-manager';
export { KlineStreamManager } from './streams/kline-stream-manager';
export { TradingOperationsManager } from './managers/trading-operations-manager';
export { MessageHandler } from './handlers/message-handler';

// Type exports
export * from './types';
