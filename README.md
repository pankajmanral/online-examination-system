# Online Examination System

A microservices-based web application with **Student, Question Bank, Examination, Result and Authentication** services. Students log in, attend timed examinations and view results. Administrators manage students, questions, exams and results.

## Architecture

```
                      ┌─────────────────────────────────────────────┐
   Browser ──────────►│  API Gateway (:8080)  JWT + RBAC + rate-limit│──► Frontend (static SPA)
                      └───────┬───────┬───────────┬──────────┬──────┘
                              │       │           │          │
              ┌───────────────┘       │           │          └──────────────┐
              ▼                       ▼           ▼                        ▼
      ┌──────────────┐      ┌──────────────┐ ┌──────────────┐     ┌──────────────┐
      │ Auth Service │      │   Student    │ │  Question    │     │  Examination │
      │   :3001      │      │   Service    │ │  Bank Service│     │   Service    │
      │  JWT issue   │      │    :3002     │ │    :3003     │     │    :3004     │
      └──────┬───────┘      └──────┬───────┘ └──────┬───────┘     └──────┬───────┘
             │                     │               │                     │
             │                     │               │            (grades + calls)──► Result :3005
             ▼                     ▼               ▼                     ▼
      ┌──────────────────────────────────────────────────────────────────────┐
      │                          MongoDB (per-service DBs)                  │
      └──────────────────────────────────────────────────────────────────────┘

  Observability: Prometheus (:9090) ── Grafana (:3000)      Fluent Bit ── Elasticsearch ── Kibana (:5601)
```

## Tech Stack

| Concern          | Choice |
|------------------|--------|
| Services         | Node.js 18 + Express + Mongoose |
| API Gateway      | Express + http-proxy-middleware (JWT verification + role checks + rate limiting) |
| Auth             | JWT (HS256), bcrypt password hashing |
| Database         | MongoDB (one DB per service) |
| Containers       | Docker + docker-compose |
| Orchestration    | Kubernetes (Deployments, Services, Ingress, HPA) |
| CI/CD            | GitHub Actions (test → build → push to GHCR → kubectl deploy) |
| Monitoring       | Prometheus + Grafana (`/metrics` exposed by every service) |
| Centralized logs | Fluent Bit → Elasticsearch → Kibana |
| Frontend         | Vanilla HTML/CSS/JS SPA served by the gateway |

## Project Layout

```
online-examination-system/
├── gateway/                  # API Gateway (port 8080)
├── services/
│   ├── auth/                 # Login/register, JWT (port 3001)
│   ├── student/              # Student profiles CRUD (port 3002)
│   ├── question-bank/        # Question CRUD (port 3003)
│   ├── examination/          # Exam creation, attempts, grading (port 3004)
│   └── result/               # Results storage & queries (port 3005)
├── shared/                   # Shared JWT auth middleware, logger, metrics
├── frontend/                 # Web UI (admin + student)
├── k8s/                      # Kubernetes manifests
│   ├── monitoring/           # Prometheus + Grafana
│   └── logging/              # Elasticsearch + Kibana + Fluent Bit DaemonSet
├── monitoring/               # docker-compose Prometheus/Grafana/Fluent Bit configs
├── .github/workflows/        # CI/CD pipeline
└── docker-compose.yml
```

## Quick Start (Docker Compose)

```bash
cd online-examination-system
docker compose up --build
```

| URL | Purpose |
|-----|---------|
| http://localhost:8080 | Web application |
| http://localhost:9090 | Prometheus |
| http://localhost:3000 | Grafana (admin/admin) |
| http://localhost:5601 | Kibana |
| http://localhost:9200 | Elasticsearch |

**Demo credentials** (seeded automatically):

| Role    | Email               | Password   |
|---------|---------------------|------------|
| Admin   | admin@example.com   | Admin@123  |
| Student | student@example.com | Student@123|

**Demo flow:** login as admin → questions are pre-seeded → create an exam selecting questions → logout → login as student → Start exam → answer → Submit → view result. Admin can view all results.

## API Reference (all via gateway :8080)

