# Bank Statement Analyzer API Documentation

## Overview

The Bank Statement Analyzer API is a service that processes bank statements through Zoho CRM integration. It provides asynchronous analysis of PDF bank statements, with real-time status updates and comprehensive error handling.

## Authentication

All API endpoints require authentication using an API key header:

```
X-API-Key: your-api-key-here
```

## Rate Limiting

The API implements the following rate limits:

- General endpoints: 100 requests per 15 minutes per IP
- Authentication: 5 attempts per hour per IP
- Zoho operations: 30 requests per minute per IP

## Endpoints

### Start Analysis

```http
POST /api/zoho/start-analysis
```

Initiates the analysis of bank statements for a specified Zoho deal.

#### Request Body

```json
{
  "dealId": "string",
  "metadata": {
    "requestedBy": "string",
    "priority": "low|medium|high"
  },
  "dateRange": {
    "start": "ISO8601 date",
    "end": "ISO8601 date"
  },
  "options": {
    "notify": boolean
  }
}
```

#### Response

```json
{
  "success": true,
  "message": "Analysis started. Results will be available in Zoho CRM.",
  "data": {
    "jobId": "string",
    "dealId": "string",
    "filesQueued": number,
    "statusEndpoint": "/api/zoho/analysis-status/{jobId}"
  }
}
```

### Check Analysis Status

```http
GET /api/zoho/analysis-status/:jobId
```

Retrieves the current status of an analysis job.

#### Response

```json
{
  "success": true,
  "data": {
    "jobId": "string",
    "status": {
      "type": "string",
      "status": "string",
      "progress": number,
      "error": string|null
    }
  }
}
```

## Error Handling

The API uses standard HTTP status codes and returns errors in the following format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "details": {} // Optional additional error details
}
```

Common status codes:
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 429: Too Many Requests
- 500: Internal Server Error

## Monitoring

The API provides monitoring endpoints for metrics and health checks:

### Metrics

```http
GET /metrics
```

Returns Prometheus-compatible metrics including:
- HTTP request duration and counts
- Job processing statistics
- Error rates
- Redis queue size
- Zoho API call statistics

### Health Check

```http
GET /health
```

Returns the health status of all system components:
- API server status
- Redis connection
- Zoho CRM connection
- Job queue status

## Dashboard

The job queue dashboard is available at:

```
GET /dashboard
```

Features:
- Real-time queue statistics
- Job status distribution
- Processing time graphs
- Failed job management
- Job retry functionality

## Development

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Zoho CRM Configuration
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
ZOHO_API_DOMAIN=https://www.zohoapis.com

# Dashboard Configuration
DASHBOARD_PASSWORD=your_dashboard_password
```

### Running Tests

```bash
npm test
```

### API Testing

A Postman collection is available in the `docs/postman` directory.
