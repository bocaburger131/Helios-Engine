# Helios Engine (monorepo)

**Canonical GitHub:** https://github.com/bocaburger131/Helios-Engine.git  
**Branch policy:** `main` = integration; Hermes/agents use `hermes/*` branches and PRs.

| Component | Path |
|-----------|------|
| API | `bank-statement-analyzer-api/` |
| Dashboard | `helios-dashboard/` |
| Start both | `npm run dev` (from repo root) or `node scripts/start-helios.js` |

See [REPO_LAYOUT.md](REPO_LAYOUT.md) and [HERMES_GITHUB.md](HERMES_GITHUB.md).

---

# Bank Statement Analyzer API

REST API for analyzing bank statements using LLM technology.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

3. Start the server:
```bash
npm start
```

## Docker Deployment

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

## API Documentation

Access the API documentation at `/api-docs` when the server is running.

## Environment Variables

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3001)
- `API_KEY`: API authentication key
- `PERPLEXITY_API_KEY`: Perplexity API key
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Cache Configuration
The API uses Redis for caching analysis results. Configure these environment variables:

- `REDIS_HOST`: Redis server host
- `REDIS_PORT`: Redis server port
- `REDIS_PASSWORD`: Redis password

## Development with Redis
1. Start Redis locally:
```bash
docker run --name redis -p 6379:6379 -d redis:alpine
```

2. Start the API:
```bash
npm run dev
```

## Monitoring

The API provides monitoring endpoints:

- `/monitoring/health` - Health check with service status
- `/monitoring/metrics` - Prometheus metrics
- `/monitoring/stats` - Usage statistics

### Metrics Available

- HTTP request duration
- Statement analysis counts
- Cache hit/miss rates
- System metrics (CPU, Memory, etc.)

### Prometheus Integration

To scrape metrics with Prometheus, add this to your prometheus.yml:

```yaml
scrape_configs:
  - job_name: 'bank-statement-analyzer'
    metrics_path: '/monitoring/metrics'
    static_configs:
      - targets: ['localhost:3001']
```
