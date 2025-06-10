import { storage } from './storage';
import { BotLoggerManager } from './bot-logger';

interface CyclePnLValidation {
  cycleId: number;
  botId: number;
  tradingPair: string;
  cycleNumber: number;
  currentProfit: string;
  calculatedProfit: number;
  totalInvested: number;
  totalReceived: number;
  isCorrect: boolean;
  difference: number;
  filledBuyOrders: number;
  filledSellOrders: number;
}

export class CyclePnLValidator {
  
  /**
   * Validate P&L calculations for all completed cycles
   */
  static async validateAllCompletedCycles(): Promise<CyclePnLValidation[]> {
    console.log(`[P&L VALIDATOR] ===== STARTING CYCLE P&L VALIDATION =====`);
    
    try {
      // Get all completed cycles
      const completedCycles = await storage.getAllCompletedCycles();
      console.log(`[P&L VALIDATOR] Found ${completedCycles.length} completed cycles to validate`);
      
      const validationResults: CyclePnLValidation[] = [];
      
      for (const cycle of completedCycles) {
        const validation = await this.validateCyclePnL(cycle.id);
        if (validation) {
          validationResults.push(validation);
        }
      }
      
      // Log summary
      const incorrectCycles = validationResults.filter(v => !v.isCorrect);
      console.log(`[P&L VALIDATOR] ===== VALIDATION SUMMARY =====`);
      console.log(`[P&L VALIDATOR] Total Cycles Validated: ${validationResults.length}`);
      console.log(`[P&L VALIDATOR] Correct Calculations: ${validationResults.length - incorrectCycles.length}`);
      console.log(`[P&L VALIDATOR] Incorrect Calculations: ${incorrectCycles.length}`);
      
      if (incorrectCycles.length > 0) {
        console.log(`[P&L VALIDATOR] ===== CYCLES WITH INCORRECT P&L =====`);
        incorrectCycles.forEach(cycle => {
          console.log(`[P&L VALIDATOR] Cycle ${cycle.cycleId} (${cycle.tradingPair}): Current=${cycle.currentProfit}, Calculated=${cycle.calculatedProfit.toFixed(2)}, Diff=${cycle.difference.toFixed(2)}`);
        });
      }
      
      return validationResults;
      
    } catch (error) {
      console.error(`[P&L VALIDATOR] Error validating cycles:`, error);
      return [];
    }
  }
  
  /**
   * Validate P&L calculation for a specific cycle
   */
  static async validateCyclePnL(cycleId: number): Promise<CyclePnLValidation | null> {
    try {
      // Get cycle details
      const cycle = await storage.getBotCycle(cycleId);
      if (!cycle || cycle.status !== 'completed') {
        return null;
      }
      
      // Get bot details
      const bot = await storage.getTradingBot(cycle.botId);
      if (!bot) {
        return null;
      }
      
      // Get all cycle orders
      const allOrders = await storage.getCycleOrders(cycleId);
      
      // Calculate actual total investment from filled buy orders
      const filledBuyOrders = allOrders.filter(ord => 
        (ord.orderType === 'base_order' || ord.orderType === 'safety_order') && 
        ord.side === 'BUY' && 
        ord.status === 'filled' &&
        ord.price && ord.quantity
      );
      
      const totalInvested = filledBuyOrders.reduce((sum, ord) => {
        return sum + (parseFloat(ord.quantity) * parseFloat(ord.price || '0'));
      }, 0);
      
      // Calculate actual total received from filled sell orders
      const filledSellOrders = allOrders.filter(ord => 
        ord.orderType === 'take_profit' && 
        ord.side === 'SELL' && 
        ord.status === 'filled' &&
        ord.price && ord.quantity
      );
      
      const totalReceived = filledSellOrders.reduce((sum, ord) => {
        return sum + (parseFloat(ord.quantity) * parseFloat(ord.price || '0'));
      }, 0);
      
      // Calculate correct profit
      const calculatedProfit = totalReceived - totalInvested;
      const currentProfit = parseFloat(cycle.cycleProfit || '0');
      const difference = Math.abs(calculatedProfit - currentProfit);
      const isCorrect = difference < 0.01; // Allow for small rounding differences
      
      const validation: CyclePnLValidation = {
        cycleId,
        botId: cycle.botId,
        tradingPair: bot.tradingPair,
        cycleNumber: cycle.cycleNumber || 1,
        currentProfit: cycle.cycleProfit || '0',
        calculatedProfit,
        totalInvested,
        totalReceived,
        isCorrect,
        difference,
        filledBuyOrders: filledBuyOrders.length,
        filledSellOrders: filledSellOrders.length
      };
      
      // Log validation details for incorrect calculations
      if (!isCorrect) {
        console.log(`[P&L VALIDATOR] ❌ INCORRECT P&L - Cycle ${cycleId} (${bot.tradingPair})`);
        console.log(`[P&L VALIDATOR]    Current P&L: $${currentProfit.toFixed(2)}`);
        console.log(`[P&L VALIDATOR]    Calculated P&L: $${calculatedProfit.toFixed(2)}`);
        console.log(`[P&L VALIDATOR]    Difference: $${difference.toFixed(2)}`);
        console.log(`[P&L VALIDATOR]    Total Invested: $${totalInvested.toFixed(2)} (${filledBuyOrders.length} orders)`);
        console.log(`[P&L VALIDATOR]    Total Received: $${totalReceived.toFixed(2)} (${filledSellOrders.length} orders)`);
        
        // Log to bot-specific log file
        const logger = BotLoggerManager.getLogger(cycle.botId, bot.tradingPair);
        logger.logError('P&L_VALIDATION', `Cycle ${cycleId} P&L calculation error`, {
          currentProfit,
          calculatedProfit,
          difference,
          totalInvested,
          totalReceived,
          filledBuyOrders: filledBuyOrders.length,
          filledSellOrders: filledSellOrders.length
        });
      }
      
      return validation;
      
    } catch (error) {
      console.error(`[P&L VALIDATOR] Error validating cycle ${cycleId}:`, error);
      return null;
    }
  }
  
