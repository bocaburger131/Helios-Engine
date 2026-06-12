# Bank Statement Analyzer - Zoho CRM Integration Guide

This guide will help you integrate the Bank Statement Analyzer API with your Zoho CRM instance to sync bank statement data and financial analysis results directly to your CRM.

## Setup Requirements

Before you begin, you'll need:

1. A Zoho CRM account with administrator access
2. Access to the Zoho Developer Console
3. Your Bank Statement Analyzer API up and running

## Step 1: Set Up Zoho CRM API Access

1. **Create a Self-Client Application in Zoho Developer Console**:
   - Log in to [Zoho Developer Console](https://api-console.zoho.com/)
   - Click "Self Client" under "Client Type"
   - Set the "Client Name" to "Bank Statement Analyzer Integration"
   - Under "Scopes" add the following scopes:
     - `ZohoCRM.modules.ALL`
     - `ZohoCRM.settings.ALL`
   - Click "Create"
   - Save the Client ID and Client Secret that are generated

2. **Generate a Refresh Token**:
   - In the Self Client application you just created, click "Generate Code"
   - Select your Zoho CRM account from the dropdown
   - After granting permissions, you'll receive a code
   - Use this code to generate a refresh token by making the following request:

   ```
   POST https://accounts.zoho.com/oauth/v2/token?code={code}&client_id={client_id}&client_secret={client_secret}&grant_type=authorization_code
   ```

   - Save the refresh token from the response

## Step 2: Create Required Modules in Zoho CRM

You need to create two custom modules in your Zoho CRM:

### 1. Create "Transactions" Module:

1. In Zoho CRM, go to Setup > Customization > Modules > Create Module
2. Set Module Name as "Transactions"
3. Add the following fields:
   - Date (Date field)
   - Amount (Currency field)
   - Description (Text field)
   - Category (Text field)
   - Type (Picklist: Income, Expense)
   - Bank_Account_Name (Text field)
   - Statement_ID (Text field)
   - Transaction_ID (Text field)

### 2. Create "Financial_Analysis" Module:

1. In Zoho CRM, go to Setup > Customization > Modules > Create Module
2. Set Module Name as "Financial_Analysis"
3. Add the following fields:
   - Name (Text field)
   - Analysis_ID (Text field)
   - Account_Name (Text field)
   - Account_Number (Text field)
   - Bank_Name (Text field)
   - Statement_Start_Date (Date field)
   - Statement_End_Date (Date field)
   - Total_Income (Currency field)
   - Total_Expenses (Currency field)
   - Net_Cash_Flow (Currency field)
   - Average_Daily_Balance (Currency field)
   - Analysis_Date (Date/Time field)
   - Transaction_Count (Number field)

## Step 3: Configure the Bank Statement Analyzer API

1. **Update Environment Variables**:
   
   Add the following variables to your `.env` file:

   ```
   ZOHO_CRM_URL=https://www.zohoapis.com/crm/v2
   ZOHO_CLIENT_ID=your_client_id
   ZOHO_CLIENT_SECRET=your_client_secret
   ZOHO_REFRESH_TOKEN=your_refresh_token
   ```

2. **Restart Your API Server**:
   
   After updating the environment variables, restart your Bank Statement Analyzer API server to apply the changes.

## Step 4: Test the Integration

1. **Check Connection Status**:
   
   Make a GET request to verify the connection is working:

   ```
   GET /api/zoho/status
   Headers: X-API-KEY: your_api_key
   ```

   You should receive a response indicating successful connection to Zoho CRM.

2. **Configure Field Mappings** (Optional):
   
   If you need custom field mappings, make a POST request:

   ```
   POST /api/zoho/setup
   Headers: X-API-KEY: your_api_key
   Content-Type: application/json
   
   {
     "authToken": "your_access_token",
     "crmUrl": "https://www.zohoapis.com/crm/v2",
     "fieldMappings": {
       "transaction": {
         "date": "Transaction_Date",
         "amount": "Transaction_Amount"
       }
     }
   }
   ```

## Step 5: Sync Bank Statement Analysis to Zoho CRM

After running a bank statement analysis, you can sync the results to Zoho CRM:

```
POST /api/zoho/sync/analysis/:analysisId
Headers: X-API-KEY: your_api_key
```

Replace `:analysisId` with the ID of the analysis you want to sync.

## Data Flow

The integration follows this workflow:

1. Bank statements are uploaded and analyzed by the Bank Statement Analyzer API
2. Analysis results are stored in the Bank Statement Analyzer database
3. You trigger a sync to Zoho CRM for a specific analysis
4. The API sends the transaction data to the "Transactions" module in Zoho CRM
5. The API sends the summary analysis to the "Financial_Analysis" module in Zoho CRM

## Troubleshooting

### Common Issues:

1. **Authentication Errors**:
   - Verify that your Client ID, Client Secret, and Refresh Token are correct
   - Check that your tokens haven't expired
   - Ensure the API has the correct scopes

2. **Module Not Found Errors**:
   - Verify you've created both "Transactions" and "Financial_Analysis" modules in Zoho CRM
   - Ensure field names match exactly as specified above

3. **Field Mapping Errors**:
   - Check that all required fields exist in your Zoho CRM modules
   - Verify custom field mappings if you've specified any

### Getting Help:

If you're experiencing issues with the Zoho CRM integration, check the API logs for detailed error messages and contact support with the following information:

1. The specific error message from the API logs
2. The API endpoint you were trying to access
3. The status response from `/api/zoho/status`

## Security Considerations

The Bank Statement Analyzer API securely handles Zoho CRM credentials:

1. All credentials are stored as environment variables, not in the code
2. Access tokens are cached in Redis with appropriate expiration
3. All API requests use HTTPS
4. The API implements a circuit breaker pattern to prevent excessive calls to Zoho CRM

## Advanced Configuration

For advanced users who need custom field mappings or integration with specific Zoho CRM workflows, you can:

1. Modify the `mapTransactionsToZohoFormat` and `mapAnalysisSummaryToZohoFormat` methods in the `zohoService.js` file
2. Add additional endpoints to the `zohoRoutes.js` file
3. Create custom triggers or workflows in Zoho CRM to process the data after it's synced
