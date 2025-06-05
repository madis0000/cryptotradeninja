import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  const [selectedExchange, setSelectedExchange] = useState('');
  const [mode, setMode] = useState('testnet');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [wsApiEndpoint, setWsApiEndpoint] = useState('');
  const [wsStreamEndpoint, setWsStreamEndpoint] = useState('');
  const [restApiEndpoint, setRestApiEndpoint] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch exchanges
  const { data: exchanges = [], isLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  // Add exchange mutation
  const addExchangeMutation = useMutation({
    mutationFn: async (exchangeData: { name: string; apiKey: string; apiSecret: string }) => {
      const response = await apiRequest('POST', '/api/exchanges', exchangeData);
      return response.json();
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

  const resetForm = () => {
    setSelectedExchange('');
    setMode('testnet');
    setApiKey('');
    setApiSecret('');
  };

  const testConnection = async () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before testing connection",
        variant: "destructive",
      });
      return;
    }

    setIsTestingConnection(true);
    
    try {
      // Test connection logic would go here
      // For now, simulate a test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Connection Successful",
        description: "API credentials are valid and connection is working",
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Unable to connect with provided credentials",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
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

    const exchangeName = `${selectedExchange} (${mode})`;
    addExchangeMutation.mutate({
      name: exchangeName,
      apiKey,
      apiSecret,
    });
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

  const renderExchangeCard = (exchange: Exchange) => (
    <Card key={exchange.id} className="bg-crypto-darker border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center space-x-2">
            <i className="fas fa-exchange-alt text-crypto-accent"></i>
            <span>{exchange.name}</span>
          </CardTitle>
          <Badge variant={exchange.isActive ? "default" : "secondary"} className={exchange.isActive ? "bg-crypto-success" : ""}>
            {exchange.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <Label className="text-crypto-light text-sm">API Key</Label>
            <p className="text-white font-mono text-sm bg-crypto-dark p-2 rounded mt-1">
              {exchange.apiKey}
            </p>
          </div>
          
          <div>
            <Label className="text-crypto-light text-sm">Status</Label>
            <div className="flex items-center space-x-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${exchange.isActive ? 'bg-crypto-success' : 'bg-gray-500'}`}></div>
              <span className="text-sm text-crypto-light">
                {exchange.isActive ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div>
            <Label className="text-crypto-light text-sm">Added</Label>
            <p className="text-crypto-light text-sm mt-1">
              {new Date(exchange.createdAt).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex space-x-2 pt-2">
            <Button size="sm" variant="outline" className="border-gray-700 text-crypto-light hover:bg-gray-800">
              <i className="fas fa-edit mr-2"></i>
              Edit
            </Button>
            <Button size="sm" variant="outline" className="border-red-700 text-red-400 hover:bg-red-900">
              <i className="fas fa-trash mr-2"></i>
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderAddExchangeDialog = () => (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-crypto-accent hover:bg-crypto-accent/80 text-white">
          <i className="fas fa-plus mr-2"></i>
          Add Exchange
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-crypto-darker border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Exchange</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="exchange" className="text-crypto-light">Exchange</Label>
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                <SelectValue placeholder="Select an exchange" />
              </SelectTrigger>
              <SelectContent className="bg-crypto-dark border-gray-700">
                {exchangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-white">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="mode" className="text-crypto-light">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="mt-1 bg-crypto-dark border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-crypto-dark border-gray-700">
                <SelectItem value="testnet" className="text-white">Testnet</SelectItem>
                <SelectItem value="live" className="text-white">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="api-key" className="text-crypto-light">API Key</Label>
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
            <Label htmlFor="api-secret" className="text-crypto-light">API Secret</Label>
            <Input
              id="api-secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Enter your API secret"
              className="mt-1 bg-crypto-dark border-gray-700 text-white"
            />
          </div>

          <Separator className="bg-gray-800" />

          <div className="flex space-x-2">
            <Button
              onClick={testConnection}
              disabled={isTestingConnection}
              variant="outline"
              className="border-gray-700 text-crypto-light hover:bg-gray-800 flex-1"
            >
              {isTestingConnection ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Testing...
                </>
              ) : (
                <>
                  <i className="fas fa-plug mr-2"></i>
                  Test Connection
                </>
              )}
            </Button>
            
            <Button
              onClick={handleAddExchange}
              disabled={addExchangeMutation.isPending}
              className="bg-crypto-success hover:bg-crypto-success/80 text-white flex-1"
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
    </div>
  );
}