import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

interface ExchangeSelectorProps {
  selectedExchangeId?: number;
  onExchangeChange: (exchangeId: number) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function ExchangeSelector({ 
  selectedExchangeId, 
  onExchangeChange, 
  label = "Exchange Account",
  className = "",
  disabled = false,
  placeholder = "Select exchange account"
}: ExchangeSelectorProps) {  // Fetch exchanges
  const { data: exchanges } = useQuery({
    queryKey: ['/api/exchanges']
  });

  const activeExchanges = (Array.isArray(exchanges) ? exchanges.filter((ex: any) => ex.isActive) : []) || [];

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-sm text-gray-400">{label}</Label>
      <Select 
        value={selectedExchangeId?.toString()} 
        onValueChange={(value) => onExchangeChange(parseInt(value))}
        disabled={disabled || activeExchanges.length === 0}
      >
        <SelectTrigger className="w-full bg-crypto-darker border-gray-600 text-white">
          <SelectValue placeholder={
            activeExchanges.length === 0 
              ? "No active exchanges found" 
              : placeholder
          } />
        </SelectTrigger>
        <SelectContent className="bg-crypto-darker border-gray-600">
          {activeExchanges.map((exchange: any) => (            <SelectItem 
              key={exchange.id} 
              value={exchange.id.toString()}
              className="text-white hover:bg-gray-700"
            >
              {exchange.name} {exchange.isTestnet ? "(Testnet)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activeExchanges.length === 0 && (
        <p className="text-xs text-red-400">
          No active exchanges found. Please add an exchange in the My Exchanges page.
        </p>
      )}
    </div>
  );
}