### Public
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register student |
| POST | /api/auth/login | Login → `{ token, user }` |

### Student (Bearer token, role: student)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/auth/me | Current user |
| GET | /api/students/me | Own profile |
| GET | /api/exams | List exams + attempt status |
| POST | /api/exams/:id/start | Start attempt (returns questions without answers) |
| POST | /api/exams/:id/submit | Submit `{ answers: { "<questionId>": <index> } }` |
| GET | /api/results/my | Own results |

### Admin (Bearer token, role: admin)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT/DELETE | /api/students[/:id] | Manage students |
| GET/POST/PUT/DELETE | /api/questions[/:id] | Manage question bank |
| POST | /api/exams | Create exam `{ title, durationMinutes, questionIds[] }` |
| GET | /api/exams/:id/attempts | Attempts for an exam |
| GET | /api/results | All results |

### Curl example

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@123"}' | jq -r .token)

curl -s http://localhost:8080/api/questions -H "Authorization: Bearer $TOKEN" | jq
```

## Role-Based Access

Enforced in two layers:
1. **Gateway** – verifies JWT and checks roles per route (e.g. `/api/questions` → admin only, `/api/exams/:id/start` → student only).
2. **Services** – independently re-check JWT + role (defense in depth) and ownership (students can only read their own profile/results).

Internal service-to-service calls use the `x-internal-key` header (`INTERNAL_KEY` env).

## Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/mongo.yaml
kubectl apply -f k8s/                  # all services + gateway + ingress + HPA
kubectl apply -f k8s/monitoring/       # Prometheus + Grafana
kubectl apply -f k8s/logging/          # EFK (Elasticsearch, Kibana, Fluent Bit)
```

- Replace `ghcr.io/YOUR_GITHUB_USERNAME/...` image names in `k8s/*.yaml` with your pushed images.
- Requires the **NGINX Ingress Controller** for `Ingress` (`exam-ingress`).
- **HPA**: gateway (2→8 pods), examination (2→6), auth (2→5) scale on CPU ≥ 60%.
  ```bash
  kubectl -n exam-system get hpa
  ```
  Load test example: `kubectl -n exam-system run load --image=busybox --restart=Never -- /bin/sh -c 'while true; do wget -qO- http://gateway:8080/health; done'`

## Monitoring

- Every service exposes Prometheus metrics at `/metrics` (request duration histogram + default Node metrics).
- Prometheus auto-discovers annotated pods via `kubernetes_sd_configs`.
- Open Grafana → add Prometheus datasource (`http://prometheus:9090` in k8s, `http://prometheus:9090` in compose) → chart `http_request_duration_seconds` or request rates per service.

## Centralized Logging

- Services emit **structured JSON logs** to stdout and (optionally) ship them to Fluent Bit via `LOG_ENDPOINT`.
- **Docker Compose:** Fluent Bit HTTP input → Elasticsearch → browse in Kibana (index `exam-logs-*`).
- **Kubernetes:** Fluent Bit DaemonSet tails `/var/log/containers/*.log` → Elasticsearch → Kibana.
- In Kibana: Stack Management → Index Patterns → create `exam-logs-*` → Discover.

## CI/CD (GitHub Actions)

`.github/workflows/ci-cd.yml`:
1. **test** – installs deps + runs unit tests for every service (matrix build).
2. **build-and-push** – on push to `main`, builds 6 Docker images and pushes to GHCR.
3. **deploy** – applies k8s manifests and restarts rolling deployments.

Setup: add repository secret `KUBE_CONFIG` (base64-encoded kubeconfig). Replace `YOUR_GITHUB_USERNAME` in `k8s/*.yaml` with your GHCR namespace.

## Running Services Locally (without Docker)

Requires Node 18+ and MongoDB on `localhost:27017`.

```bash
cd online-examination-system
npm install          # installs all workspaces (shared + 5 services + gateway)
npm test             # runs all unit tests
npm start -w auth-service -w student-service -w question-bank-service -w examination-service -w result-service -w api-gateway
```

Run tests: `npm test` inside any service folder.
