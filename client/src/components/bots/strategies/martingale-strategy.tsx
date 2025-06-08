import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MartingaleStrategyProps {
  className?: string;
  selectedSymbol: string;
}

export function MartingaleStrategy({ className, selectedSymbol }: MartingaleStrategyProps) {
  const [config, setConfig] = useState({
    // Price Settings
    priceDeviation: "1",
    
    // Investment
    quoteOrderSize: "773",
    
    // DCA Order Size
    dcaOrderSize: "77.5",
    maxDcaOrders: "8",
    
    // Available & Balance
    available: "0.00",
    spotBalance: "USDT",
    
    // Advanced Settings
    advancedEnabled: false,
    takeProfitEnabled: false,
    stopLossEnabled: false,
    
    // Safety Orders
    safetyOrderStepScale: "1.0",
    safetyOrderVolumeScale: "1.0"
  });

  const handleInputChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const baseCurrency = selectedSymbol.replace('USDT', '');

  return (
    <div className={`p-4 space-y-6 ${className}`}>
      {/* Price Settings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">1. Price Settings</h4>
        <div className="space-y-2">
          <Label htmlFor="priceDeviation" className="text-xs text-gray-400">Price Deviation</Label>
          <div className="flex items-center space-x-2">
            <Input
              id="priceDeviation"
              value={config.priceDeviation}
              onChange={(e) => handleInputChange('priceDeviation', e.target.value)}
              className="bg-gray-800 border-gray-700 text-white text-sm h-8"
              placeholder="1"
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </div>
      </div>

      <Separator className="bg-gray-700" />

      {/* Investment */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">2. Investment</h4>
        <div className="space-y-2">
          <Label htmlFor="quoteOrderSize" className="text-xs text-gray-400">Quote Order Size</Label>
          <div className="flex items-center space-x-2">
            <Input
              id="quoteOrderSize"
              value={config.quoteOrderSize}
              onChange={(e) => handleInputChange('quoteOrderSize', e.target.value)}
              className="bg-gray-800 border-gray-700 text-white text-sm h-8"
              placeholder="773"
            />
            <span className="text-xs text-gray-400">USDT</span>
          </div>
        </div>
      </div>

      <Separator className="bg-gray-700" />

      {/* DCA Order Size */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">3. DCA Order Size</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="dcaOrderSize" className="text-xs text-gray-400">DCA Order Size</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="dcaOrderSize"
                value={config.dcaOrderSize}
                onChange={(e) => handleInputChange('dcaOrderSize', e.target.value)}
                className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                placeholder="77.5"
              />
              <span className="text-xs text-gray-400">USDT</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxDcaOrders" className="text-xs text-gray-400">Max DCA Orders</Label>
            <Input
              id="maxDcaOrders"
              value={config.maxDcaOrders}
              onChange={(e) => handleInputChange('maxDcaOrders', e.target.value)}
              className="bg-gray-800 border-gray-700 text-white text-sm h-8"
              placeholder="8"
            />
          </div>
        </div>
      </div>

      <Separator className="bg-gray-700" />

      {/* Available & Balance */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">4. Available</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="available" className="text-xs text-gray-400">Available</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="available"
                value={config.available}
                onChange={(e) => handleInputChange('available', e.target.value)}
                className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                placeholder="0.00"
              />
              <span className="text-xs text-gray-400">USDT</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="spotBalance" className="text-xs text-gray-400">Spot Balance</Label>
            <Input
              id="spotBalance"
              value={config.spotBalance}
              onChange={(e) => handleInputChange('spotBalance', e.target.value)}
              className="bg-gray-800 border-gray-700 text-white text-sm h-8"
              placeholder="-- USDT"
              disabled
            />
          </div>
        </div>
      </div>

      <Separator className="bg-gray-700" />

      {/* Advanced Settings Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="advanced" className="text-sm font-medium text-white">Advanced (Optional)</Label>
          <Switch
            id="advanced"
            checked={config.advancedEnabled}
            onCheckedChange={(checked) => handleInputChange('advancedEnabled', checked.toString())}
          />
        </div>

        {config.advancedEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-700">
            {/* Take Profit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="takeProfit" className="text-xs text-gray-400">Take Profit</Label>
                <Switch
                  id="takeProfit"
                  checked={config.takeProfitEnabled}
                  onCheckedChange={(checked) => handleInputChange('takeProfitEnabled', checked.toString())}
                />
              </div>
            </div>

            {/* Stop Loss */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="stopLoss" className="text-xs text-gray-400">Stop Loss</Label>
                <Switch
                  id="stopLoss"
                  checked={config.stopLossEnabled}
                  onCheckedChange={(checked) => handleInputChange('stopLossEnabled', checked.toString())}
                />
              </div>
            </div>

            {/* Safety Order Settings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="safetyOrderStepScale" className="text-xs text-gray-400">Safety Order Step Scale</Label>
                <Input
                  id="safetyOrderStepScale"
                  value={config.safetyOrderStepScale}
                  onChange={(e) => handleInputChange('safetyOrderStepScale', e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                  placeholder="1.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safetyOrderVolumeScale" className="text-xs text-gray-400">Safety Order Volume Scale</Label>
                <Input
                  id="safetyOrderVolumeScale"
                  value={config.safetyOrderVolumeScale}
                  onChange={(e) => handleInputChange('safetyOrderVolumeScale', e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                  placeholder="1.0"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-gray-700" />

      {/* Advanced Settings Link */}
      <div className="text-center">
        <Button
          variant="link"
          className="text-orange-400 hover:text-orange-300 text-xs p-0 h-auto"
          onClick={() => handleInputChange('advancedEnabled', (!config.advancedEnabled).toString())}
        >
          Advanced Settings
        </Button>
      </div>
    </div>
  );
}