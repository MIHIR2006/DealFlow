# DealFlow360

Real-time deal risk governance, quotation optimization, and upsell recommendation platform.

### Tech Stack

[![Tech Stack](https://skillicons.dev/icons?i=nextjs,react,tailwind,ts,go,python,fastapi,postgres,docker)](https://skillicons.dev)

- **Frontend**: Next.js 16, React 19, TailwindCSS, Bun
- **Backend API**: Go (Gin), sqlc, pgx, Goose migrations
- **Recommendation Engine**: Python 3.12, FastAPI, asyncpg, co-purchase matrix scoring
- **AI Sales Assistant**: Python 3.12, FastAPI, LangChain — Gemini or OpenAI (optional)
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
| **AI Salesman** | `dealflow360-ai-salesman` | `http://localhost:8002` | Customer portal negotiation assistant (optional) |
| **Database** | `dealflow360-db` | `localhost:5432` | PostgreSQL 16 |
| **Init DB** | `dealflow360-init-db` | - | Applies Goose migrations & seeds demo dataset |

### Health Checks

- Backend: `http://localhost:8080/live` & `http://localhost:8080/ready`
- Recommendation: `http://localhost:8001/health`
- Recommendation API Docs: `http://localhost:8001/docs`
- AI Salesman: `http://localhost:8002/health`

### Useful Docker Commands

```bash
# Start all services in the background
docker compose up -d

# View logs from all services
docker compose logs -f

# View logs from a specific service (e.g., backend or recommendation)
docker compose logs -f backend
docker compose logs -f recommendation
docker compose logs -f ai-salesman

# Stop all services
docker compose down

# Stop and wipe database volume (clean reset)
docker compose down -v
```

---

## The two AI surfaces

Both are enrichments. Neither is on the critical path, and the platform works
with either or both switched off.

### Recommendation engine → rep quotation builder

The upsell panel on `/quotations/:id` is served by the backend's existing
`GET /api/v1/quotations/:id/upsell`. That endpoint has two sources behind one
contract:

1. **The recommendation engine**, when `RECOMMENDATION_URL` is set and it
   answers. It ranks candidates by co-purchase strength learned from confirmed
   quotations, with a promotion boost and a margin floor.
2. **The `upsell_rules` pairings**, otherwise — including when the engine is
   unset, down, slow, or has nothing for the current cart.

The engine ranks; the backend prices. Every price and margin figure in the
panel is computed by the Go pricing engine from the current catalogue, so a
stale co-purchase matrix can never put a wrong number in front of a rep. The
`margin_pct_delta` is the effect on *this* order, which is what tells a rep
that a healthy product would still dilute a healthier deal.

The co-purchase matrix (`product_recommendations`) is rebuilt at engine
startup and on demand:

```bash
curl -X POST http://localhost:8001/admin/recalculate
```

### AI assistant → customer negotiation portal

The customer portal at `/portal/q/:token` gets a docked assistant that helps
during negotiation: it explains the quotation, submits discount requests, and
reports where a request stands.

It acts only through the same token-scoped portal routes the page itself uses,
so a discount it submits goes through governance exactly as the counter-offer
form does, and the backend's state machine refuses it in the same cases. It
never sees cost, margin, ceilings, risk scores, or the approval chain — the
customer-facing document does not carry them.

Set `LLM_API_KEY` to enable it. Left empty, the service still starts, reports
itself unavailable, and the portal renders no assistant rather than a control
that fails when a customer uses it.

| Variable | Default | Effect |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | `google` | `google` (Gemini) or `openai`. Aliases `gemini` / `google-genai` also resolve to Google. |
| `LLM_MODEL` | *(per provider)* | Empty takes the provider default — `gemini-2.5-flash` or `gpt-4o`. Both are chosen for reliable tool calling. |
| `LLM_API_KEY` | *(empty)* | Empty means the assistant is unavailable and the portal hides it. |
| `ALLOW_ASSISTANT_CONFIRM` | `false` | Whether the assistant may confirm a quotation. Off because the portal takes confirmation behind an explicit signatory attestation, and a chat turn is not that attestation. |
| `SERVICE_ACCOUNT_JWT` | *(empty)* | A staff-role token letting the assistant read discount ceilings for context. Empty keeps internal thresholds out of a customer-facing prompt. |

Adding a provider is one branch in `ai_salesman/agent/llm.py` plus a
dependency; nothing else in the service knows which vendor is behind it.

Providers disagree about the shape of a reply — OpenAI returns a string, Gemini
returns a list of blocks mixing answer text with reasoning signatures. Only
text blocks reach the customer; see `message_text` in the same module.

> **Never commit a key.** `.env` is gitignored in each service and excluded
> from the Docker images, so in compose the key comes from the environment.
