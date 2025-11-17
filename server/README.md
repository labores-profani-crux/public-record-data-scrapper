# UCC-MCA Intelligence API Server

Express.js REST API backend for the UCC-MCA Intelligence Platform.

## Directory Structure

```
server/
├── config/              # Configuration files
│   └── index.ts        # Server configuration
├── database/           # Database connection and utilities
│   └── connection.ts   # PostgreSQL connection pool
├── middleware/         # Express middleware
│   ├── errorHandler.ts      # Global error handling
│   ├── requestLogger.ts     # Request logging with correlation IDs
│   ├── rateLimiter.ts       # Rate limiting
│   └── validateRequest.ts   # Zod schema validation
├── routes/             # API route handlers
│   ├── prospects.ts    # Prospect endpoints
│   └── health.ts       # Health check endpoints
├── services/           # Business logic layer
│   └── ProspectsService.ts  # Prospect operations
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── index.ts            # Server entry point
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## API Endpoints

### Health Checks
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health with dependencies
- `GET /api/health/ready` - Kubernetes readiness probe
- `GET /api/health/live` - Kubernetes liveness probe

### Prospects
- `GET /api/prospects` - List prospects (paginated, filtered, sorted)
- `GET /api/prospects/:id` - Get prospect details
- `POST /api/prospects` - Create prospect
- `PATCH /api/prospects/:id` - Update prospect
- `DELETE /api/prospects/:id` - Delete prospect

## Environment Variables

See `.env.example` in the project root for all available environment variables.

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis (optional, for Phase 3)

### Installation

```bash
# Install dependencies (from project root)
npm install --legacy-peer-deps
```

### Database Setup

```bash
# Create database
createdb ucc_intelligence

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### Development

```bash
# Run backend server only
npm run dev:server

# Run both frontend and backend
npm run dev:all
```

The server will start on http://localhost:3000

### Production Build

```bash
# Build backend
npm run build:server

# Start production server
npm run start:server
```

## Architecture

### Request Flow

```
Client Request
  ↓
[Rate Limiter] → 429 if exceeded
  ↓
[Request Logger] → Assigns correlation ID
  ↓
[Route Handler] → Express router
  ↓
[Validation Middleware] → Zod schema validation
  ↓
[Service Layer] → Business logic
  ↓
[Database] → PostgreSQL queries
  ↓
[Response] → JSON response
  ↓
[Error Handler] → Global error catching
```

### Error Handling

All errors are caught by the global error handler and returned in a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "correlationId": "uuid-here"
  }
}
```

### Validation

All request data is validated using Zod schemas. Invalid requests return 400 with details:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "company_name",
        "message": "String must contain at least 1 character(s)"
      }
    ]
  }
}
```

### Rate Limiting

Default rate limit: 100 requests per 15 minutes per IP address.

Response headers:
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Timestamp when limit resets
- `Retry-After` - Seconds until retry (when limited)

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Logging

All requests are logged with:
- Timestamp
- Correlation ID (UUID)
- HTTP method and path
- Status code
- Response time

Example log:
```
[REQUEST] {
  timestamp: '2025-01-17T10:30:00.000Z',
  correlationId: 'abc-123',
  method: 'GET',
  path: '/api/prospects',
  ip: '127.0.0.1'
}
[RESPONSE] {
  timestamp: '2025-01-17T10:30:00.150Z',
  correlationId: 'abc-123',
  method: 'GET',
  path: '/api/prospects',
  statusCode: 200,
  duration: '150ms'
}
```

## Performance

### Database Connection Pooling

- Max connections: 20 (configurable via `DB_MAX_CONNECTIONS`)
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

### Response Time Targets

- P95 latency: <500ms
- P99 latency: <1s
- Database queries: <100ms P95

## Security

### Implemented
- Helmet.js security headers
- CORS configuration
- Rate limiting
- Input validation (Zod)
- SQL injection prevention (parameterized queries)

### Planned (Phase 4)
- JWT authentication
- API key authentication
- Role-based access control (RBAC)
- Data encryption
- Audit logging

## Monitoring

### Health Checks

The `/api/health/detailed` endpoint checks:
- Database connectivity
- Memory usage
- CPU usage

### Metrics (Phase 5)

Will expose Prometheus metrics at `/metrics`:
- HTTP request duration
- Request count by route and status
- Database connection pool stats
- Memory and CPU usage

## Deployment

See `docs/tasks/PHASE_5_TASKS.md` for production deployment instructions.

### Docker (Coming in Phase 5)

```bash
# Build image
docker build -t ucc-intelligence-api .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  ucc-intelligence-api
```

## Troubleshooting

### Database Connection Errors

```bash
# Check PostgreSQL is running
pg_isready

# Test connection manually
psql $DATABASE_URL
```

### Port Already in Use

```bash
# Kill process on port 3000
npm run kill

# Or use different port
PORT=3001 npm run dev:server
```

### Module Not Found Errors

```bash
# Clean install
rm -rf node_modules
npm install --legacy-peer-deps
```

## Contributing

See `CONTRIBUTING.md` in the project root.

## License

MIT - See `LICENSE` file
