import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BroadcastChannel {
  id: string;
  type: 'ticker' | 'kline' | 'order' | 'balance';
  subscribers: Map<string, WebSocket>;
  filters: Map<string, Set<string>>; // clientId -> symbols/intervals
}

interface BroadcastMessage {
  channel: string;
  data: any;
  targetClients?: string[]; // Optional: specific clients only
  priority?: 'high' | 'normal' | 'low';
}

export class BroadcastManager extends EventEmitter {
  private channels: Map<string, BroadcastChannel> = new Map();
  private clientChannels: Map<string, Set<string>> = new Map(); // clientId -> channelIds
  private messageQueue: BroadcastMessage[] = [];
  private workers: Worker[] = [];
  private workerIndex = 0;
  private readonly WORKER_COUNT = 4; // Configurable based on CPU cores
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly PROCESS_INTERVAL = 1; // 1ms for ultra-fast processing

  constructor() {
    super();
    this.initializeWorkers();
    this.startProcessing();
    console.log('[BROADCAST MANAGER] Initialized with pub/sub pattern');
  }
  private initializeWorkers(): void {
    // Create worker threads for parallel broadcasting
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const worker = new Worker(path.join(__dirname, 'broadcast-worker.cjs'), {
        workerData: { workerId: i }
      });
      
      worker.on('message', (result) => {
        if (result.error) {
          console.error(`[BROADCAST WORKER ${i}] Error:`, result.error);
        }
      });
      
      worker.on('error', (error) => {
        console.error(`[BROADCAST WORKER ${i}] Fatal error:`, error);
        // Restart worker
        this.restartWorker(i);
      });
      
      this.workers.push(worker);
    }
  }
  private restartWorker(index: number): void {
    const worker = new Worker(path.join(__dirname, 'broadcast-worker.cjs'), {
      workerData: { workerId: index }
    });
    this.workers[index] = worker;
    console.log(`[BROADCAST MANAGER] Restarted worker ${index}`);
  }

  // Create or get a channel
  public createChannel(channelId: string, type: 'ticker' | 'kline' | 'order' | 'balance'): void {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        id: channelId,
        type,
        subscribers: new Map(),
        filters: new Map()
      });
      console.log(`[BROADCAST MANAGER] Created channel: ${channelId} (${type})`);
    }
  }

  // Subscribe a client to a channel with optional filters
  public subscribe(clientId: string, ws: WebSocket, channelId: string, filters?: string[]): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) {
      console.error(`[BROADCAST MANAGER] Channel not found: ${channelId}`);
      return false;
    }

    // Add to channel subscribers
    channel.subscribers.set(clientId, ws);
    
    // Set filters if provided
    if (filters && filters.length > 0) {
      channel.filters.set(clientId, new Set(filters));
    } else {
      channel.filters.delete(clientId); // No filters = receive all
    }

    // Track client's channels
    if (!this.clientChannels.has(clientId)) {
      this.clientChannels.set(clientId, new Set());
    }
    this.clientChannels.get(clientId)!.add(channelId);

    console.log(`[BROADCAST MANAGER] Client ${clientId} subscribed to ${channelId} with ${filters?.length || 0} filters`);
    return true;
  }

  // Unsubscribe a client from a channel
  public unsubscribe(clientId: string, channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.subscribers.delete(clientId);
      channel.filters.delete(clientId);
    }

    const clientChannels = this.clientChannels.get(clientId);
    if (clientChannels) {
      clientChannels.delete(channelId);
      if (clientChannels.size === 0) {
        this.clientChannels.delete(clientId);
      }
    }

    console.log(`[BROADCAST MANAGER] Client ${clientId} unsubscribed from ${channelId}`);
  }

  // Remove client from all channels
  public removeClient(clientId: string): void {
    const channels = this.clientChannels.get(clientId);
    if (channels) {
      channels.forEach(channelId => {
        const channel = this.channels.get(channelId);
        if (channel) {
          channel.subscribers.delete(clientId);
          channel.filters.delete(clientId);
        }
      });
      this.clientChannels.delete(clientId);
    }
    console.log(`[BROADCAST MANAGER] Removed client ${clientId} from all channels`);
  }

  // Broadcast a message to a channel
  public broadcast(channelId: string, data: any, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    if (!this.channels.has(channelId)) {
      console.error(`[BROADCAST MANAGER] Cannot broadcast to non-existent channel: ${channelId}`);
      return;
    }

    const message: BroadcastMessage = {
      channel: channelId,
      data,
      priority
    };

    if (priority === 'high') {
      // Process high priority messages immediately
      this.processMessage(message);
    } else {
      // Queue normal and low priority messages
      this.messageQueue.push(message);
    }
  }

  // Process a single broadcast message
  private processMessage(message: BroadcastMessage): void {
    const channel = this.channels.get(message.channel);
    if (!channel) return;

    const subscribers = Array.from(channel.subscribers.entries());
    if (subscribers.length === 0) return;

    // Filter subscribers based on their filters
    const filteredSubscribers = subscribers.filter(([clientId, ws]) => {
      // Check if WebSocket is still open
      if (ws.readyState !== WebSocket.OPEN) {
        this.removeClient(clientId);
        return false;
      }

      // Check filters
      const filters = channel.filters.get(clientId);
      if (!filters || filters.size === 0) {
        return true; // No filters = receive all
      }

      // Apply filters based on channel type
      if (channel.type === 'ticker' && message.data.symbol) {
        return filters.has(message.data.symbol);
      } else if (channel.type === 'kline' && message.data.symbol) {
        const filterKey = `${message.data.symbol}_${message.data.interval}`;
        return filters.has(filterKey);
      }

      return true;
    });

    if (filteredSubscribers.length === 0) return;

    // Distribute to workers for parallel processing
    const workerPayloads: Map<number, Array<[string, WebSocket]>> = new Map();
    
    filteredSubscribers.forEach((subscriber, index) => {
      const workerIdx = index % this.WORKER_COUNT;
      if (!workerPayloads.has(workerIdx)) {
        workerPayloads.set(workerIdx, []);
      }
      workerPayloads.get(workerIdx)!.push(subscriber);
    });

    // Send to workers
    workerPayloads.forEach((subscribers, workerIdx) => {
      this.workers[workerIdx].postMessage({
        type: 'broadcast',
        channel: message.channel,
        data: message.data,
        subscribers: subscribers.map(([clientId]) => clientId),
        payload: JSON.stringify(message.data)
      });

      // Direct send for now (workers can be fully implemented later)
      subscribers.forEach(([clientId, ws]) => {
        try {
          ws.send(JSON.stringify(message.data));
        } catch (error) {
          console.error(`[BROADCAST MANAGER] Error sending to ${clientId}:`, error);
          this.removeClient(clientId);
        }
      });
    });
  }

  // Process message queue
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      if (this.messageQueue.length === 0) return;

      // Process in batches
      const batch = this.messageQueue.splice(0, this.BATCH_SIZE);
      
      // Sort by priority
      batch.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority || 'normal'] - priorityOrder[b.priority || 'normal'];
      });

      // Process each message
      batch.forEach(message => this.processMessage(message));
    }, this.PROCESS_INTERVAL);
  }

  // Get channel statistics
  public getStats(): any {
    const stats: any = {
      channels: {},
      totalSubscribers: 0,
      queueLength: this.messageQueue.length
    };

    this.channels.forEach((channel, channelId) => {
      stats.channels[channelId] = {
        type: channel.type,
        subscribers: channel.subscribers.size,
        withFilters: channel.filters.size
      };
      stats.totalSubscribers += channel.subscribers.size;
    });

    return stats;
  }

  // Cleanup
  public shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Terminate workers
    this.workers.forEach(worker => worker.terminate());
    
    // Clear all data
    this.channels.clear();
    this.clientChannels.clear();
    this.messageQueue = [];
    
    console.log('[BROADCAST MANAGER] Shutdown complete');
  }
}

// Singleton instance
export const broadcastManager = new BroadcastManager();
