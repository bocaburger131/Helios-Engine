# AnalysisDashboard Component Documentation

## Overview

The `AnalysisDashboard` is a comprehensive React component built with Tailwind CSS that provides an admin control panel for viewing bank statement analysis results and generated alerts. It fetches data from your `/api/statements/:id` endpoint and displays it in a professional, color-coded interface.

## Features

### 🎨 Visual Design
- **Modern UI**: Clean, professional design using Tailwind CSS
- **Responsive Layout**: Works on desktop, tablet, and mobile devices
- **Color-coded Alerts**: Red (CRITICAL/HIGH), Yellow (MEDIUM), Green (LOW)
- **Interactive Elements**: Refresh button, collapsible sections
- **Loading States**: Spinner and loading messages
- **Error Handling**: User-friendly error messages with retry options

### 📊 Data Display
- **Alert Summary Cards**: Quick overview of alert counts by severity
- **Financial Overview**: Total deposits, average balance, minimum balance
- **Risk Analysis**: Risk scores, NSF counts, period information
- **Business Information**: Company details, requested amounts, industry
- **Timeline**: Analysis dates and business start dates
- **Detailed Alerts**: Full alert information with data breakdowns

### 🔄 Functionality
- **Real-time Refresh**: Manual refresh capability
- **Auto-loading**: Fetches data on mount and when statementId changes
- **Error Recovery**: Retry failed requests
- **Raw Data View**: Expandable JSON view for debugging

## Installation

### Prerequisites
```bash
npm install react react-dom lucide-react
# or
yarn add react react-dom lucide-react
```

### Tailwind CSS Setup
Ensure Tailwind CSS is installed and configured in your project:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Add to your `tailwind.config.js`:
```javascript
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## Usage

### Basic Usage

```jsx
import React from 'react';
import AnalysisDashboard from './components/AnalysisDashboard';

function App() {
  return (
    <div className="App">
      <AnalysisDashboard 
        statementId="12345"
        apiBaseUrl="/api"
      />
    </div>
  );
}

export default App;
```

### With Router Integration

```jsx
import React from 'react';
import { useParams } from 'react-router-dom';
import AnalysisDashboard from './components/AnalysisDashboard';

function StatementAnalysisPage() {
  const { id } = useParams();
  
  return (
    <AnalysisDashboard 
      statementId={id}
      apiBaseUrl={process.env.REACT_APP_API_URL || '/api'}
    />
  );
}
```

### With Authentication

```jsx
import React from 'react';
import AnalysisDashboard from './components/AnalysisDashboard';

