export function MyBotsPage() {
  return (
    <div className="min-h-screen bg-crypto-darker">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Bots</h1>
          <p className="text-crypto-light">Manage and monitor your trading bots</p>
        </div>
        
        <div className="bg-crypto-dark rounded-lg border border-gray-800 p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-crypto-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-robot text-crypto-accent text-2xl"></i>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">My Bots</h2>
            <p className="text-crypto-light">Your trading bots will appear here</p>
          </div>
        </div>
      </div>
    </div>
  );
}