# Run & Presentation Guide — Online Examination System

Everything you need to run the project from scratch and present it live to your teacher.

---

## PART 1 — RUN FROM START (Clean Setup)

### 1.1 Prerequisites (install once)

| Tool | Check command | Download |
|------|---------------|----------|
| Docker Desktop | `docker --version` | https://www.docker.com/products/docker-desktop/ |
| Node.js 18+ | `node --version` | https://nodejs.org |
| Git | `git --version` | https://git-scm.com |

Start **Docker Desktop** first and wait until the whale icon in the taskbar stops animating.

### 1.2 Start the complete application

Open **PowerShell** and run:

```powershell
cd C:\Users\ADMIN\online-examination-system
docker compose up --build -d
```

First run takes **5–8 minutes** (downloads MongoDB, Prometheus, Grafana, Elasticsearch, Kibana, Fluent Bit + builds 6 service images).

### 1.3 Wait until everything is healthy

```powershell
docker compose ps
```

Wait until every container shows `(healthy)`:

```
mongo                    healthy
auth-service             healthy
student-service          healthy
question-bank-service    healthy
examination-service      healthy
result-service           healthy
gateway                  healthy
```

Quick health check:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Expected: `status: ok, service: api-gateway`

### 1.4 Open the application

| URL | What shows |
|-----|-----------|
| **http://localhost:8080** | Web application (present this) |
| http://localhost:9090 | Prometheus monitoring |
| http://localhost:3000 | Grafana dashboards (admin/admin) |
| http://localhost:5601 | Kibana log search |
| http://localhost:9200 | Elasticsearch |

### 1.5 Demo accounts (auto-seeded)

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@example.com` | `Admin@123` |
| Student | `student@example.com` | `Student@123` |

### 1.6 Stop / restart later

```powershell
docker compose down          # stop (keeps data)
docker compose down -v       # stop + wipe database (clean reseed)
docker compose up -d         # restart fast (no rebuild)
```

---

## PART 2 — LIVE DEMO SCRIPT (10–12 min)

Open **two browser windows** side by side (admin on the left, student on the right) for a clearer demo.

### Step 1 — Architecture intro (1 min, before clicking)

Say:

> "This is a microservices application. There are 5 backend services — Authentication, Student, Question Bank, Examination and Result — plus an API Gateway. Each service has its own database collections in MongoDB. The browser only talks to the gateway on port 8080; the gateway verifies the JWT token and checks user roles before forwarding requests to the correct service."

Show the architecture diagram from `README.md` if useful.

### Step 2 — Admin login (1 min)

1. Go to **http://localhost:8080**
2. Login with `admin@example.com` / `Admin@123`
3. Point out: *"Login called POST /api/auth/login through the gateway. The auth service verified the password hash and returned a JWT. My role is admin, so the dashboard shows management tabs."*

### Step 3 — Question Bank (1–2 min)

1. Admin dashboard → **Question Bank** section
2. Click **Refresh** — 5 pre-seeded questions appear
3. Highlight: *"Only admins can access this. Questions have options, correct answer index, subject, marks."*
4. **Add a new question live** (optional but impressive):
   - Text: `What is 2 + 2?`
   - Options: `3`, `4`, `5`, `6`
   - Correct: `1` (B = 4)
   - Subject: `Maths`, Marks: `1`
   - Click **Add Question** → appears in the table

### Step 4 — Create an examination (1–2 min)

1. **Create Examination** section
2. Title: `Mid-Term Quiz`, Subject: `Computer Science`, Duration: `10`
3. Tick 3–5 questions from the picker
4. Click **Create Exam**
5. Click **Refresh** — exam appears in the table
6. Say: *"The examination service validated the question IDs by calling the question-bank service internally — that's service-to-service communication."*

### Step 5 — Student takes the exam (3–4 min) — the main demo

1. Click **Logout**
2. Login as `student@example.com` / `Student@123`
3. **My Examinations** → see `Mid-Term Quiz` with status `not_attempted`
4. Click **Start**
   - ⭐ Highlight: *"The questions received here have NO correct answers — they were stripped before sending. This prevents cheating by inspecting network traffic."*
   - Point at the **countdown timer** — *"The exam is time-limited; the server also rejects late submissions."*
5. Select answers, click **Submit Exam**
6. Toast shows: `Submitted! Score: X/5 (Y%)`
7. **My Results** table shows the result

### Step 6 — Admin sees results (1 min)

1. Logout → login as admin again
2. **All Results** section → Refresh
3. Show the student's result with name, score, percentage, date
4. Say: *"When the student submitted, the examination service auto-graded the answers, stored the attempt, and published the result to the result service — automatic result generation."*

### Step 7 — Role-Based Access Control demo (1 min) — strong point

**Option A (browser):** already shown — student sees no admin tabs.

**Option B (terminal, more convincing):**

```powershell
# Login as student
$s = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login -Method Post `
  -ContentType 'application/json' `
  -Body '{"email":"student@example.com","password":"Student@123"}'

