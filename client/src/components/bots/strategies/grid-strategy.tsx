import { useState } from "react";
import { Construction } from "lucide-react";
import { ExchangeSelector } from "@/components/shared/exchange-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GridStrategyProps {
  className?: string;
  selectedSymbol?: string;
  selectedExchangeId?: number;
  exchanges?: any[];
  onExchangeChange?: (exchangeId: number) => void;
  onBotCreated?: () => void;
}

export function GridStrategy({ 
  className,
  selectedSymbol = "BTCUSDT",
  selectedExchangeId,
  exchanges,
  onExchangeChange,
  onBotCreated
}: GridStrategyProps) {
  const [config, setConfig] = useState({
    upperPrice: "",
    lowerPrice: "",
    gridLevels: "10",
    investment: "1000"
  });

  const handleInputChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className={`flex flex-col space-y-6 ${className}`}>
      {/* Exchange Selector */}
      <div className="space-y-2">
        <ExchangeSelector
          selectedExchangeId={selectedExchangeId}
          onExchangeChange={onExchangeChange || (() => {})}
          label="Exchange Account"
        />
      </div>

      <div className="flex flex-col items-center justify-center py-12">
        <Construction className="w-12 h-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Grid Strategy</h3>
        <p className="text-gray-400 text-center mb-6">Under Construction</p>
        
        {/* Basic Grid Configuration Preview */}
        <div className="w-full max-w-md space-y-4 bg-crypto-dark rounded border border-gray-700 p-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-400">Upper Price</Label>
            <Input
              value={config.upperPrice}
              onChange={(e) => handleInputChange('upperPrice', e.target.value)}
              placeholder="e.g., 110000"
              className="bg-crypto-darker border-gray-600 text-white"
              disabled
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm text-gray-400">Lower Price</Label>
            <Input
              value={config.lowerPrice}
              onChange={(e) => handleInputChange('lowerPrice', e.target.value)}
              placeholder="e.g., 90000"
              className="bg-crypto-darker border-gray-600 text-white"
              disabled
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm text-gray-400">Grid Levels</Label>
            <Input
              value={config.gridLevels}
              onChange={(e) => handleInputChange('gridLevels', e.target.value)}
              placeholder="10"
              className="bg-crypto-darker border-gray-600 text-white"
              disabled
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm text-gray-400">Total Investment (USDT)</Label>
            <Input
              value={config.investment}
              onChange={(e) => handleInputChange('investment', e.target.value)}
              placeholder="1000"
              className="bg-crypto-darker border-gray-600 text-white"
              disabled
            />
          </div>
          
          <Button 
            className="w-full bg-blue-500 hover:bg-blue-600 text-white" 
            disabled
          >
            Create Grid Bot (Coming Soon)
          </Button>
        </div>
        
        <p className="text-gray-500 text-sm text-center mt-4">
          This strategy is currently being developed and will be available soon.
        </p>
      </div>
    </div>
  );
}