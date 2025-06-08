import { Construction } from "lucide-react";

interface GridStrategyProps {
  className?: string;
}

export function GridStrategy({ className }: GridStrategyProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <Construction className="w-12 h-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">Grid Strategy</h3>
      <p className="text-gray-400 text-center">Under Construction</p>
      <p className="text-gray-500 text-sm text-center mt-2">
        This strategy is currently being developed and will be available soon.
      </p>
    </div>
  );
}