# Student tries admin-only endpoint → BLOCKED
try {
  Invoke-RestMethod -Uri http://localhost:8080/api/questions `
    -Headers @{Authorization="Bearer $($s.token)"}
} catch {
  Write-Output "BLOCKED: $($_.Exception.Response.StatusCode)"   # shows 403
}
```

Say: *"JWT contains the role. The gateway rejected this with 403 Forbidden — defense is applied at both the gateway and the service."*

### Step 8 — Monitoring demo (1–2 min)

1. Open **http://localhost:9090** (Prometheus)
2. Click **Status → Targets** — show all 6 service targets are **UP**
3. Click **Graph**, type `http_request_duration_seconds_sum`, run — show live request data
4. Open **http://localhost:3000** (Grafana) → login `admin`/`admin`
5. Say: *"Every service exposes Prometheus metrics on /metrics — request counts and durations per route. This is how we monitor microservices in production."*

### Step 9 — Centralized logging demo (1–2 min)

1. Open **http://localhost:5601** (Kibana) — takes ~1 min to load on first visit
2. Go to **Discover**
3. If prompted, create index pattern `exam-logs-*` with `@timestamp`
4. Show JSON log entries: service name, level, message, path, status code
5. Filter by `"msg": "user_login"` or `"exam_submitted"`
6. Say: *"All 6 services emit structured JSON logs. Fluent Bit collects them into Elasticsearch — in a real cluster this is a DaemonSet, so logs from every pod land in one searchable place."*

### Step 10 — Wrap-up (30 sec)

> "To summarize: 5 microservices + API gateway, JWT authentication, role-based access for students and admins, Dockerized, Kubernetes-ready with HPA autoscaling, CI/CD pipeline on GitHub Actions, Prometheus-Grafana monitoring and EFK centralized logging."

---

## PART 3 — BONUS DEMOS (if time allows or teacher asks)

### A. Kubernetes + HPA (if you have Minikube/kind set up)

```powershell
minikube start
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/mongo.yaml
kubectl apply -f k8s/
kubectl apply -f k8s/monitoring/
kubectl apply -f k8s/logging/

# Show pods scaling
kubectl -n exam-system get pods -w        # Ctrl+C to exit

# Show HPA configured
kubectl -n exam-system get hpa
```

Expected HPA output:

```
NAME              REFERENCE                    MINPODS  MAXPODS
gateway-hpa       Deployment/gateway           2        8
examination-hpa   Deployment/examination       2        6
auth-hpa          Deployment/auth              2        5
```

**Load test to watch pods scale up live:**

```powershell
kubectl -n exam-system run load --image=busybox --restart=Never -- `
  /bin/sh -c "while true; do wget -qO- http://gateway:8080/health; done"

# watch autoscaler react
kubectl -n exam-system get hpa -w
```

### B. CI/CD pipeline

Show the file `.github/workflows/ci-cd.yml` and explain the 3 jobs:

1. **test** — runs unit tests for all 6 modules in parallel (matrix strategy)
2. **build-and-push** — on push to `main`, builds 6 Docker images → pushes to GitHub Container Registry
3. **deploy** — applies Kubernetes manifests with `kubectl`

Live demo: push any change to GitHub and watch the Actions tab run.