  /**
   * Fix P&L calculations for all incorrect cycles
   */
  static async fixIncorrectCycles(): Promise<number> {
    console.log(`[P&L VALIDATOR] ===== FIXING INCORRECT P&L CALCULATIONS =====`);
    
    const validationResults = await this.validateAllCompletedCycles();
    const incorrectCycles = validationResults.filter(v => !v.isCorrect);
    
    if (incorrectCycles.length === 0) {
      console.log(`[P&L VALIDATOR] No incorrect P&L calculations found`);
      return 0;
    }
    
    let fixedCount = 0;
    
    for (const cycle of incorrectCycles) {
      try {
        // Update the cycle profit with the correct calculation
        await storage.updateBotCycle(cycle.cycleId, {
          cycleProfit: cycle.calculatedProfit.toString()
        });
        
        console.log(`[P&L VALIDATOR] ✅ Fixed Cycle ${cycle.cycleId} (${cycle.tradingPair}): ${cycle.currentProfit} → ${cycle.calculatedProfit.toFixed(2)}`);
        
        // Log the fix
        const logger = BotLoggerManager.getLogger(cycle.botId, cycle.tradingPair);
        logger.logCustom('INFO', 'P&L_FIX', `Corrected cycle ${cycle.cycleId} P&L from ${cycle.currentProfit} to ${cycle.calculatedProfit.toFixed(2)}`, {
          cycleId: cycle.cycleId,
          oldProfit: cycle.currentProfit,
          newProfit: cycle.calculatedProfit,
          totalInvested: cycle.totalInvested,
          totalReceived: cycle.totalReceived
        });
        
        fixedCount++;
        
      } catch (error) {
        console.error(`[P&L VALIDATOR] ❌ Error fixing cycle ${cycle.cycleId}:`, error);
      }
    }
    
    console.log(`[P&L VALIDATOR] ===== P&L FIX COMPLETE =====`);
    console.log(`[P&L VALIDATOR] Fixed ${fixedCount} out of ${incorrectCycles.length} incorrect cycles`);
    
    return fixedCount;
  }
  
  /**
   * Generate a detailed P&L report for a specific bot
   */
  static async generateBotPnLReport(botId: number): Promise<CyclePnLValidation[]> {
    console.log(`[P&L VALIDATOR] Generating P&L report for bot ${botId}`);
    
    try {
      const bot = await storage.getTradingBot(botId);
      if (!bot) {
        console.error(`[P&L VALIDATOR] Bot ${botId} not found`);
        return [];
      }
      
      const cycles = await storage.getBotCycles(botId);
      const completedCycles = cycles.filter(c => c.status === 'completed');
      
      const validationResults: CyclePnLValidation[] = [];
      
      for (const cycle of completedCycles) {
        const validation = await this.validateCyclePnL(cycle.id);
        if (validation) {
          validationResults.push(validation);
        }
      }
      
      // Log bot summary
      const totalProfit = validationResults.reduce((sum, v) => sum + v.calculatedProfit, 0);
      const totalInvested = validationResults.reduce((sum, v) => sum + v.totalInvested, 0);
      const averageProfit = validationResults.length > 0 ? totalProfit / validationResults.length : 0;
      
      console.log(`[P&L VALIDATOR] ===== BOT ${botId} P&L REPORT =====`);
      console.log(`[P&L VALIDATOR] Trading Pair: ${bot.tradingPair}`);
      console.log(`[P&L VALIDATOR] Completed Cycles: ${validationResults.length}`);
      console.log(`[P&L VALIDATOR] Total P&L: $${totalProfit.toFixed(2)}`);
      console.log(`[P&L VALIDATOR] Total Invested: $${totalInvested.toFixed(2)}`);
      console.log(`[P&L VALIDATOR] Average Profit per Cycle: $${averageProfit.toFixed(2)}`);
      console.log(`[P&L VALIDATOR] Win Rate: ${validationResults.filter(v => v.calculatedProfit > 0).length}/${validationResults.length}`);
      
      return validationResults;
      
    } catch (error) {
      console.error(`[P&L VALIDATOR] Error generating bot P&L report:`, error);
      return [];
    }
  }
}