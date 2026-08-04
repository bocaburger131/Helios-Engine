# Database Architecture Patterns & Recommendations (2025&ndash;2026)

Research conducted: July 2026 | Sources: microservices.io, Tinybird, Codelit.io, MindStudio, AESTECHNO, GeneralistProgrammer, Acceldata, Reddit

---

## 1. Database Selection by Project Type

### 1A. Mobile Game Backend

**Recommendation: Polyglot Persistence (multiple databases)**

| Concern | Database | Rationale |
|---------|----------|-----------|
| Player accounts, economy, inventory | **PostgreSQL** | ACID transactions for currency/items. Referential integrity. 10-50ms indexed queries. JSONB for flexible metadata. |
| Player progression, achievements | **MongoDB** | Document model maps naturally to deeply nested player state. Flexible schema for frequent feature additions. 5-30ms indexed queries. |
| Sessions, leaderboards, matchmaking, caches | **Redis** | Sorted sets for real-time leaderboards (ZADD/ZRANGE, 0.1-2ms). Key-value for session tokens with TTL. Pub/Sub for matchmaking queues. |
| Player-generated content | **S3 / Cloud Storage** | Binary blobs (screenshots, replays, custom maps). Cheap, scalable, CDN-friendly. |

**BaaS alternative (smaller teams):**

- **Supabase** (PostgreSQL-based) over **Firebase** for 2025-2026:
  - Supabase gives you real SQL, row-level security, auto-generated REST/GraphQL APIs, and easier migration paths.
  - Firebase (Firestore) is NoSQL -- great for real-time sync and mobile SDKs, but relational data (inventory, economy) gets awkward fast. Pricing can spike at scale.
  - **Verdict:** Supabase for most new projects. Firebase only if you need real-time WebSocket push and are comfortable with NoSQL.

**Common mistake:** Putting everything in one database. A game leaderboard query pattern (sorted set range scan, sub-ms) is completely different from an inventory transaction (ACID, multi-row). Use the right tool per concern.

**Schema example (PostgreSQL player accounts):**
See generalistprogrammer.com for full DDL on players, item_definitions, player_inventory tables with proper indexing, CHECK constraints, and JSONB for extensibility.

**Key indexes for game DBs:**
```sql
-- Partial index for active players only
CREATE INDEX idx_players_email ON players(email) WHERE deleted_at IS NULL;
-- GIN index for JSON metadata queries
CREATE INDEX idx_players_metadata ON players USING GIN(metadata);
-- Covering index for leaderboard queries
CREATE INDEX idx_players_score ON players(score DESC) INCLUDE (display_name);
```

---

### 1B. Web Dashboard (Admin / Analytics)

**Recommendation: PostgreSQL + optional OLAP sidecar**

For most dashboards, **PostgreSQL is the safe default in 2026.** It handles:
- Structured relational data (users, orders, projects)
- JSON/JSONB for semi-structured data
- Window functions for analytics without a separate OLAP engine
- Full-text search via tsvector
- Materialized views for pre-computed dashboards

**When PostgreSQL is enough:**
- Less than 10M rows in largest table
- Dashboard refresh acceptable at 1-30s intervals
- Fewer than ~100 concurrent dashboard users
- No sub-second requirements on complex aggregations

**When to add a real-time OLAP engine:**
- Millions of events per second ingestion
- Sub-100ms query latency on aggregations over trillions of rows
- High query concurrency (thousands of simultaneous users)

**OLAP options ranked (2026):**
1. **ClickHouse** -- Gold standard for real-time analytics. Columnar, incredibly fast on aggregations.
2. **Apache Druid** -- Sub-second OLAP on streaming data. Strong for time-series dashboards.
3. **Apache Pinot** -- LinkedIn-originated, strong for user-facing analytics at scale.
4. **TimescaleDB** -- PostgreSQL extension. Best when you want SQL + time-series without leaving Postgres.

**Dashboard tech stack (common pattern):**
```
PostgreSQL (OLTP) --CDC--> Kafka/Redis Streams --> ClickHouse (OLAP) --> Dashboard queries
```

**BaaS option for web dashboards:**
- **Supabase** -- Postgres + auth + auto-generated APIs. Excellent for internal tools.
- **Retool / Appsmith / Budibase** -- Low-code dashboard builders that sit on top of your database.

