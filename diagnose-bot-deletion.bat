@echo off
echo 🔍 Bot Deletion Diagnostic Script
echo ==================================
echo.

echo 1. Checking if server is running...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5000' -TimeoutSec 5 -ErrorAction Stop; Write-Host '✅ Server is running' } catch { Write-Host '❌ Server not responding. Please start with: npm run dev' }"
echo.

echo 2. Database Studio Access
echo =========================
echo To check database state, run: npm run db:studio
echo This will open a web interface to view all tables and data.
echo.

echo 3. Manual Testing Instructions
echo ==============================
echo.
echo Before testing bot deletion:
echo 1. Open http://localhost:5000 in your browser
echo 2. Login and create a bot if none exist
echo 3. Let the bot place some orders (or manually create test orders)
echo 4. Note the bot ID and number of orders
echo.
echo To verify deletion works:
echo 1. Open database studio in another tab: npm run db:studio
echo 2. Check the 'cycle_orders' table - note orders for your bot
echo 3. Delete the bot through the web interface
echo 4. Refresh the database studio and check if orders are gone
echo 5. Also check that the bot is removed from 'trading_bots' table
echo.

echo 4. Expected Server Logs
echo =======================
echo When deleting a bot, you should see these logs in the terminal:
echo - [DELETE BOT] Starting enhanced delete process for bot X
echo - [DELETE BOT] Cancelling N pending orders for bot X
echo - [DELETE BOT] Deleting bot X with N cycles, M orders, P trades  
echo - [DELETE BOT] Bot X deleted successfully
echo.

echo 5. Troubleshooting
echo ==================
echo.
echo If orders remain after deletion:
echo.
echo ❌ Orders visible in UI but NOT in database:
echo    ✅ Clear browser cache and refresh
echo.
echo ❌ Orders exist in database after deletion:
echo    ✅ Check server terminal for error messages
echo    ✅ Verify API credentials are correct
echo    ✅ Check if bot deletion completed successfully
echo.
echo ❌ Deletion fails completely:
echo    ✅ Check browser console (F12) for JavaScript errors
echo    ✅ Verify you're logged in properly
echo    ✅ Check server logs for authentication/database errors
echo.

echo 6. Next Steps
echo =============
echo After testing, please report:
echo - Bot ID that was deleted
echo - Whether orders remain in 'cycle_orders' table (check via database studio)
echo - Any error messages from server terminal
echo - Any error messages from browser console (F12)
echo.
echo Press any key to exit...
pause >nul
