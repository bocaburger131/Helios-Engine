@echo off
echo ============================================
echo COMPREHENSIVE TEST FIX VERIFICATION
echo ============================================
echo.
echo Testing all three layers of fixes...
echo.

echo Layer 1: Mock Setup Fixes...
npx vitest run test-all-layers-fixed.js --reporter=verbose --grep="Layer 1"
echo.

echo Layer 2: Application Crash Prevention...
npx vitest run test-all-layers-fixed.js --reporter=verbose --grep="Layer 2"
echo.

echo Layer 3: Logic ^& Validation Fixes...
npx vitest run test-all-layers-fixed.js --reporter=verbose --grep="Layer 3"
echo.

echo Integration Test Compatibility...
npx vitest run test-all-layers-fixed.js --reporter=verbose --grep="Integration"
echo.

echo ============================================
echo Running your original tests to verify fixes...
echo ============================================
npx vitest run tests/unit/riskAnalysisService.test.js --reporter=basic
echo.

echo Testing IncomeStabilityService...
node debug-income-service.js
echo.

echo ============================================
echo ALL COMPREHENSIVE FIXES VERIFICATION COMPLETE
echo ============================================
pause