---

### 1C. Real-Time Event Pipeline

**Recommendation: Kafka/Redis Streams + specialized storage**

Real-time event pipelines have fundamentally different requirements from OLTP:

| Layer | Technology | Role |
|-------|-----------|------|
| Event Bus / Streaming | **Apache Kafka** (primary) or **Redis Streams** (lightweight) | Ingest millions of events/sec, persistent log, replay capability, exactly-once semantics |
| Stream Processing | **Kafka Streams / Flink / Spark Streaming** | Transform, enrich, window, aggregate in-flight |
| Real-Time Serving | **ClickHouse / Druid / Pinot** | Sub-second analytical queries on fresh data |
| Hot Cache | **Redis** | Real-time counters, leaderboards, rate limiting (0.1-2ms) |
| Cold Archive | **S3 / Parquet / Iceberg** | Long-term retention, batch analytics |

**Architecture pattern:**
```
Producers --> Kafka --> Stream Processor --> Real-Time DB (ClickHouse/Druid)
                |                                   |
                +--> Dead Letter Queue              +--> Redis (hot cache)
                                                    |
                                                    +--> S3 (cold storage, Iceberg/Parquet)
```

**Kafka vs Redis Streams decision:**
- **Kafka:** Persistence, replay, exactly-once, massive throughput (millions msg/s), multi-consumer groups. Default for serious event pipelines.
- **Redis Streams:** Lower operational overhead, good for moderate throughput, already in your stack if you use Redis. Consumer groups supported. Better for lightweight event-driven architectures.

**Database choice for the pipeline serving layer:**
- NOT PostgreSQL (will hit a wall -- full table scans, statement timeouts, connection pool exhaustion)
- NOT MongoDB (not designed for real-time aggregations at scale)
- YES to ClickHouse, Druid, or Pinot -- purpose-built for this exact workload

**Key architectural principle:** Never query your event bus directly for analytics. Always land events into a serving layer optimized for queries.

---

### 1D. BLE Device Data Store

**Recommendation: SQLite (edge) -> TimescaleDB/InfluxDB (cloud)**

BLE devices generate continuous time-series sensor data. The architecture splits naturally:

| Location | Database | Why |
|----------|----------|-----|
| Edge / Gateway | **SQLite** | 600KB binary, less than 1MB RAM, zero connectivity needed. Buffers data locally, syncs when online. Mature, public domain. |
| Cloud / Server | **TimescaleDB** or **InfluxDB** | Time-series optimized. 8-12x compression. High write throughput. Full SQL (TimescaleDB) or Flux (InfluxDB). |

**SQLite on the edge:**
- Sustains thousands of events/s on embedded Linux gateways
- MQTT buffer can sit alongside Redis on the same gateway
- File-level locking means it is NOT suitable for continuous massive flows -- it is a buffer/sync layer
- Common pattern: SQLite outbox table -> MQTT publish -> cloud ingestion

**Cloud time-series options:**

| Database | Write Throughput | Query Latency (p99) | Best For |
|----------|-----------------|---------------------|----------|
| TimescaleDB | ~200K points/s (16-core, NVMe) | ~12ms | SQL + time-series together. Fleet management, alerts, users + sensors. |
| InfluxDB | ~280K points/s (same HW) | <50ms | Pure metrics/monitoring. High-cardinality sensor data. |
| ClickHouse | Millions rows/s | <100ms | Massive-scale analytics. Not a direct replacement for TimescaleDB, but overlaps. |

**Data pipeline for BLE:**
```
Sensor (BLE) --> Gateway (SQLite + outbox) --MQTT--> Broker (Mosquitto/HiveMQ)
                                                         |
                                                         v
                                              Telegraf/Kafka --> TimescaleDB/InfluxDB
                                                         |
                                                         v
                                              S3 Glacier (cold, 5-10yr retention)
```

**Retention tiers (rule: 1 sample/s approx 30 GB/sensor/year uncompressed):**
- **Hot (7 days):** Full resolution, TimescaleDB/InfluxDB, p99 < 50ms
- **Warm (90 days):** 1-min/hour aggregates, 100-500ms latency
- **Cold (5-7 years):** S3 Glacier + Parquet, daily means

