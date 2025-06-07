import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Trash2, Settings, RefreshCw, AlertCircle } from "lucide-react";
import { useUserWebSocket } from "@/hooks/useWebSocketService";
import { EXCHANGE_OPTIONS } from "@/lib/mock-data";

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

interface ExchangeBalance {
  balance: string;
  loading: boolean;
  error?: string;
  balances?: any[];
  usdtOnly?: string;
  totalFree?: string;
  totalLocked?: string;
}

export default function MyExchanges() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for exchange balances
  const [exchangeBalances, setExchangeBalances] = useState<Record<number, ExchangeBalance>>({});
  const [currentExchangeId, setCurrentExchangeId] = useState<number | null>(null);
  
  // State for add/edit exchange dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [wsApiEndpoint, setWsApiEndpoint] = useState("");
  const [wsStreamEndpoint, setWsStreamEndpoint] = useState("");
  const [restApiEndpoint, setRestApiEndpoint] = useState("");

  // Fetch exchanges
  const { data: exchanges, isLoading: exchangesLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Helper functions for balance calculations
  const calculateTotalUsdtBalance = (balances: any[]): string => {
    // Calculate total of all balances (free + locked) converted to USDT
    // For now, we'll sum all balances since we don't have real-time price conversion
    // In production, each asset would be converted to USDT using current market prices
    let total = 0;
    balances.forEach(balance => {
      const assetTotal = parseFloat(balance.free || 0) + parseFloat(balance.locked || 0);
      total += assetTotal;
    });
    return total.toFixed(2);
  };

  const calculateUsdtOnly = (balances: any[]): string => {
    const usdtBalance = balances.find(balance => balance.asset === 'USDT');
    if (usdtBalance) {
      return (parseFloat(usdtBalance.free || 0) + parseFloat(usdtBalance.locked || 0)).toFixed(2);
    }
    return '0.00';
  };

  const calculateTotalFree = (balances: any[]): string => {
    let total = 0;
    balances.forEach(balance => {
      total += parseFloat(balance.free || 0);
    });
    return total.toFixed(2);
  };

  const calculateTotalLocked = (balances: any[]): string => {
    let total = 0;
    balances.forEach(balance => {
      total += parseFloat(balance.locked || 0);
    });
    return total.toFixed(2);
  };

  // WebSocket for balance fetching
  const userWs = useUserWebSocket({
    onMessage: (data) => {
      console.log('Balance WebSocket response:', data);
      
      if (data.type === 'balance_update' && data.data?.balances) {
        const targetExchangeId = currentExchangeId || data.exchangeId;
        
        console.log('Processing balance update:', {
          currentExchangeId,
          dataExchangeId: data.exchangeId,
          targetExchangeId,
          balancesLength: data.data.balances.length
        });
        
        if (targetExchangeId) {
          const totalUsdtValue = calculateTotalUsdtBalance(data.data.balances);
          const usdtOnly = calculateUsdtOnly(data.data.balances);
          const totalFree = calculateTotalFree(data.data.balances);
          const totalLocked = calculateTotalLocked(data.data.balances);
          
          console.log('✅ Balance fetched via WebSocket API:', totalUsdtValue, 'USDT');
          
          setExchangeBalances(prev => ({
            ...prev,
            [targetExchangeId]: { 
              balance: totalUsdtValue, 
              loading: false,
              balances: data.data.balances,
              usdtOnly,
              totalFree,
              totalLocked
            }
          }));
        } else {
          console.log('❌ No target exchange ID found for balance update');
        }
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      if (currentExchangeId) {
        setExchangeBalances(prev => ({
          ...prev,
          [currentExchangeId]: { 
            balance: '0.00', 
            loading: false, 
            error: 'Connection failed'
          }
        }));
      }
    }
  });

  // Simple balance fetching function
  const fetchExchangeBalance = (exchange: Exchange) => {
    if (!exchange.isActive || !exchange.apiKey) return;
    
    console.log(`Fetching balance for exchange: ${exchange.name}`);
    
    // Set loading state
    setExchangeBalances(prev => ({
      ...prev,
      [exchange.id]: { balance: '0.00', loading: true }
    }));
    
    // Set current exchange for message handling
    setCurrentExchangeId(exchange.id);
    
    // Connect using WebSocket API
    userWs.connect(exchange.apiKey);
  };

  // Auto-fetch balances when page loads (once only)
  useEffect(() => {
    if (exchanges && exchanges.length > 0) {
      exchanges.forEach(exchange => {
        if (exchange.isActive && exchange.apiKey && exchange.wsApiEndpoint) {
          fetchExchangeBalance(exchange);
        }
      });
    }
  }, [exchanges?.length]); // Only depend on length to prevent loops

  // Mutations for CRUD operations
  const createExchangeMutation = useMutation({
    mutationFn: async (exchangeData: any) => {
      return apiRequest('/api/exchanges', {
        method: 'POST',
        body: JSON.stringify(exchangeData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Exchange Added",
        description: "Exchange configuration has been saved successfully.",
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

  const updateExchangeMutation = useMutation({
    mutationFn: async ({ id, ...exchangeData }: any) => {
      return apiRequest(`/api/exchanges/${id}`, {
        method: 'PUT',
        body: JSON.stringify(exchangeData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Exchange Updated",
        description: "Exchange configuration has been updated successfully.",
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

  const deleteExchangeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/exchanges/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Deleted",
        description: "Exchange configuration has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete exchange",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedExchange("");
    setApiKey("");
    setApiSecret("");
    setWsApiEndpoint("");
    setWsStreamEndpoint("");
    setRestApiEndpoint("");
    setEditingExchange(null);
  };

  const resetEditForm = () => {
    setEditingExchange(null);
    setApiKey("");
    setApiSecret("");
    setWsApiEndpoint("");
    setWsStreamEndpoint("");
    setRestApiEndpoint("");
  };



  const handleAddExchange = () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const exchangeConfig = EXCHANGE_OPTIONS.find(ex => ex.value === selectedExchange);
    if (!exchangeConfig) return;

    const exchangeData = {
      name: exchangeConfig.label,
      exchangeType: exchangeConfig.value,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      isActive: true,
      isTestnet: exchangeConfig.isTestnet || false,
      wsApiEndpoint: exchangeConfig.wsApiEndpoint,
      wsStreamEndpoint: exchangeConfig.wsStreamEndpoint,
      restApiEndpoint: exchangeConfig.restApiEndpoint,
    };

    if (editingExchange) {
      updateExchangeMutation.mutate({ id: editingExchange.id, ...exchangeData });
    } else {
      createExchangeMutation.mutate(exchangeData);
    }
  };

  const handleEditExchange = (exchange: Exchange) => {
    setEditingExchange(exchange);
    setApiKey(""); // Don't prefill for security
    setApiSecret(""); // Don't prefill for security
    setWsApiEndpoint(exchange.wsApiEndpoint || "");
    setWsStreamEndpoint(exchange.wsStreamEndpoint || "");
    setRestApiEndpoint(exchange.restApiEndpoint || "");
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

  const handleDeleteExchange = (id: number) => {
    deleteExchangeMutation.mutate(id);
  };

  const renderExchangeCard = (exchange: Exchange) => {
    const balanceState = exchangeBalances[exchange.id];
    
    return (
      <Card key={exchange.id} className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
                {exchange.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                {exchange.name}
                {exchange.isTestnet && (
                  <Badge variant="secondary" className="ml-2">Testnet</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Added {new Date(exchange.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={exchange.isActive ? "default" : "secondary"}>
              {exchange.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">API Key</p>
              <p className="text-sm font-mono bg-muted p-2 rounded mt-1">
                {exchange.apiKey.substring(0, 8)}...{exchange.apiKey.slice(-4)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Balance (USDT)</p>
              <div className="flex items-center mt-1">
                {balanceState?.loading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : balanceState?.error ? (
                  <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{balanceState.error}</span>
                  </div>
                ) : (
                  <span className="text-lg font-semibold">
                    ${balanceState?.balance || '0.00'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Enhanced Balance Details Section */}
          {balanceState && !balanceState.loading && !balanceState.error && balanceState.balances && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">USDT Balance</p>
                  <p className="text-base font-semibold mt-1">
                    ${balanceState.usdtOnly || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Free</p>
                  <p className="text-base font-semibold mt-1">
                    {balanceState.totalFree || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Locked</p>
                  <p className="text-base font-semibold mt-1">
                    {balanceState.totalLocked || '0.00'}
                  </p>
                </div>
              </div>
            </>
          )}
          
          <Separator className="my-4" />
          
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchExchangeBalance(exchange)}
              disabled={balanceState?.loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Balance
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditExchange(exchange)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteExchange(exchange.id)}
                disabled={deleteExchangeMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (exchangesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Exchanges</h1>
          <p className="text-muted-foreground mt-2">
            Manage your cryptocurrency exchange connections
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Exchange
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingExchange ? 'Edit Exchange' : 'Add New Exchange'}
              </DialogTitle>
              <DialogDescription>
                Configure your exchange API credentials to enable trading
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="exchange">Exchange</Label>
                <Select value={selectedExchange} onValueChange={setSelectedExchange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an exchange" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGE_OPTIONS.map((exchange) => (
                      <SelectItem key={exchange.value} value={exchange.value}>
                        {exchange.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your API secret"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddExchange}
                disabled={createExchangeMutation.isPending || updateExchangeMutation.isPending}
              >
                {createExchangeMutation.isPending || updateExchangeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {editingExchange ? 'Update' : 'Add'} Exchange
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {exchanges && exchanges.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exchanges.map(renderExchangeCard)}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto max-w-sm">
              <div className="mb-4">
                <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Exchanges Connected</h3>
              <p className="text-muted-foreground mb-4">
                Connect your first exchange to start trading
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Exchange
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}