function AdminDashboard({ statementId, authToken }) {
  // Custom fetch function with authentication
  const authenticatedFetch = async (url) => {
    return fetch(url, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
  };

  return (
    <AnalysisDashboard 
      statementId={statementId}
      apiBaseUrl="/api"
      customFetch={authenticatedFetch}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `statementId` | `string` | Required | The ID of the statement to analyze |
| `apiBaseUrl` | `string` | `'/api'` | Base URL for API calls |
| `customFetch` | `function` | `fetch` | Custom fetch function for authentication |

## API Endpoint Requirements

Your API endpoint should return data in this format:

```javascript
// GET /api/statements/:id
{
  "id": "statement_12345",
  "createdAt": "2024-01-15T10:30:00Z",
  "analysis": {
    "totalDeposits": 125000,
    "financialSummary": {
      "totalDeposits": 125000,
      "totalWithdrawals": 98000,
      "netCashFlow": 27000
    },
    "balanceAnalysis": {
      "periodDays": 90,
      "averageBalance": 850,
      "minimumBalance": -150
    }
  },
  "riskAnalysis": {
    "riskScore": 65,
    "nsfCount": 3,
    "averageBalance": 850,
    "minimumBalance": -150
  },
  "applicationData": {
    "businessName": "Tech Solutions LLC",
    "requestedAmount": 75000,
    "industry": "Technology",
    "statedAnnualRevenue": 500000,
    "businessStartDate": "2022-03-15"
  },
  "alerts": [
    {
      "code": "HIGH_NSF_COUNT",
      "severity": "HIGH",
      "message": "High number of NSF fees detected",
      "timestamp": "2024-01-15T10:30:00Z",
      "data": {
        "nsfCount": 3,
        "threshold": 2,
        "accountIndex": 0
      }
    }
  ]
}
```

## Alert Severity Color Coding

### CRITICAL Alerts
- **Background**: Light red (`bg-red-100`)
- **Border**: Red (`border-red-500`)
- **Text**: Dark red (`text-red-800`)
- **Icon**: Red (`text-red-600`)
- **Badge**: Red (`bg-red-600`)

### HIGH Alerts
- **Background**: Very light red (`bg-red-50`)
- **Border**: Medium red (`border-red-400`)
- **Text**: Red (`text-red-700`)
- **Icon**: Medium red (`text-red-500`)
- **Badge**: Medium red (`bg-red-500`)

### MEDIUM Alerts
- **Background**: Light yellow (`bg-yellow-50`)
- **Border**: Yellow (`border-yellow-400`)
- **Text**: Dark yellow (`text-yellow-800`)
- **Icon**: Yellow (`text-yellow-600`)
- **Badge**: Yellow (`bg-yellow-500`)

### LOW Alerts
- **Background**: Light green (`bg-green-50`)
- **Border**: Green (`border-green-400`)
- **Text**: Dark green (`text-green-800`)
- **Icon**: Green (`text-green-600`)
- **Badge**: Green (`bg-green-500`)

## Customization

### Custom Styling

```jsx
// Override Tailwind classes
<AnalysisDashboard 
  statementId={id}
  className="custom-dashboard"
  cardClassName="custom-card"
  alertClassName="custom-alert"
/>
```

### Custom Icons

```jsx
import { CustomIcon } from './icons';

// Modify the getSeverityIcon function
const getSeverityIcon = (severity) => {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return <CustomIcon type="critical" />;
    // ... other cases
  }
};
```

### Custom Formatting

```jsx
// Override currency formatting
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
};
```

## Integration with Express API

### Backend Route Example

```javascript
// routes/statements.js
app.get('/api/statements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch statement data
    const statement = await Statement.findById(id).populate('alerts');
    
    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }
    
    // Format response for dashboard
    const response = {
      id: statement._id,
      createdAt: statement.createdAt,
      analysis: statement.analysis,
      riskAnalysis: statement.riskAnalysis,
      applicationData: statement.applicationData,
      alerts: statement.alerts.map(alert => ({
        code: alert.code,
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        data: alert.data
      }))
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching statement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Middleware for Authentication

```javascript
// middleware/auth.js
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Use with route
app.get('/api/statements/:id', authenticateToken, getStatementHandler);
```

## Demo

Open the included demo file to see the component in action:

```bash
# Serve the demo file
npx serve demo/
# or simply open in browser
open demo/analysis-dashboard-demo.html
```

The demo includes:
- Mock data examples
- Different alert scenarios
- Error state demonstrations
- Loading state examples

## Testing

### Unit Tests Example

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { AnalysisDashboard } from './AnalysisDashboard';

test('renders loading state initially', () => {
  render(<AnalysisDashboard statementId="123" />);
  expect(screen.getByText('Loading analysis data...')).toBeInTheDocument();
});

test('displays alerts with correct severity colors', async () => {
  // Mock fetch with alert data
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockData)
    })
  );

  render(<AnalysisDashboard statementId="123" />);
  
  await waitFor(() => {
    expect(screen.getByText('HIGH_NSF_COUNT')).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Optimization Tips
1. **Memoization**: Use `React.memo` for expensive components
2. **Lazy Loading**: Load component only when needed
3. **Data Caching**: Cache API responses
4. **Virtual Scrolling**: For large alert lists

### Example with React.memo

```jsx
import React, { memo } from 'react';

const AnalysisDashboard = memo(({ statementId, apiBaseUrl }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  return prevProps.statementId === nextProps.statementId;
});
```

## Browser Support

- **Modern Browsers**: Chrome 91+, Firefox 89+, Safari 14+
- **Mobile**: iOS Safari 14+, Chrome Mobile 91+
- **Fallbacks**: Graceful degradation for older browsers

## Troubleshooting

### Common Issues

1. **API Endpoint Not Found**
   - Verify the `apiBaseUrl` prop
   - Check network tab in developer tools
   - Ensure backend route is correctly configured

2. **Styling Issues**
   - Verify Tailwind CSS is properly installed
   - Check for CSS conflicts
   - Ensure proper import order

3. **Icons Not Displaying**
   - Verify `lucide-react` is installed
   - Check for import errors
   - Ensure icon names are correct

### Debug Mode

```jsx
<AnalysisDashboard 
  statementId={id}
  debug={true} // Enables console logging
/>
```

## Contributing

To contribute to this component:

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure responsive design
5. Test across different browsers

## License

This component is part of the Bank Statement Analyzer API project.
