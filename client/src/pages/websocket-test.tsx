import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { useQuery } from "@tanstack/react-query";
import { createSubscriptionMessage } from "@/utils/websocket-helpers";

export default function WebSocketTest() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');

  // Fetch exchanges to get the first active exchange ID
  const { data: exchanges } = useQuery({
    queryKey: ['/api/exchanges']
  });

  // Get the first active exchange ID
  const getExchangeId = () => {
    if (exchanges && Array.isArray(exchanges) && exchanges.length > 0) {
      const activeExchange = exchanges.find((ex: any) => ex.isActive);
      return activeExchange?.id || exchanges[0].id;
    }
    return null;
  };

  useEffect(() => {
    console.log('[WEBSOCKET TEST] Setting up WebSocket subscription and listeners');
    
    // Add reference for this component instance
    webSocketSingleton.addReference();
    
    const unsubscribeData = webSocketSingleton.subscribe((data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev.slice(-9), `${timestamp}: ${JSON.stringify(data)}`]);
    });

    const unsubscribeConnect = webSocketSingleton.onConnect(() => {
      setConnectionStatus('connected');
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, `${timestamp}: WebSocket Connected Successfully`]);
    });

    const unsubscribeDisconnect = webSocketSingleton.onDisconnect(() => {
      setConnectionStatus('disconnected');
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, `${timestamp}: WebSocket Disconnected`]);
    });

    const unsubscribeError = webSocketSingleton.onError(() => {
      setConnectionStatus('error');
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, `${timestamp}: WebSocket Error`]);
    });

    // Set initial status
    setConnectionStatus(webSocketSingleton.getStatus());

    return () => {
      console.log('[WEBSOCKET TEST] Cleaning up WebSocket subscription and reference');
      unsubscribeData();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
      
      // Remove reference to allow proper cleanup
      webSocketSingleton.removeReference();
    };
  }, []);

  const handleConnect = () => {
    const exchangeId = getExchangeId();
    if (!exchangeId) {
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, `${timestamp}: No active exchange found. Please add an exchange first.`]);
      return;
    }

    webSocketSingleton.connect();
    webSocketSingleton.sendMessage(createSubscriptionMessage(['BTCUSDT'], exchangeId));
  };

  const handleDisconnect = () => {
    webSocketSingleton.disconnect();
  };

  const handleSubscribe = () => {
    const exchangeId = getExchangeId();
    if (!exchangeId) {
      const timestamp = new Date().toLocaleTimeString();
      setMessages(prev => [...prev, `${timestamp}: No active exchange found. Please add an exchange first.`]);
      return;
    }

    webSocketSingleton.sendMessage(createSubscriptionMessage(['ETHUSDT', 'ADAUSDT'], exchangeId));
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-6">WebSocket Connection Test</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Connection Controls */}
          <Card className="bg-crypto-dark border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Connection Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-crypto-light">Status:</span>
                <span className={`font-medium ${
                  connectionStatus === 'connected' ? 'text-green-400' :
                  connectionStatus === 'error' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleConnect}
                  disabled={connectionStatus === 'connected'}
                  className="bg-crypto-accent hover:bg-crypto-accent/80"
                >
                  Connect
                </Button>
                <Button 
                  onClick={handleDisconnect}
                  disabled={connectionStatus === 'disconnected'}
                  variant="outline"
                >
                  Disconnect
                </Button>
                <Button 
                  onClick={handleSubscribe}
                  disabled={connectionStatus !== 'connected'}
                  variant="secondary"
                >
                  Subscribe
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Connection Messages */}
          <Card className="bg-crypto-dark border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Live Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 overflow-y-auto bg-black/20 rounded p-2 space-y-1">
                {messages.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No messages yet. Click Connect to start.
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className="text-xs text-crypto-light font-mono">
                      {msg}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Technical Information */}
        <Card className="bg-crypto-dark border-gray-800 mt-6">
          <CardHeader>
            <CardTitle className="text-white">Technical Information</CardTitle>
          </CardHeader>
          <CardContent className="text-crypto-light text-sm space-y-2">
            <div>
              <strong>WebSocket URL:</strong> {window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//{window.location.hostname}:{import.meta.env.VITE_WS_PORT || '8080'}/api/ws
            </div>
            <div>
              <strong>Current Status:</strong> {connectionStatus}
            </div>
            <div>
              <strong>Last Message:</strong> {messages.length > 0 ? messages[messages.length - 1] : 'None'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}