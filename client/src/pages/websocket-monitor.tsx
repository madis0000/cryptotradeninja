import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { webSocketSingleton } from "@/services/WebSocketSingleton";
import { useMarketData } from "@/hooks/useMarketData";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";

export default function WebSocketMonitor() {
  const [referenceCount, setReferenceCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [testHookActive, setTestHookActive] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  // Test hook that we can toggle on/off to test cleanup
  const TestHookComponent = () => {
    const marketData = useMarketData();
    useOrderNotifications();
    
    useEffect(() => {
      console.log('[TEST HOOK] Test hook component mounted');
      addMessage('Test hook component mounted');
      
      return () => {
        console.log('[TEST HOOK] Test hook component unmounted');
        addMessage('Test hook component unmounted');
      };
    }, []);
    
    return (
      <div className="p-4 bg-green-100 rounded">
        <p>Test Hook Active - Using useMarketData and useOrderNotifications</p>
        <p>Market Data Items: {marketData.marketData.length}</p>
        <p>Connected: {marketData.isConnected ? 'Yes' : 'No'}</p>
      </div>
    );
  };

  const addMessage = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [`${timestamp}: ${msg}`, ...prev.slice(0, 19)]);
  };
  useEffect(() => {
    // Monitor WebSocket reference count
    const interval = setInterval(() => {
      const refCount = webSocketSingleton.getReferenceCount();
      setReferenceCount(refCount);
      setConnectionStatus(webSocketSingleton.getStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleToggleTestHook = () => {
    setTestHookActive(!testHookActive);
    addMessage(`Test hook ${!testHookActive ? 'activated' : 'deactivated'}`);
  };

  const handleForceConnect = () => {
    webSocketSingleton.addReference();
    webSocketSingleton.connect();
    addMessage('Forced WebSocket connection');
  };

  const handleForceDisconnect = () => {
    webSocketSingleton.removeReference();
    addMessage('Removed WebSocket reference');
  };

  const handleClearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">WebSocket Connection Monitor</h1>
      
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Status:</strong> <span className={connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'}>{connectionStatus}</span></p>
              <p><strong>Reference Count:</strong> {referenceCount}</p>
              <p><strong>Test Hook:</strong> {testHookActive ? 'Active' : 'Inactive'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={handleToggleTestHook} className="w-full">
              {testHookActive ? 'Deactivate' : 'Activate'} Test Hook
            </Button>
            <Button onClick={handleForceConnect} variant="outline" className="w-full">
              Force Connect
            </Button>
            <Button onClick={handleForceDisconnect} variant="outline" className="w-full">
              Remove Reference
            </Button>
            <Button onClick={handleClearMessages} variant="secondary" className="w-full">
              Clear Messages
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Component</CardTitle>
          </CardHeader>
          <CardContent>
            {testHookActive ? <TestHookComponent /> : (
              <div className="p-4 bg-gray-100 rounded">
                <p>Test hook inactive</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {messages.length === 0 ? (
              <p className="text-gray-500">No messages yet...</p>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className="text-sm font-mono p-2 bg-gray-50 rounded">
                  {msg}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p><strong>Testing WebSocket Cleanup:</strong></p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click "Activate Test Hook" to mount a component that uses WebSocket hooks</li>
              <li>Watch the Reference Count increase</li>
              <li>Click "Deactivate Test Hook" to unmount the component</li>
              <li>Verify that the Reference Count decreases back to the original value</li>
              <li>If Reference Count doesn't decrease, there's a cleanup issue</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
