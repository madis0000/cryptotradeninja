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

      // Add safety orders
      for (let i = 1; i <= safetyOrderCount; i++) {
        const deviation = parseFloat(botConfig.priceDeviation) * Math.pow(botConfig.priceDeviationMultiplier, i - 1);
        initialSteps.push({
          id: `safety_order_${i}`,
          title: `Safety Order ${i}`,
          description: `Buy order at -${deviation.toFixed(1)}% from base price`,
          status: 'pending'
        });
      }

      setSteps(initialSteps);
      setCurrentStep(0);
      setOverallProgress(0);
      
      // Start the order placement process
      if (!isProcessing) {
        setIsProcessing(true);
        startOrderPlacement();
      }
    }
  }, [open, botConfig]);

  // Start order placement process
  const startOrderPlacement = async () => {
    try {
      await placeBaseOrder();
    } catch (error) {
      console.error('Error in order placement:', error);
      onError?.(error instanceof Error ? error.message : 'Order placement failed');
    }
  };

  // Place base order
  const placeBaseOrder = async () => {
    updateStepStatus('base_order', 'processing');
    
    try {
      // Simulate API call for base order
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      updateStepStatus('base_order', 'completed', 'BO-12345', '5.993', botConfig.baseOrderSize);
      setCurrentStep(1);
      setOverallProgress(33);
      
      // Place take profit order
      await placeTakeProfitOrder();
    } catch (error) {
      updateStepStatus('base_order', 'error', undefined, undefined, undefined, 'Failed to place base order');
      throw error;
    }
  };

  // Place take profit order
  const placeTakeProfitOrder = async () => {
    updateStepStatus('take_profit', 'processing');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const takeProfitPrice = (5.993 * (1 + parseFloat(botConfig.takeProfit) / 100)).toFixed(3);
      updateStepStatus('take_profit', 'completed', 'TP-12345', takeProfitPrice, botConfig.baseOrderSize);
      setCurrentStep(2);
      setOverallProgress(66);
      
      // Place safety orders
      await placeSafetyOrders();
    } catch (error) {
      updateStepStatus('take_profit', 'error', undefined, undefined, undefined, 'Failed to place take profit order');
      throw error;
    }
  };

  // Place safety orders
  const placeSafetyOrders = async () => {
    const safetyOrderCount = botConfig.activeSafetyOrders || botConfig.maxSafetyOrders;
    
    for (let i = 1; i <= safetyOrderCount; i++) {
      const stepId = `safety_order_${i}`;
      updateStepStatus(stepId, 'processing');
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const deviation = parseFloat(botConfig.priceDeviation) * Math.pow(botConfig.priceDeviationMultiplier, i - 1);
        const orderPrice = (5.993 * (1 - deviation / 100)).toFixed(3);
        
        updateStepStatus(stepId, 'completed', `SO-${12345 + i}`, orderPrice, botConfig.safetyOrderSize);
        setCurrentStep(2 + i);
        setOverallProgress(66 + (34 * i / safetyOrderCount));
      } catch (error) {
        updateStepStatus(stepId, 'error', undefined, undefined, undefined, `Failed to place safety order ${i}`);
        throw error;
      }
    }
    
    // Complete the process
    setOverallProgress(100);
    setIsProcessing(false);
    
    // Notify completion after a short delay
    setTimeout(() => {
      onComplete?.('martingale-bot-123');
    }, 1000);
  };

  // Update step status
  const updateStepStatus = (stepId: string, status: OrderStep['status'], orderId?: string, price?: string, quantity?: string, errorMessage?: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, orderId, price, quantity, errorMessage }
        : step
    ));
  };

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
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  step.status === 'completed' && "bg-green-900/20 border-green-700/50",
                  step.status === 'error' && "bg-red-900/20 border-red-700/50",
                  step.status === 'processing' && "bg-blue-900/20 border-blue-700/50",
                  step.status === 'pending' && "bg-gray-900/20 border-gray-700/50"
                )}
              >
                {getStepIcon(step, index)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-white">{step.title}</h4>
                    {step.orderId && (
                      <span className="text-xs text-gray-400">#{step.orderId}</span>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-1">{step.description}</p>
                  
                  {step.price && step.quantity && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-green-400">Price: {step.price}</span>
                      <span className="text-blue-400">Qty: {step.quantity}</span>
                    </div>
                  )}
                  
                  {step.errorMessage && (
                    <p className="text-xs text-red-400 mt-1">{step.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}