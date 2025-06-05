export function Sidebar() {
  return (
    <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-crypto-dark border-r border-gray-800">
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-crypto-light">
          <i className="fas fa-cube text-3xl mb-3 opacity-30"></i>
          <p className="text-sm opacity-60">Sidebar reserved</p>
          <p className="text-sm opacity-60">for future features</p>
        </div>
      </div>
    </div>
  );
}
