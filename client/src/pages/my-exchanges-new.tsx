import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUserWebSocket } from "@/hooks/useWebSocketService";

interface Exchange {
  id: number;
  name: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  wsApiEndpoint?: string;
  wsStreamEndpoint?: string;
  restApiEndpoint?: string;
  exchangeType?: string;
  isTestnet?: boolean;
}

export default function MyExchanges() {
  const [activeSection, setActiveSection] = useState('general');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [selectedExchange, setSelectedExchange] = useState('');
  const [mode, setMode] = useState('testnet');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [wsApiEndpoint, setWsApiEndpoint] = useState('');
  const [wsStreamEndpoint, setWsStreamEndpoint] = useState('');
  const [restApiEndpoint, setRestApiEndpoint] = useState('');
  const [exchangeBalances, setExchangeBalances] = useState<Record<number, { balance: string; loading: boolean; error?: string }>>({});
  const [currentExchangeId, setCurrentExchangeId] = useState<number | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Calculate total USDT balance from all assets
  const calculateTotalUsdtBalance = (balances: any[]) => {
    if (!balances || !Array.isArray(balances)) return '0.00';
    
    // Find USDT balance first
    const usdtBalance = balances.find(b => b.asset === 'USDT');
    if (usdtBalance) {
      return parseFloat(usdtBalance.free || '0').toFixed(2);
    }
    
    // If no USDT, return first available balance
    if (balances.length > 0) {
      return parseFloat(balances[0].free || '0').toFixed(2);
    }
    
    return '0.00';
  };

  // WebSocket for balance fetching (simplified approach like Settings page)
  const userWs = useUserWebSocket({
    onMessage: (data) => {
      console.log('Balance WebSocket response:', data);
      
      if (data.type === 'balance_update' && data.data?.balances) {
        const targetExchangeId = currentExchangeId || (exchanges?.length > 0 ? exchanges[0].id : null);
        
        if (targetExchangeId) {
          const totalUsdtValue = calculateTotalUsdtBalance(data.data.balances);
          console.log('✅ Balance fetched via WebSocket API:', totalUsdtValue, 'USDT');
          
          setExchangeBalances(prev => ({
            ...prev,
            [targetExchangeId]: { balance: totalUsdtValue, loading: false }
          }));
        }
      }
    },
    onConnect: () => {
      console.log('User WebSocket connected');
    },
    onDisconnect: () => {
      console.log('User WebSocket disconnected');
    },
    onError: (error) => {
      console.error('User WebSocket error:', error);
    }
  });

  // Mask API key to show only first 3 characters and last 3, with proper truncation
  const maskApiKey = (apiKey: string) => {
    if (!apiKey || apiKey.length < 6) return '***';
    if (apiKey.length > 20) {
      // Truncate very long keys to fit card layout
      return apiKey.substring(0, 3) + '***' + apiKey.substring(apiKey.length - 3);
    }
    return apiKey.substring(0, 3) + '*'.repeat(Math.max(3, apiKey.length - 6)) + apiKey.substring(apiKey.length - 3);
  };

  // Fetch exchanges
  const { data: exchanges = [], isLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Auto-fetch balances when exchanges are loaded (once only)
  useEffect(() => {
    if (exchanges && exchanges.length > 0) {
      exchanges.forEach(exchange => {
        if (exchange.isActive && exchange.apiKey && exchange.wsApiEndpoint) {
          console.log(`Auto-fetching balance for exchange: ${exchange.name}`);
          
          // Set loading state
          setExchangeBalances(prev => ({
            ...prev,
            [exchange.id]: { balance: '0.00', loading: true }
          }));
          
          // Set current exchange for message handling
          setCurrentExchangeId(exchange.id);
          
          // Connect using WebSocket API (same as Settings page)
          userWs.connect(exchange.apiKey);
        }
      });
    }
  }, [exchanges]);

  // Simplified balance fetching using WebSocket API (like Settings page)
  const fetchExchangeBalance = (exchange: Exchange) => {
    if (!exchange.wsApiEndpoint) {
      console.warn('WebSocket API endpoint not configured for exchange:', exchange.name);
      return;
    }

    console.log(`Fetching balance for exchange: ${exchange.name}`);
    
    // Set loading state
    setExchangeBalances(prev => ({
      ...prev,
      [exchange.id]: { balance: '0.00', loading: true }
    }));
    
    // Set current exchange for message handling
    setCurrentExchangeId(exchange.id);
    
    // Connect using WebSocket API (same approach as Settings page)
    userWs.connect(exchange.apiKey);
  };

  // Add exchange mutation
  const addExchangeMutation = useMutation({
    mutationFn: async (exchangeData: any) => {
      return await apiRequest('/api/exchanges', 'POST', exchangeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Exchange Added",
        description: "Exchange has been successfully added and configured.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add exchange",
        variant: "destructive",
      });
    },
  });

  // Update exchange mutation
  const updateExchangeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest(`/api/exchanges/${id}`, 'PUT', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsEditDialogOpen(false);
      resetEditForm();
      toast({
        title: "Exchange Updated",
        description: "Exchange has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update exchange",
        variant: "destructive",
      });
    },
  });

  // Delete exchange mutation
  const deleteExchangeMutation = useMutation({
    mutationFn: async (exchangeId: number) => {
      return await apiRequest(`/api/exchanges/${exchangeId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Removed",
        description: "Exchange has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove exchange",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedExchange('');
    setApiKey('');
    setApiSecret('');
    setWsApiEndpoint('');
    setWsStreamEndpoint('');
    setRestApiEndpoint('');
    setMode('testnet');
  };

  const resetEditForm = () => {
    setEditingExchange(null);
    setApiKey('');
    setApiSecret('');
    setWsApiEndpoint('');
    setWsStreamEndpoint('');
    setRestApiEndpoint('');
  };

  const handleSubmit = () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const exchangeData = {
      name: selectedExchange,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      wsApiEndpoint: wsApiEndpoint.trim() || getDefaultWsApiEndpoint(),
      wsStreamEndpoint: wsStreamEndpoint.trim() || getDefaultWsStreamEndpoint(),
      restApiEndpoint: restApiEndpoint.trim() || getDefaultRestApiEndpoint(),
      exchangeType: selectedExchange,
      isTestnet: mode === 'testnet'
    };

    addExchangeMutation.mutate(exchangeData);
  };

  const getDefaultWsApiEndpoint = () => {
    const baseUrl = mode === 'testnet' ? 'wss://testnet.binance.vision' : 'wss://ws-api.binance.com:443';
    return `${baseUrl}/ws-api/v3`;
  };

  const getDefaultWsStreamEndpoint = () => {
    const baseUrl = mode === 'testnet' ? 'wss://stream.testnet.binance.vision' : 'wss://stream.binance.com:9443';
    return baseUrl;
  };

  const getDefaultRestApiEndpoint = () => {
    return mode === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  };

  const handleEditExchange = (exchange: Exchange) => {
    setEditingExchange(exchange);
    setApiKey(''); // Don't prefill for security
    setApiSecret(''); // Don't prefill for security  
    setWsApiEndpoint(exchange.wsApiEndpoint || '');
    setWsStreamEndpoint(exchange.wsStreamEndpoint || '');
    setRestApiEndpoint(exchange.restApiEndpoint || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateExchange = () => {
    if (!editingExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    updateExchangeMutation.mutate({
      id: editingExchange.id,
      data: {
        apiKey,
        apiSecret,
        wsApiEndpoint: wsApiEndpoint || null,
        wsStreamEndpoint: wsStreamEndpoint || null,
        restApiEndpoint: restApiEndpoint || null,
      }
    });
  };

  const handleDeleteExchange = (exchangeId: number) => {
    if (window.confirm('Are you sure you want to remove this exchange? This action cannot be undone.')) {
      deleteExchangeMutation.mutate(exchangeId);
    }
  };

  const sidebarItems = [
    { id: 'general', label: 'General', icon: 'fas fa-cog' },
  ];

  const exchangeOptions = [
    { value: 'binance', label: 'Binance' },
    { value: 'binance-us', label: 'Binance US' },
    { value: 'coinbase', label: 'Coinbase Pro' },
    { value: 'kraken', label: 'Kraken' },
    { value: 'bybit', label: 'Bybit' },
  ];

  const renderSidebar = () => (
    <div className="w-72 bg-crypto-dark p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Exchange Management</h2>
          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center space-x-3 text-sm ${
                  activeSection === item.id
                    ? 'bg-crypto-accent text-white'
                    : 'text-crypto-light hover:bg-gray-800 hover:text-white'
                }`}
              >
                <i className={`${item.icon} w-4`}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );

  const renderExchangeCard = (exchange: Exchange) => {
    const balance = exchangeBalances[exchange.id];
    const isLoading = balance?.loading || false;
    const hasError = balance?.error;

    return (
      <Card key={exchange.id} className="bg-crypto-darker border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${exchange.isActive ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <CardTitle className="text-white text-lg">{exchange.name}</CardTitle>
              {exchange.isTestnet && (
                <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">Testnet</span>
              )}
            </div>
            <div className="flex space-x-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEditExchange(exchange)}
                className="text-crypto-light hover:text-white h-8 w-8 p-0"
              >
                <i className="fas fa-edit text-sm"></i>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeleteExchange(exchange.id)}
                className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
              >
                <i className="fas fa-trash text-sm"></i>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-crypto-light text-sm">API Key</span>
              <span className="text-white text-sm font-mono">{maskApiKey(exchange.apiKey)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-crypto-light text-sm">Status</span>
              <span className={`text-sm ${exchange.isActive ? 'text-green-400' : 'text-gray-400'}`}>
                {exchange.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-crypto-light text-sm">Balance (USDT)</span>
              <div className="flex items-center space-x-2">
                {isLoading ? (
                  <div className="flex items-center space-x-1">
                    <i className="fas fa-spinner fa-spin text-crypto-light text-xs"></i>
                    <span className="text-crypto-light text-sm">Loading...</span>
                  </div>
                ) : hasError ? (
                  <span className="text-red-400 text-sm">Error</span>
                ) : (
                  <span className="text-white text-sm font-mono">${balance?.balance || '0.00'}</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fetchExchangeBalance(exchange)}
                  disabled={isLoading}
                  className="text-crypto-light hover:text-white h-6 w-6 p-0"
                >
                  <i className={`fas fa-sync-alt text-xs ${isLoading ? 'fa-spin' : ''}`}></i>
                </Button>
              </div>
            </div>
          </div>
          <div className="text-xs text-crypto-light">
            Added {new Date(exchange.createdAt).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAddExchangeDialog = () => (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
          <i className="fas fa-plus mr-2"></i>
          Add Exchange
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-crypto-darker border-gray-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Exchange</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exchange-select" className="text-crypto-light">Exchange Platform</Label>
              <Select value={selectedExchange} onValueChange={setSelectedExchange}>
                <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                  <SelectValue placeholder="Select an exchange" />
                </SelectTrigger>
                <SelectContent>
                  {exchangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="mode-select" className="text-crypto-light">Environment</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="testnet">Testnet (Recommended)</SelectItem>
                  <SelectItem value="mainnet">Mainnet (Live Trading)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="api-key" className="text-crypto-light">API Key *</Label>
              <Input
                id="api-key"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="mt-1 bg-crypto-dark border-gray-700 text-white"
              />
            </div>

            <div>
              <Label htmlFor="api-secret" className="text-crypto-light">API Secret *</Label>
              <Input
                id="api-secret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your API secret"
                className="mt-1 bg-crypto-dark border-gray-700 text-white"
              />
            </div>
          </div>

          <Separator className="bg-gray-700" />

          <div className="space-y-4">
            <h4 className="text-md font-medium text-white">WebSocket Configuration</h4>
            <p className="text-sm text-crypto-light">
              These endpoints will be auto-filled based on your selected exchange and environment.
              You can customize them if needed.
            </p>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="ws-api-endpoint" className="text-crypto-light">WebSocket API Endpoint</Label>
                <Input
                  id="ws-api-endpoint"
                  type="url"
                  value={wsApiEndpoint}
                  onChange={(e) => setWsApiEndpoint(e.target.value)}
                  placeholder={getDefaultWsApiEndpoint()}
                  className="mt-1 bg-crypto-dark border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="ws-stream-endpoint" className="text-crypto-light">WebSocket Stream Endpoint</Label>
                <Input
                  id="ws-stream-endpoint"
                  type="url"
                  value={wsStreamEndpoint}
                  onChange={(e) => setWsStreamEndpoint(e.target.value)}
                  placeholder={getDefaultWsStreamEndpoint()}
                  className="mt-1 bg-crypto-dark border-gray-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor="rest-api-endpoint" className="text-crypto-light">REST API Endpoint</Label>
                <Input
                  id="rest-api-endpoint"
                  type="url"
                  value={restApiEndpoint}
                  onChange={(e) => setRestApiEndpoint(e.target.value)}
                  placeholder={getDefaultRestApiEndpoint()}
                  className="mt-1 bg-crypto-dark border-gray-700 text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
              className="border-gray-600 text-crypto-light hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={addExchangeMutation.isPending}
              className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
            >
              {addExchangeMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Adding...
                </>
              ) : (
                <>
                  <i className="fas fa-plus mr-2"></i>
                  Add Exchange
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderEditExchangeDialog = () => (
    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent className="bg-crypto-darker border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Edit Exchange: {editingExchange?.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="edit-api-key" className="text-crypto-light">API Key</Label>
            <Input
              id="edit-api-key"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter new API key"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <div>
            <Label htmlFor="edit-api-secret" className="text-crypto-light">API Secret</Label>
            <Input
              id="edit-api-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter new API secret"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <Separator className="bg-gray-800" />

          <div>
            <Label htmlFor="edit-ws-api" className="text-crypto-light text-xs">WebSocket API Endpoint</Label>
            <Input
              id="edit-ws-api"
              type="text"
              value={wsApiEndpoint}
              onChange={(e) => setWsApiEndpoint(e.target.value)}
              placeholder="wss://ws-api.testnet.binance.vision/ws-api/v3"
              className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
            />
          </div>

          <div>
            <Label htmlFor="edit-ws-stream" className="text-crypto-light text-xs">WebSocket Stream Endpoint (Chart Data)</Label>
            <Input
              id="edit-ws-stream"
              type="text"
              value={wsStreamEndpoint}
              onChange={(e) => setWsStreamEndpoint(e.target.value)}
              placeholder="wss://stream.testnet.binance.vision/ws"
              className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
            />
            <p className="text-xs text-crypto-light/60 mt-1">
              Changes to this endpoint will affect the dashboard chart data source
            </p>
          </div>

          <div>
            <Label htmlFor="edit-rest-api" className="text-crypto-light text-xs">REST API Endpoint</Label>
            <Input
              id="edit-rest-api"
              type="text"
              value={restApiEndpoint}
              onChange={(e) => setRestApiEndpoint(e.target.value)}
              placeholder="https://testnet.binance.vision"
              className="mt-1 bg-crypto-dark border-gray-700 text-white text-sm"
            />
          </div>

          <Separator className="bg-gray-800" />

          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              className="border-gray-600 text-crypto-light hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateExchange}
              disabled={updateExchangeMutation.isPending}
              className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
            >
              {updateExchangeMutation.isPending ? 'Updating...' : 'Update'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderGeneralSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Exchange Configuration</h3>
          <p className="text-crypto-light mt-1">
            Manage your cryptocurrency exchange API connections for trading and data access.
          </p>
        </div>
        {renderAddExchangeDialog()}
      </div>

      <Separator className="bg-gray-800" />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-crypto-darker border-gray-800 animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-700 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : exchanges && exchanges.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exchanges.map(renderExchangeCard)}
        </div>
      ) : (
        <Card className="bg-crypto-darker border-gray-800">
          <CardContent className="text-center py-12">
            <div className="text-crypto-light mb-4">
              <i className="fas fa-exchange-alt text-4xl text-gray-600"></i>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Exchanges Connected</h3>
            <p className="text-crypto-light mb-6">
              Connect your first exchange to start trading and accessing market data.
            </p>
            {renderAddExchangeDialog()}
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="flex">
        {renderSidebar()}
        
        <div className="flex-1">
          <div className="p-8">
            {activeSection === 'general' && renderGeneralSection()}
          </div>
        </div>
      </div>
      
      {/* Dialogs */}
      {renderEditExchangeDialog()}
    </div>
  );
}