# DealFlow360

Real-time deal risk governance, quotation optimization, and upsell recommendation platform.

### Tech Stack

[![Tech Stack](https://skillicons.dev/icons?i=nextjs,react,tailwind,ts,go,python,fastapi,postgres,docker)](https://skillicons.dev)

- **Frontend**: Next.js 16, React 19, TailwindCSS, Bun
- **Backend API**: Go (Gin), sqlc, pgx, Goose migrations
- **Recommendation Engine**: Python 3.12, FastAPI, asyncpg, co-purchase matrix scoring
- **Database**: PostgreSQL 16
- **Containerization**: Docker & Docker Compose

---

## Quickstart with Docker Compose

Deploy the entire stack (Database, Migrations/Seed, Backend, Recommendation Engine, and Frontend) with a single command:

```bash
docker compose up --build
```

### Services & Ports

| Service | Container Name | Port | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | `dealflow360-frontend` | `http://localhost:3000` | Next.js Web Interface |
| **Backend API** | `dealflow360-backend` | `http://localhost:8080` | Core Go REST API (`/api/v1`) |
| **Recommendation** | `dealflow360-recommendation` | `http://localhost:8001` | FastAPI Upsell & Recommendation Service |
| **Database** | `dealflow360-db` | `localhost:5432` | PostgreSQL 16 |
| **Init DB** | `dealflow360-init-db` | - | Applies Goose migrations & seeds demo dataset |

### Health Checks

- Backend: `http://localhost:8080/live` & `http://localhost:8080/ready`
- Recommendation: `http://localhost:8001/health`
- Recommendation API Docs: `http://localhost:8001/docs`

### Useful Docker Commands

```bash
# Start all services in the background
docker compose up -d

# View logs from all services
docker compose logs -f

# View logs from a specific service (e.g., backend or recommendation)
docker compose logs -f backend
docker compose logs -f recommendation

# Stop all services
docker compose down

# Stop and wipe database volume (clean reset)
docker compose down -v
```