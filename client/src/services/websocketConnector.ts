interface ConnectionAttempt {
  url: string;
  description: string;
  priority: number;
}

export class WebSocketConnector {
  static async connect(): Promise<{ ws: WebSocket; url: string }> {
    const isSecure = window.location.protocol === 'https:';
    const hostname = window.location.hostname;
    const isDevelopment = import.meta.env.DEV;
    const currentPort = window.location.port;
    
    console.log('[WS CONNECTOR] Environment detection:', {
      isSecure,
      hostname,
      isDevelopment,
      currentPort,
      location: window.location.href
    });

    // Build connection attempts in priority order
    const attempts: ConnectionAttempt[] = [];

    if (isSecure) {
      // HTTPS environment: Must use secure WebSocket
      if (currentPort) {
        attempts.push({
          url: `wss://${hostname}:${currentPort}/trading-ws`,
          description: 'Secure WebSocket on current port with /trading-ws path',
          priority: 1
        });
      }
      attempts.push({
        url: `wss://${hostname}/trading-ws`,
        description: 'Secure WebSocket on default HTTPS port with /trading-ws path',
        priority: 2
      });
    } else {
      // HTTP environment: Can use insecure WebSocket
      if (isDevelopment && hostname === 'localhost') {
        attempts.push({
          url: `ws://${hostname}:3001/ws`,
          description: 'Development WebSocket on port 3001',
          priority: 1
        });
      }
      
      if (currentPort) {
        attempts.push({
          url: `ws://${hostname}:${currentPort}/trading-ws`,
          description: 'WebSocket on current port with /trading-ws path',
          priority: 2
        });
      }
      
      attempts.push({
        url: `ws://${hostname}/trading-ws`,
        description: 'WebSocket on default port with /trading-ws path',
        priority: 3
      });
      
      attempts.push({
        url: `ws://${hostname}:3001/ws`,
        description: 'WebSocket fallback on port 3001',
        priority: 4
      });
    }

    // Sort by priority
    attempts.sort((a, b) => a.priority - b.priority);

    console.log('[WS CONNECTOR] Connection attempts planned:', attempts);

    // Try each connection attempt
    for (const attempt of attempts) {
      try {
        console.log(`[WS CONNECTOR] Attempting: ${attempt.description}`);
        console.log(`[WS CONNECTOR] URL: ${attempt.url}`);
        
        const ws = await this.createWebSocketWithTimeout(attempt.url, 5000);
        console.log(`[WS CONNECTOR] ✅ Successfully connected: ${attempt.description}`);
        
        return { ws, url: attempt.url };
      } catch (error) {
        console.warn(`[WS CONNECTOR] ❌ Failed: ${attempt.description}`, error);
        continue;
      }
    }
    
    throw new Error('All WebSocket connection attempts failed');
  }

  private static createWebSocketWithTimeout(url: string, timeout: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        
        const timeoutId = setTimeout(() => {
          ws.close();
          reject(new Error(`Connection timeout after ${timeout}ms`));
        }, timeout);

        ws.onopen = () => {
          clearTimeout(timeoutId);
          resolve(ws);
        };

        ws.onerror = (error) => {
          clearTimeout(timeoutId);
          reject(error);
        };

        ws.onclose = () => {
          clearTimeout(timeoutId);
          reject(new Error('Connection closed before opening'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}