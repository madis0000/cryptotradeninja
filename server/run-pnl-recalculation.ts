import { PnLRecalculator } from './recalculate-pnl';

/**
 * Script to recalculate P&L for all completed cycles
 * Run this to fix any calculation errors in existing completed cycles
 */
async function runPnLRecalculation() {
  console.log(`Starting P&L recalculation process...`);
  
  try {
    // Recalculate all completed cycles
    const results = await PnLRecalculator.recalculateAllCompletedCycles();
    
    // Generate detailed correction report
    await PnLRecalculator.generateCorrectionReport();
    
    console.log(`P&L recalculation process completed successfully`);
    
  } catch (error) {
    console.error(`Error during P&L recalculation:`, error);
  }
}

// Execute the recalculation
runPnLRecalculation();