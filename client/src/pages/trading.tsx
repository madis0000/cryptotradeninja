import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Trading() {
  return (
    <div className="min-h-screen bg-crypto-darker">
      {/* Header Section (Green) */}
      <div className="bg-crypto-dark border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-white">ICP/USDT</h1>
            <span className="text-crypto-success text-xl font-semibold">5.334</span>
            <span className="text-crypto-success text-sm">24h Change</span>
            <span className="text-crypto-light text-sm">24h High</span>
            <span className="text-crypto-light text-sm">24h Low</span>
            <span className="text-crypto-light text-sm">24h Volume/ICP</span>
            <span className="text-crypto-light text-sm">24h Volume/USDT</span>
          </div>
          <div className="flex items-center space-x-2">
            <input 
              type="text" 
              placeholder="Search"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Panel - Order Book (Red) */}
        <div className="w-80 border-r border-gray-800">
          <Card className="bg-crypto-dark border-0 h-full rounded-none">
            <CardHeader className="py-3 px-4 border-b border-gray-800">
              <CardTitle className="text-white text-sm">Order Book</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-60px)]">
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-4xl text-gray-500 mb-4">
                    <i className="fas fa-list-ul"></i>
                  </div>
                  <p className="text-gray-500 text-sm">Order Book</p>
                  <p className="text-gray-600 text-xs">Buy/Sell orders display</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center Panel - Chart & Trading Interface */}
        <div className="flex-1 flex flex-col">
          {/* Chart Section (Blue) */}
          <div className="flex-1 border-b border-gray-800">
            <Card className="bg-crypto-dark border-0 h-full rounded-none">
              <CardHeader className="py-3 px-4 border-b border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <CardTitle className="text-white text-sm">Chart</CardTitle>
                    <div className="flex space-x-2 text-xs">
                      <button className="text-crypto-light hover:text-white">Info</button>
                      <button className="text-crypto-light hover:text-white">Trading Data</button>
                      <button className="text-crypto-light hover:text-white">Trading Analysis</button>
                      <button className="text-crypto-light hover:text-white">Square</button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <button className="text-crypto-light hover:text-white">Original</button>
                    <button className="text-crypto-light hover:text-white">Trading View</button>
                    <button className="text-crypto-light hover:text-white">Depth</button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-60px)]">
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-6xl text-gray-500 mb-6">
                      <i className="fas fa-chart-line"></i>
                    </div>
                    <p className="text-gray-500">Trading Chart</p>
                    <p className="text-gray-600 text-sm">Price action visualization</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Order Form Section - Full Width */}
          <div className="h-64 border-b border-gray-800">
            <Card className="bg-crypto-dark border-0 h-full rounded-none">
              <CardHeader className="py-3 px-4 border-b border-gray-800">
                <div className="flex space-x-4">
                  <button className="text-crypto-light hover:text-white text-sm">Spot</button>
                  <button className="text-crypto-light hover:text-white text-sm">Cross</button>
                  <button className="text-crypto-light hover:text-white text-sm">Isolated</button>
                  <button className="text-crypto-light hover:text-white text-sm">Grid</button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-4xl text-gray-500 mb-4">
                      <i className="fas fa-plus-circle"></i>
                    </div>
                    <p className="text-gray-500 text-sm">Order Form</p>
                    <p className="text-gray-600 text-xs">Buy/Sell interface - Full width</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Panel - Market Data & Watchlist */}
        <div className="w-80 border-l border-gray-800">
          <div className="flex flex-col h-full">
            {/* Market Trades Section */}
            <div className="flex-1 border-b border-gray-800">
              <Card className="bg-crypto-dark border-0 h-full rounded-none">
                <CardHeader className="py-3 px-4 border-b border-gray-800">
                  <CardTitle className="text-white text-sm">Market Trades</CardTitle>
                </CardHeader>
                <CardContent className="p-0 h-[calc(100%-60px)]">
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl text-gray-500 mb-4">
                        <i className="fas fa-exchange-alt"></i>
                      </div>
                      <p className="text-gray-500 text-sm">Market Trades</p>
                      <p className="text-gray-600 text-xs">Recent transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Movers Section */}
            <div className="flex-1">
              <Card className="bg-crypto-dark border-0 h-full rounded-none">
                <CardHeader className="py-3 px-4 border-b border-gray-800">
                  <CardTitle className="text-white text-sm">Top Movers</CardTitle>
                </CardHeader>
                <CardContent className="p-0 h-[calc(100%-60px)]">
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl text-gray-500 mb-4">
                        <i className="fas fa-trending-up"></i>
                      </div>
                      <p className="text-gray-500 text-sm">Top Movers</p>
                      <p className="text-gray-600 text-xs">Price gainers/losers</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Orders & History Section - Full Screen Width */}
      <div className="h-64 border-t border-gray-800">
        <Card className="bg-crypto-dark border-0 h-full rounded-none">
          <CardHeader className="py-3 px-4 border-b border-gray-800">
            <div className="flex space-x-4 text-xs">
              <button className="text-crypto-accent">Open Orders(0)</button>
              <button className="text-crypto-light hover:text-white">Order History</button>
              <button className="text-crypto-light hover:text-white">Trade History</button>
              <button className="text-crypto-light hover:text-white">Funds</button>
              <button className="text-crypto-light hover:text-white">Grid Orders</button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl text-gray-500 mb-4">
                  <i className="fas fa-history"></i>
                </div>
                <p className="text-gray-500 text-sm">Orders & History</p>
                <p className="text-gray-600 text-xs">Trading activity - Full screen width</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}