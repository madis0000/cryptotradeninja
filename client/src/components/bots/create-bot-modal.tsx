import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TRADING_STRATEGIES, TRADING_PAIRS } from "@/lib/mock-data";
import { Exchange } from "@shared/schema";
import { CreateBotFormData } from "@/types";

interface CreateBotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateBotModal({ isOpen, onClose }: CreateBotModalProps) {
  const [formData, setFormData] = useState<CreateBotFormData>({
    name: '',
    strategy: '',
    tradingPair: '',
    exchangeId: 0,
    investmentAmount: '',
    configuration: {},
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: exchanges } = useQuery<Exchange[]>({
    queryKey: ['/api/exchanges'],
  });

  const createBotMutation = useMutation({
    mutationFn: async (data: CreateBotFormData) => {
      const response = await apiRequest('/api/bots', 'POST', {
        ...data,
        configuration: getStrategyConfiguration(data.strategy),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bots'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "Bot Created",
        description: "Your trading bot has been created successfully",
      });
      onClose();
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create trading bot",
        variant: "destructive",
      });
    },
  });

  const getStrategyConfiguration = (strategy: string) => {
    switch (strategy) {
      case 'grid':
        return {
          gridCount: 20,
          upperPrice: 0,
          lowerPrice: 0,
          profitPerGrid: 1,
        };
      case 'martingale':
        return {
          multiplier: 2,
          maxOrders: 10,
          safetyOrderVolume: 10,
        };
      case 'dca':
        return {
          interval: 'daily',
          amount: parseFloat(formData.investmentAmount) / 30, // Daily amount for 30 days
          priceThreshold: 5,
        };
      default:
        return {};
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      strategy: '',
      tradingPair: '',
      exchangeId: 0,
      investmentAmount: '',
      configuration: {},
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.strategy || !formData.tradingPair || !formData.exchangeId || !formData.investmentAmount) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createBotMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-crypto-dark border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Create Trading Bot</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="text-crypto-light">Bot Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Trading Bot"
                className="bg-crypto-darker border-gray-800 text-white"
              />
            </div>
            <div>
              <Label htmlFor="tradingPair" className="text-crypto-light">Trading Pair</Label>
              <Select value={formData.tradingPair} onValueChange={(value) => setFormData({ ...formData, tradingPair: value })}>
                <SelectTrigger className="bg-crypto-darker border-gray-800 text-white">
                  <SelectValue placeholder="Select trading pair" />
                </SelectTrigger>
                <SelectContent className="bg-crypto-darker border-gray-800">
                  {TRADING_PAIRS.map((pair) => (
                    <SelectItem key={pair} value={pair} className="text-white">
                      {pair}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-crypto-light">Strategy</Label>
            <RadioGroup
              value={formData.strategy}
              onValueChange={(value) => setFormData({ ...formData, strategy: value })}
              className="grid grid-cols-3 gap-3 mt-2"
            >
              {TRADING_STRATEGIES.map((strategy) => (
                <Label
                  key={strategy.id}
                  htmlFor={strategy.id}
                  className="flex items-center p-4 border border-gray-800 rounded-lg cursor-pointer hover:border-crypto-accent/50 transition-colors"
                >
                  <RadioGroupItem value={strategy.id} id={strategy.id} className="sr-only" />
                  <div className="flex items-center space-x-3">
                    <i className={strategy.icon + " text-crypto-accent"}></i>
                    <div>
                      <div className="text-sm font-medium text-white">{strategy.name}</div>
                      <div className="text-xs text-crypto-light">{strategy.description}</div>
                    </div>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exchange" className="text-crypto-light">Exchange</Label>
              <Select 
                value={formData.exchangeId.toString()} 
                onValueChange={(value) => setFormData({ ...formData, exchangeId: parseInt(value) })}
              >
                <SelectTrigger className="bg-crypto-darker border-gray-800 text-white">
                  <SelectValue placeholder="Select exchange" />
                </SelectTrigger>
                <SelectContent className="bg-crypto-darker border-gray-800">
                  {exchanges?.map((exchange) => (
                    <SelectItem key={exchange.id} value={exchange.id.toString()} className="text-white">
                      {exchange.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="investment" className="text-crypto-light">Investment Amount (USDT)</Label>
              <Input
                id="investment"
                type="number"
                value={formData.investmentAmount}
                onChange={(e) => setFormData({ ...formData, investmentAmount: e.target.value })}
                placeholder="1000"
                className="bg-crypto-darker border-gray-800 text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-800">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-crypto-light hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createBotMutation.isPending}
              className="bg-crypto-accent hover:bg-crypto-accent/80 text-white"
            >
              {createBotMutation.isPending ? "Creating..." : "Create Bot"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
