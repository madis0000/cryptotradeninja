import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Exchange } from "@shared/schema";
import { EXCHANGE_OPTIONS } from "@/lib/mock-data";

export default function ApiKeys() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    apiKey: '',
    apiSecret: '',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: exchanges, isLoading } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  const addExchangeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', '/api/exchanges', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Added",
        description: "Exchange API credentials have been added successfully",
      });
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add exchange API credentials",
        variant: "destructive",
      });
    },
  });

  const deleteExchangeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/exchanges/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchanges'] });
      toast({
        title: "Exchange Removed",
        description: "Exchange API credentials have been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove exchange API credentials",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', apiKey: '', apiSecret: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.apiKey || !formData.apiSecret) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    addExchangeMutation.mutate(formData);
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.slice(0, 4) + '•'.repeat(Math.max(8, key.length - 8)) + key.slice(-4);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-6">API Keys</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-crypto-dark border-gray-800">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-700 rounded w-1/4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Exchange API Keys</h1>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
          >
            <i className="fas fa-plus mr-2"></i>
            Add Exchange
          </Button>
        </div>

        <div className="bg-crypto-accent/10 border border-crypto-accent/20 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <i className="fas fa-info-circle text-crypto-accent mt-0.5"></i>
            <div>
              <h3 className="text-crypto-accent font-medium mb-1">Security Notice</h3>
              <p className="text-crypto-light text-sm">
                Your API keys are encrypted and stored securely. Never share your secret keys with anyone. 
                We recommend using API keys with limited permissions (read + trade only, no withdrawal permissions).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Exchange List */}
      {exchanges && exchanges.length > 0 ? (
        <div className="space-y-4">
          {exchanges.map((exchange) => (
            <Card key={exchange.id} className="bg-crypto-dark border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-crypto-accent/10 rounded-lg flex items-center justify-center">
                      <i className="fas fa-exchange-alt text-crypto-accent text-lg"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{exchange.name}</h3>
                      <p className="text-sm text-crypto-light">
                        API Key: {maskApiKey(exchange.apiKey)}
                      </p>
                      <p className="text-xs text-crypto-light">
                        Added: {new Date(exchange.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge 
                      variant={exchange.isActive ? "secondary" : "outline"}
                      className={exchange.isActive 
                        ? "bg-crypto-success/10 text-crypto-success border-crypto-success/20" 
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                      }
                    >
                      {exchange.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteExchangeMutation.mutate(exchange.id)}
                      className="text-crypto-danger hover:text-crypto-danger hover:bg-crypto-danger/10"
                      disabled={deleteExchangeMutation.isPending}
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-crypto-dark border-gray-800">
          <CardContent className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-key text-crypto-accent text-2xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Exchange APIs</h3>
              <p className="text-crypto-light mb-6">Connect your exchange accounts to start trading</p>
              <Button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Your First Exchange
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Exchange Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md bg-crypto-dark border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Add Exchange API</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="exchange" className="text-crypto-light">Exchange</Label>
              <Select value={formData.name} onValueChange={(value) => setFormData({ ...formData, name: value })}>
                <SelectTrigger className="bg-crypto-darker border-gray-800 text-white">
                  <SelectValue placeholder="Select exchange" />
                </SelectTrigger>
                <SelectContent className="bg-crypto-darker border-gray-800">
                  {EXCHANGE_OPTIONS.map((exchange) => (
                    <SelectItem key={exchange.id} value={exchange.name} className="text-white">
                      {exchange.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="apiKey" className="text-crypto-light">API Key</Label>
              <Input
                id="apiKey"
                type="text"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter your API key"
                className="bg-crypto-darker border-gray-800 text-white"
              />
            </div>

            <div>
              <Label htmlFor="apiSecret" className="text-crypto-light">API Secret</Label>
              <Input
                id="apiSecret"
                type="password"
                value={formData.apiSecret}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                placeholder="Enter your API secret"
                className="bg-crypto-darker border-gray-800 text-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-4 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddModalOpen(false)}
                className="text-crypto-light hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addExchangeMutation.isPending}
                className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
              >
                {addExchangeMutation.isPending ? "Adding..." : "Add Exchange"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