**TimescaleDB recommended over pure InfluxDB when:**
- You need to join sensor data with business records (users, devices, fleets)
- You already use PostgreSQL and want to minimize operational complexity
- You need standard BI tool compatibility (Tableau, Metabase work natively with Postgres)

---

## 2. Database-Per-Microservice vs Shared Database

### Current Best Practice: Database-Per-Service (with nuance)

The industry consensus in 2025-2026 strongly favors **database-per-service**, but with practical caveats:

**The canonical pattern (from microservices.io):**
> "Keep each microservice's persistent data private to that service and accessible only via its API. A service's transactions only involve its database."

**Three implementation tiers (increasing isolation):**

| Tier | Approach | Isolation | Overhead | When to use |
|------|----------|-----------|----------|-------------|
| 1 | Private-tables-per-service | Weak | Lowest | Early stage, small team, same DB engine |
| 2 | Schema-per-service | Medium | Low | Clearer ownership, separate credentials per schema |
| 3 | Database-server-per-service | Strong | High | High-throughput services, polyglot persistence, independent scaling |

**Enforcement:** Assign different database user IDs per service, use GRANTs to restrict table access.

### The Nuance: "Absolutely fine to share" -- but with boundaries

From Arpit Bhayani (2025 LinkedIn post, widely discussed):
> "Absolutely fine to share database among microservices. Only thing you should be cautious is to maintain domain boundaries."

The pragmatic position for 2025-2026:

- **Start monolith/monorepo with a shared DB.** Premature microservices are the number 1 cause of over-engineering in early-stage projects.
- **Split into database-per-service when:**
  - A service needs a fundamentally different database type (e.g., ElasticSearch for search, Redis for caching)
  - Two teams need independent deploy cycles and cannot coordinate schema changes
  - A service's scaling profile is radically different from others
  - You are hitting cross-team schema conflict pain
- **Shared database is acceptable for:**
  - Small teams (< 10 engineers) where coordination cost is low
  - Tightly coupled domains where cross-service JOINs are frequent
  - Read-only reporting services with materialized views
  - Internal tools and admin dashboards

**The anti-pattern to avoid:**
Multiple services reading/writing each other's tables directly, bypassing APIs. This creates tight coupling and makes schema changes dangerous.

---

## 3. Preventing Schema Drift & Data Isolation

### What is schema drift?

Unintended structural divergence between environments (dev, staging, production) or between services. Example: adding a column in production without migrating staging, causing application crashes.

### Prevention strategies (ranked by effectiveness):

1. **Migrations as sole source of truth**
   - Never apply schema changes manually in any environment. All changes go through version-controlled migration files.

2. **CI/CD-integrated migration tooling**
   - Run migrate validate / migrate lint in CI on every PR
   - Auto-apply to staging, require manual approval for production
   - Tools that detect drift: Flyway, Liquibase, Prisma Migrate, Atlas all do this. **goose does not.**

3. **Database access control**
   - Separate database users per service with least-privilege GRANTs
   - Production: application user has INSERT/UPDATE/DELETE/SELECT only on its own schema
   - No human has DDL privileges in production -- only the CI/CD migration runner

4. **Schema registry for event-driven architectures**
   - Use a centralized schema registry (Confluent Schema Registry, Apicurio) for Kafka/event schemas
   - Enforce backward compatibility (FORWARD, BACKWARD, FULL)
   - Version all event schemas; never break consumers

5. **Declarative schema management**
   - Define desired state in code (Atlas HCL, Prisma schema, Liquibase changelog)
   - Tool computes the diff and generates migration
   - "Desired state -> Plan -> Apply" (Terraform model applied to databases)

### Keeping projects from mixing data:

**Namespace isolation strategies:**

| Strategy | Mechanism | Best For |
|----------|-----------|----------|
| Separate databases | Different DB instances entirely | Independent projects with zero overlap |
| Separate schemas | project_a.players, project_b.players within same Postgres instance | Related projects, shared infrastructure |
| Row-level security (RLS) | Postgres RLS policies on project_id column | Multi-tenant SaaS, same table structure |
| Table prefixing | proj_a_players, proj_b_players | Legacy systems, no schema support |
| Separate DB users + GRANTs | User proj_a can only see its own tables/schemas | Enforces isolation at the access control level |

