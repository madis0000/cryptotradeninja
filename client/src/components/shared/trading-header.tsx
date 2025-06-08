interface TickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

interface TradingHeaderProps {
  selectedSymbol: string;
  tickerData: TickerData | null;
  className?: string;
}

export function TradingHeader({ selectedSymbol, tickerData, className = "" }: TradingHeaderProps) {
  return (
    <div className={`bg-crypto-dark px-4 py-3 border-b border-gray-800 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <h1 className="text-lg font-bold text-white">
            {selectedSymbol ? `${selectedSymbol.replace('USDT', '')}/USDT` : 'BTC/USDT'}
          </h1>
          <div className="flex items-center space-x-2">
            <span className="text-white text-lg font-semibold font-mono">
              {tickerData ? parseFloat(tickerData.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '--'}
            </span>
            <span className={`text-sm font-medium ${
              tickerData && parseFloat(tickerData.priceChangePercent) > 0 
                ? 'text-green-400' 
                : tickerData && parseFloat(tickerData.priceChangePercent) < 0 
                  ? 'text-red-400' 
                  : 'text-gray-400'
            }`}>
              {tickerData ? `${parseFloat(tickerData.priceChangePercent) > 0 ? '+' : ''}${parseFloat(tickerData.priceChangePercent).toFixed(2)}%` : '--'}
            </span>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex flex-col">
              <span className="text-crypto-light text-xs">24h High</span>
              <span className="text-white font-mono">
                {tickerData ? parseFloat(tickerData.highPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '--'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-crypto-light text-xs">24h Low</span>
              <span className="text-white font-mono">
                {tickerData ? parseFloat(tickerData.lowPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '--'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-crypto-light text-xs">24h Volume</span>
              <span className="text-white font-mono">
                {tickerData ? `${parseFloat(tickerData.volume).toFixed(2)} ${selectedSymbol.replace('USDT', '')}` : '--'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-crypto-light text-xs">24h Volume (USDT)</span>
              <span className="text-white font-mono">
                {tickerData ? `${(parseFloat(tickerData.quoteVolume) / 1000000).toFixed(2)}M` : '--'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button className="text-gray-400 hover:text-white text-sm px-3 py-1">
            Original
          </button>
          <button className="text-gray-400 hover:text-white text-sm px-3 py-1">
            Trading View
          </button>
          <button className="text-gray-400 hover:text-white text-sm px-3 py-1">
            Depth
          </button>
        </div>
      </div>
    </div>
  );
}