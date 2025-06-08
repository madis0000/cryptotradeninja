import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  orderId?: string;
  price?: string;
  quantity?: string;
  errorMessage?: string;
}

interface MartingaleProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botConfig: {
    symbol: string;
    baseOrderSize: string;
    safetyOrderSize: string;
    maxSafetyOrders: number;
    activeSafetyOrders?: number;
    takeProfit: string;
    priceDeviation: string;
    priceDeviationMultiplier: number;
  };
  onComplete?: (botId: string) => void;
  onError?: (error: string) => void;
}

export function MartingaleProgressDialog({
  open,
  onOpenChange,
  botConfig,
  onComplete,
  onError
}: MartingaleProgressDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<OrderStep[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize steps based on bot configuration
  useEffect(() => {
    if (open && botConfig) {
      const safetyOrderCount = botConfig.activeSafetyOrders || botConfig.maxSafetyOrders;
      
      const initialSteps: OrderStep[] = [
        {
          id: 'base_order',
          title: 'Base Order',
          description: `Market buy ${botConfig.baseOrderSize} USDT of ${botConfig.symbol}`,
          status: 'pending'
        },
        {
          id: 'take_profit',
          title: 'Take Profit Order',
          description: `Sell order at +${botConfig.takeProfit}% profit`,
          status: 'pending'
        }
      ];

      // Add safety order steps
      for (let i = 0; i < safetyOrderCount; i++) {
        const deviation = parseFloat(botConfig.priceDeviation) * Math.pow(botConfig.priceDeviationMultiplier, i);
        initialSteps.push({
          id: `safety_order_${i + 1}`,
          title: `Safety Order ${i + 1}`,
          description: `Buy order at -${deviation.toFixed(2)}% below base`,
          status: 'pending'
        });
      }

      setSteps(initialSteps);
      setCurrentStep(0);
      setOverallProgress(0);
      setIsProcessing(false);
    }
  }, [open, botConfig]);

  // Simulate order placement process
  const startOrderPlacement = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i);
        
        // Update step to processing
        setSteps(prev => prev.map((step, index) => 
          index === i ? { ...step, status: 'processing' } : step
        ));

        // Simulate order placement delay
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

        // Check for random errors (for demonstration)
        if (Math.random() < 0.1) { // 10% chance of error
          setSteps(prev => prev.map((step, index) => 
            index === i ? { 
              ...step, 
              status: 'error',
              errorMessage: 'Insufficient balance or market conditions'
            } : step
          ));
          onError?.('Order placement failed');
          setIsProcessing(false);
          return;
        }

        // Mark step as completed
        setSteps(prev => prev.map((step, index) => 
          index === i ? { 
            ...step, 
            status: 'completed',
            orderId: `ORDER_${Date.now()}_${i}`,
            price: (5.55 + (Math.random() - 0.5) * 0.1).toFixed(4),
            quantity: (parseFloat(botConfig.baseOrderSize) / 5.55).toFixed(4)
          } : step
        ));

        // Update overall progress
        setOverallProgress(((i + 1) / steps.length) * 100);
      }

      // All orders completed successfully
      setTimeout(() => {
        onComplete?.(`BOT_${Date.now()}`);
      }, 1000);

    } catch (error) {
      onError?.('Unexpected error during order placement');
    } finally {
      setIsProcessing(false);
    }
  };

  // Start process when dialog opens
  useEffect(() => {
    if (open && steps.length > 0 && !isProcessing) {
      startOrderPlacement();
    }
  }, [open, steps.length]);

  const getStepIcon = (step: OrderStep, index: number) => {
    if (step.status === 'completed') {
      return <CheckCircle className="h-5 w-5 text-green-400" />;
    } else if (step.status === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-400" />;
    } else if (step.status === 'processing') {
      return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
    } else {
      return <Circle className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-crypto-dark border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Creating Martingale Bot</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Overall Progress</span>
              <span className="text-white">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Steps List */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-start space-x-3 p-3 rounded-lg transition-colors",
                  index === currentStep && step.status === 'processing' 
                    ? "bg-blue-500/10 border border-blue-500/20" 
                    : "bg-crypto-darker"
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getStepIcon(step, index)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{step.title}</p>
                    {step.status === 'processing' && (
                      <span className="text-xs text-blue-400">Processing...</span>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-1">{step.description}</p>
                  
                  {step.status === 'completed' && step.orderId && (
                    <div className="mt-2 text-xs text-green-400">
                      <div>Order ID: {step.orderId}</div>
                      {step.price && step.quantity && (
                        <div>Price: ${step.price} | Qty: {step.quantity}</div>
                      )}
                    </div>
                  )}
                  
                  {step.status === 'error' && step.errorMessage && (
                    <div className="mt-2 text-xs text-red-400">
                      Error: {step.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bot Configuration Summary */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Bot Configuration</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-400">Symbol: <span className="text-white">{botConfig.symbol}</span></div>
              <div className="text-gray-400">Base Order: <span className="text-white">{botConfig.baseOrderSize} USDT</span></div>
              <div className="text-gray-400">Take Profit: <span className="text-white">{botConfig.takeProfit}%</span></div>
              <div className="text-gray-400">Safety Orders: <span className="text-white">{botConfig.activeSafetyOrders || botConfig.maxSafetyOrders}</span></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}