**Recommended approach:** Separate databases per project unless they share business logic. Within a project, use schema-per-microservice for isolation.

---

## 4. Database Migration Management Tools

### Comparison (2025-2026)

| Feature | Flyway | Liquibase | Prisma Migrate | Atlas | goose | Alembic |
|---------|--------|-----------|----------------|-------|-------|---------|
| Language | Java | Java | Node.js/TS | Go | Go | Python |
| Migration format | SQL | XML/YAML/JSON/SQL | Generated SQL | HCL/SQL | SQL/Go | Python/SQL |
| Declarative mode | No | Diff changelog | Yes (schema file) | Yes (HCL) | No | No |
| Rollback | Paid (Teams) | Built-in | Manual (forward-only) | Computed (review!) | Built-in | Built-in |
| Schema drift detection | Yes | Yes | Yes | Yes | No | No |
| DB support | 20+ | 50+ | 6 | 6 | 6 | PG, MySQL, SQLite, MSSQL |
| CI/CD | Gradle/Maven/CLI | Gradle/Maven/CLI | npm scripts | GitHub Actions | CLI | CLI |
| Pricing | Free + Teams | Free + Pro | Free + Cloud | Free + Cloud | Free (OSS) | Free (OSS) |
| Best for | JVM teams, pure SQL | Multi-DB vendors | TypeScript/Node.js teams | Terraform-like declarative | Go teams, simplicity | Python/SQLAlchemy teams |

### Recommendations by stack:

| Your Stack | Use | Why |
|------------|-----|-----|
| Node.js / TypeScript / Next.js | **Prisma Migrate** or **Drizzle Kit** | Native to the ecosystem. Prisma for full ORM, Drizzle for lightweight type-safe SQL. |
| Python / FastAPI / Django | **Alembic** | Deep SQLAlchemy integration. Standard in the Python world. |
| Go | **Atlas** (declarative) or **goose** (minimal) | Atlas if you want Terraform-like workflow. Goose if you want simple up/down SQL. |
| Java / Spring Boot | **Flyway** or **Liquibase** | Flyway for pure SQL, Liquibase for multi-database abstraction. |
| Polyglot / Multi-DB | **Liquibase** | 50+ database support, vendor-agnostic changelogs. |
| Infrastructure-as-code shop | **Atlas** | HCL-based, GitOps workflow, GitHub Actions integration, diff-as-PR-comment. |

### Rollback Strategy

Tools differ most on rollback. The industry is converging on **forward-only** as production best practice:

> "Rollback scripts are rarely tested. A forward-only migration (write a new migration to undo) is safer in production than running an untested down script." -- Codelit.io

**Three patterns:**
1. **Explicit down migrations** (goose, Liquibase, Alembic) -- Each up has a paired down. Good for dev, dangerous in production (dropped data cannot be recovered).
2. **Computed rollback** (Atlas) -- Auto-generates reverse diff. Always review for data loss.
3. **Forward-only** (Prisma, Flyway free) -- Write a new migration to undo. Safest for production.

---

## 5. Separation of Concerns: Game State vs Analytics vs User Profiles

### Why separate databases by concern?

Different data has different:
- **Access patterns** (point reads vs. range scans vs. aggregations)
- **Consistency requirements** (strong consistency for currency vs. eventual for analytics)
- **Scaling profiles** (vertical scaling for accounts vs. horizontal for events)
- **Query shapes** (JOIN-heavy user queries vs. GROUP BY/aggregate analytics queries)
- **Retention policies** (user data forever vs. analytics data aged out after N days)

### Recommended Separation Architecture:

```
                    APPLICATION LAYER
              (Game Server / API Gateway / BFF)
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
    USER PROFILE    GAME STATE     ANALYTICS
       DB               DB             DB
                         |
    PostgreSQL     Redis (hot)    ClickHouse
    (ACID, PII)    + PostgreSQL   / Druid /
                   (durable)      TimescaleDB
                         |
    Examples:      Examples:      Examples:
    - auth         - match state  - telemetry
    - email        - inventory    - DAU/MAU
    - billing      - progress     - funnel
    - friends      - sessions     - retention
          |              |              |
          +--------------+--------------+
                         |
                         v
                    EVENT BUS
               (Kafka / Redis Streams)
```