```powershell
git init
git add .
git commit -m "Online Examination System"
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

### C. Docker scaling (easy, no Kubernetes needed)

```powershell
docker compose up -d --scale examination-service=3 --no-deps
docker compose ps | Select-String examination
```

Say: *"Stateless services scale horizontally — the gateway load-balances across replicas automatically."*

### D. Prove answer-stripping (technical Q&A backup)

Start an exam as the student, open **browser DevTools → Network tab**, click Start, open the `/start` response — questions contain only `id, text, options, subject, difficulty, marks`. No `correctIndex` field.

---

## PART 4 — WHAT TO SAY: KEY POINTS

### One-line summary (memorize this)

> "A Dockerized microservices online examination platform with JWT security, role-based access, Kubernetes autoscaling, CI/CD, Prometheus monitoring and centralized EFK logging."

### Technology mapping to your syllabus

| Requirement | Where it is |
|-------------|-------------|
| REST APIs | All 5 services + gateway, JSON over HTTP |
| API Gateway | `gateway/` — single entry point, JWT check, rate limit |
| JWT | `shared/index.js` — sign on login, verify in middleware |
| Docker | `Dockerfile` per service + `docker-compose.yml` |
| Kubernetes | `k8s/` — deployments, services, ingress, HPA |
| CI/CD | `.github/workflows/ci-cd.yml` |
| HPA | `k8s/hpa.yaml` — CPU-based autoscaling |
| Monitoring | Prometheus scrapes `/metrics`; Grafana visualizes |
| Centralized logging | Fluent Bit → Elasticsearch → Kibana |
| Role-based access | Gateway guards + service-level re-check (defense in depth) |

### Security talking points

- Passwords stored as **bcrypt hashes**, never plain text
- **JWT expires in 8 hours**; secret stored in Kubernetes Secrets (not in code)
- Internal service calls use a **shared internal key** (`x-internal-key`) — not exposed through the gateway
- Correct answers are **never sent to students' browsers**
- Server **rejects late submissions** even if the client timer is manipulated

---

## PART 5 — LIKELY VIVA QUESTIONS

| Question | Answer |
|----------|--------|
| Why microservices instead of monolith? | Independent scaling (exam service scales during exam season), fault isolation, different teams can own services. |
| What is the API gateway's role? | Single entry point: JWT verification, role-based routing, rate limiting, TLS termination; backend services stay private. |
| How does JWT authentication work? | Login → auth service verifies bcrypt hash → signs JSON payload {sub, name, role} with HS256 secret → client sends `Authorization: Bearer` → gateway/service verifies signature without DB call. |
| How is role-based access enforced? | Two layers: gateway checks role per route (e.g. `/api/questions` admin-only) AND each service re-checks — defense in depth. |
| How does the exam timer work on the server? | `startedAt + durationMinutes` deadline stored in DB; on submit the server compares current time — late submissions are rejected regardless of client behavior. |
| How are results generated? | Auto-grading: examination service fetches full questions internally, compares answers, computes score, publishes to result service. |
| What does HPA do? | HorizontalPodAutoscaler watches CPU; gateway scales 2→8 pods when average CPU exceeds 60%. |
| How does centralized logging work? | Services write structured JSON; Fluent Bit (DaemonSet in k8s) ships logs to Elasticsearch; Kibana indexes them for search. |
| What is Prometheus scraping? | Pull model: Prometheus hits `/metrics` on every service every 10s; metrics include request duration histograms and Node.js runtime stats. |
| How does CI/CD work here? | Push to main → GitHub Actions runs tests, builds Docker images, pushes to GHCR, then `kubectl apply` deploys to the cluster with rolling updates. |
| How would this scale in production? | Managed MongoDB Atlas, managed Elasticsearch, TLS via Ingress, custom metrics for HPA, PodDisruptionBudgets, Redis for rate limiting. |
| What happens if one service crashes? | Others keep running (fault isolation); Kubernetes liveness probes restart the dead pod; gateway returns errors only for that service's routes. |

---

## PART 6 — TROUBLESHOOTING

| Problem | Fix |
|---------|-----|
| `docker compose up` fails on port | Something else uses 8080/3000/9090 — stop it or change ports in `docker-compose.yml` |
| Containers restarting | `docker compose logs <service-name>` to see the error |
| Gateway 502/timeout | Services not healthy yet — wait, then `docker compose restart gateway` |
| Kibana not loading | Elasticsearch needs ~1 GB RAM; close other apps or wait 2 min |
| Login says invalid credentials | Database was seeded with different data — `docker compose down -v` then up again to reseed |
| Want a clean demo state | `docker compose down -v && docker compose up --build -d` (reseeded in ~2 min) |

---

## QUICK CHEAT SHEET (print this)

```
START:   cd C:\Users\ADMIN\online-examination-system
         docker compose up --build -d
         wait for (healthy) → open http://localhost:8080

ADMIN:   admin@example.com   / Admin@123
STUDENT: student@example.com / Student@123

DEMO:    Admin login → create exam → Logout
         Student login → Start → Submit → see score
         Admin login → see results
         Show Prometheus targets UP → Kibana logs

STOP:    docker compose down -v
```
