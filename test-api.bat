@echo off
echo Testing Bot Deletion API...
echo.

REM First, get list of bots (this will help us see what's available)
echo Getting current bots...
curl -s "http://localhost:5000/api/bots" | jq . 2>nul || curl -s "http://localhost:5000/api/bots"
echo.
echo.

REM Check cycle orders table directly via a simple endpoint test
echo Checking if there are pending orders...
curl -s "http://localhost:5000/api/orders" | jq . 2>nul || curl -s "http://localhost:5000/api/orders"
echo.

echo.
echo ===================================
echo To test bot deletion:
echo 1. Note a bot ID from the list above
echo 2. Create the bot if none exist
echo 3. Run: curl -X DELETE "http://localhost:5000/api/bots/[BOT_ID]" -H "Authorization: Bearer [TOKEN]"
echo ===================================