### Detailed breakdown:

| Concern | Database | Consistency | Scaling | Retention |
|---------|----------|-------------|---------|-----------|
| User Profiles (accounts, auth, billing, PII) | PostgreSQL | Strong (ACID) | Vertical + read replicas | Forever (GDPR delete on request) |
| Game State - Hot (active matches, sessions) | Redis | Best-effort (cache) | Horizontal clustering | TTL (minutes to hours) |
| Game State - Durable (inventory, progression, economy) | PostgreSQL + MongoDB | Strong (transactions) | Vertical + sharding | Forever (player lifetime) |
| Analytics - Real-time (live dashboards, ops) | ClickHouse / Druid | Eventual | Horizontal | 7-90 days |
| Analytics - Historical (reports, ML training) | S3 + Parquet/Iceberg | Eventual | Infinite (object store) | Years |

### Key principles:

1. **Never run analytical queries against your OLTP database.** A COUNT(*) GROUP BY over millions of rows will block player transactions.

2. **Use Change Data Capture (CDC) to bridge OLTP to Analytics:**
   PostgreSQL WAL --CDC--> Kafka --> ClickHouse
   This keeps analytics up-to-date without querying the transactional database.

3. **Redis as write-through cache for hot game state:**
   - Game server writes to Redis first (sub-ms)
   - Background worker persists to PostgreSQL (durable, recoverable)
   - On game start, hydrate from PostgreSQL to Redis

4. **User profiles are the source of truth for identity.** All other services reference player_id but do not duplicate PII. GDPR compliance is centralized.

5. **Analytics is append-only, immutable, and schema-on-read friendly.** Do not try to normalize analytics data -- store raw events, transform at query time or via materialized views.

---

## Summary Decision Matrix

| Project Type | Primary DB | Cache / Hot Layer | Analytics | Event Bus | Migration Tool |
|-------------|-----------|-------------------|-----------|-----------|----------------|
| Mobile Game | PostgreSQL + MongoDB | Redis | ClickHouse (if scale) | Kafka / Redis Streams | Prisma / Drizzle (Node) or Alembic (Python) |
| Web Dashboard | PostgreSQL (Supabase) | Redis (optional) | ClickHouse / TimescaleDB | Kafka (if real-time) | Prisma / Atlas |
| Real-Time Pipeline | Kafka + ClickHouse/Druid | Redis | Same as primary | Kafka (core) | Not applicable (append-only) |
| BLE Device Store | SQLite (edge) + TimescaleDB (cloud) | Redis (gateway) | TimescaleDB / InfluxDB | MQTT (Mosquitto/HiveMQ) | Alembic / Flyway |

---

## Key Takeaways for an AI Game Studio

1. **Polyglot persistence is the norm in games.** PostgreSQL for accounts/economy, MongoDB for progression, Redis for leaderboards. Do not force one database to do everything.

2. **PostgreSQL is the safe default for 2026** -- it handles JSON, time-series (TimescaleDB), full-text search, and ACID transactions. Even many "NoSQL" use cases are better on Postgres now.

3. **Do not overbuild early.** Start monolith with a shared database. Split into database-per-service only when the pain of coordination exceeds the pain of distributed data patterns (Saga, CQRS, API Composition).

4. **Migrations as source of truth.** Pick a migration tool that integrates with your CI/CD and detects schema drift. Flyway, Liquibase, Prisma, and Atlas all do this.

5. **Separate analytics from transactions.** Use CDC to pipe OLTP changes to an OLAP engine. Never run dashboard queries directly against your game transactional database.

6. **Respect data gravity.** User profiles, game state, and analytics have fundamentally different access patterns, consistency needs, and retention policies. Separate them.

---

*Research compiled from multiple sources including microservices.io, Tinybird, Codelit.io, MindStudio (2026 Backend Guide), AESTECHNO (IoT Database Comparison), GeneralistProgrammer (Game DB Architecture 2026), Acceldata (Schema Drift Guide), and community discussions (Reddit, StackOverflow).*
