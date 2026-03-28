# 🏛️ EasyHire — Government Job Exam Tracker

> A full-stack web portal that automatically matches government exam aspirants in Kerala to eligible UPSC, SSC, IBPS, RRB, and Kerala PSC examinations based on their profile — with live web scraping, deadline tracking, an integrated Study Assistant chatbot, and a full Admin Panel.

---

## 📁 Project Structure

```
EasyHire/
├── app.py                  ← Flask backend (scraping + API + admin hooks)
├── admin_routes.py         ← Admin Blueprint (all /api/admin/* routes)  ← NEW
├── auth.py                 ← Password hashing helpers
├── requirements.txt        ← Python dependencies
├── start.sh                ← One-command launcher
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx             ← Full React frontend
        ├── AdminDashboard.jsx  ← Admin panel UI                          ← NEW
        └── StudyChatbot.jsx    ← Study assistant chatbot
```

---

## ⚡ Quick Start (5 minutes)

### Step 1 — Install Python dependencies

```bash
cd EasyHire
pip install -r requirements.txt
```

### Step 2 — Start the backend

```bash
python app.py
```

You'll see:
```
EasyHire Backend starting...
[Admin] Schema v2 initialised.
Initial scrape on startup...
=== Starting scrape cycle ===
  UPSC: X scraped
  SSC: X scraped
  Kerala PSC: X scraped
  ...
=== Scrape done. Total exams in cache: XX ===
 * Running on http://0.0.0.0:5000
```

### Step 3 — Start the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

### Step 4 — Open the app

```
http://localhost:5173
```

---

## 🛡️ Admin Panel

EasyHire includes a built-in Admin Panel for managing users, jobs/exams, scraper settings, analytics, and downloadable reports.

### Accessing the Admin Panel

1. On the EasyHire home screen, scroll to the bottom and click **🛡️ Admin Panel**
2. Log in with your admin credentials
3. To return to the main site, click **← Back** on the login screen or the topbar button inside the panel

### Default Admin Credentials

```
Email:    admin@easyhire.com
Password: Admin@123456
```

> ⚠️ **Change the default password immediately** before deploying to production.  
> Update `ADMIN_EMAIL` and `ADMIN_PASSWORD` at the top of `admin_routes.py`.

---

### 🗂️ Admin Panel — Features

#### 1. Dashboard
An at-a-glance overview of the entire platform. Auto-refreshes every 60 seconds.

| Card | Description |
|------|-------------|
| Total Users | All registered users |
| Active | Users with `status = active` |
| Blocked | Users with `status = blocked` |
| New Today | Registrations today |
| Requests (24h) | API calls in the last 24 hours |
| Admin Jobs | Manually added jobs/exams |

**Charts included:**
- 📈 Registrations over 14 days (line chart)
- 📈 Access events over 14 days (line chart)
- 📊 Hourly activity — last 24h (bar chart, hover for counts)
- 🍩 User qualification distribution (donut chart)
- Recent registrations table
- Recent admin jobs table

#### 2. Analytics
Deeper trend analysis with a configurable time window (7 / 14 / 30 / 60 / 90 days).

| Chart | Description |
|-------|-------------|
| Daily Registrations | New signups per day |
| Daily Access Events | Total API hits per day |
| Unique Active Users / Day | Distinct logged-in users per day |
| Hourly Traffic (24h) | Bar chart of requests by hour |
| Qualification Distribution | Donut — what qualifications users have |
| Preferred Level | Donut — Central vs Kerala vs Both |
| Reservation Category | Donut — General, OBC, SC/ST, etc. |
| Top API Actions | Which routes are called most (developer tool) |

#### 3. User Management
Full control over registered user accounts.

| Action | Description |
|--------|-------------|
| View all users | Table with search and status filter |
| Approve | Set `status = active` |
| Block | Set `status = blocked` (prevents login) |
| Delete | Permanently removes user + profile + sessions |
| View detail | See profile, saved exams, and recent activity per user |

#### 4. Jobs & Exams
Manually add exam/job entries that appear alongside scraped data for all users.

| Field | Description |
|-------|-------------|
| Title | Exam/job name |
| Description | Additional details |
| Category | e.g. Banking, Railway, Teaching |
| Level | Central / Kerala / Both |
| Min & Max Age | Eligibility age range |
| Vacancies | Number of posts |
| Qualification | Minimum required qualification |
| Salary | Pay scale |
| Official Link | URL to official notification |
| App. Start / End | Application window dates |
| Exam Date | Scheduled exam date |

> Admin-added jobs appear for users immediately and are included in eligibility matching.

#### 5. Reports
Download live-generated reports from the database.

| Report | Formats | Description |
|--------|---------|-------------|
| User List | CSV, JSON | All registered users with status and join date |
| Activity Log | CSV, JSON | Access log for selected period (7–90 days) |
| Summary | CSV, JSON | Aggregated KPIs: users, jobs, activity, settings |

- **CSV** — opens directly in Excel, LibreOffice Calc, or Google Sheets
- **JSON** — suitable for external analytics tools or database import
- All reports are generated live at download time

#### 6. Scraper Control (on Dashboard)
Change how frequently EasyHire fetches new exams from government websites — **without restarting the server**.

| Control | Description |
|---------|-------------|
| Interval stepper (−/+) | Adjust hours manually |
| Preset buttons | 1h / 2h / 3h / 6h / 12h / 24h / 48h |
| Apply button | Saves and reschedules the job live |
| Run Now | Forces an immediate scrape |
| Last scraped | Timestamp of the most recent scrape |

> Valid range: **1 to 168 hours** (1 week maximum).

#### 7. Security
- Change the admin account password
- Admin sessions expire after **24 hours**
- Admin tokens are stored in a separate `admin_sessions` table, isolated from user sessions
- All admin routes require the `@require_admin` decorator
- Blocked users cannot log in to the main app

---

### 🗄️ Database Schema — Admin Tables

The following tables are added automatically on first startup via `init_admin_schema()`:

| Table | Purpose |
|-------|---------|
| `admin_sessions` | Admin login tokens (separate from user sessions) |
| `admin_jobs` | Manually created jobs/exams |
| `notifications` | Broadcast announcements (backend only) |
| `access_log` | Every authenticated API call (user_id, action, path, IP, timestamp) |
| `system_settings` | Key-value store for scraper interval and last-scrape timestamp |

**Columns added to existing `users` table:**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `role` | TEXT | `'user'` | `'user'` or `'admin'` |
| `status` | TEXT | `'active'` | `'active'`, `'blocked'`, or `'pending'` |

> Migration is **idempotent** — safe to run on every startup. Duplicate-column errors are silently swallowed.

---

## 🌐 API Endpoints

### Public / User Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Health check |
| GET | `/api/exams` | — | All exams (scraped + manual + admin) |
| POST | `/api/eligible` | — | Get exams matching a profile |
| GET | `/api/stats` | — | Exam statistics |
| POST | `/api/scrape` | — | Force re-scrape |
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | User login |
| POST | `/api/auth/logout` | ✅ | User logout |
| GET | `/api/auth/me` | ✅ | Current user info |
| POST | `/api/profile` | ✅ | Save/update profile |
| GET | `/api/saved` | ✅ | Get saved exams |
| POST | `/api/saved/<exam_id>` | ✅ | Save an exam |
| DELETE | `/api/saved/<exam_id>` | ✅ | Remove saved exam |
| GET | `/api/notifications` | ✅ | Fetch user notifications |

### Admin Endpoints (`/api/admin/*`)

All admin endpoints require an `Authorization: Bearer <admin_token>` header.

#### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/auth/login` | Admin login — returns admin token |
| POST | `/api/admin/auth/logout` | Invalidate admin token |
| GET | `/api/admin/auth/me` | Current admin info |

#### Dashboard & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Full dashboard data (stats, trends, recent) |
| GET | `/api/admin/analytics?days=N` | Detailed analytics for N days |

#### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/settings` | Get scrape interval + last scrape time |
| POST | `/api/admin/settings` | Update scrape interval (live reschedule) |

#### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users (supports `?q=search&status=filter`) |
| GET | `/api/admin/users/<id>` | User detail + profile + activity |
| PATCH | `/api/admin/users/<id>/status` | Set status: active / blocked / pending |
| DELETE | `/api/admin/users/<id>` | Delete user and all their data |

#### Jobs & Exams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/jobs` | List all admin jobs |
| POST | `/api/admin/jobs` | Create new job |
| PUT | `/api/admin/jobs/<id>` | Update existing job |
| DELETE | `/api/admin/jobs/<id>` | Delete job |

#### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/reports/users?format=csv\|json` | User list report |
| GET | `/api/admin/reports/activity?format=csv\|json&days=N` | Activity log report |
| GET | `/api/admin/reports/summary?format=csv\|json` | Summary KPI report |

---

### POST `/api/eligible` — Example Request

```json
{
  "dob": "2000-05-15",
  "qualification": "graduation",
  "percentage": 72,
  "category": "OBC",
  "gender": "male",
  "preferredLevel": "Both"
}
```

### POST `/api/eligible` — Example Response

```json
{
  "profile": { "age": 25, "qualification": "graduation", "category": "OBC" },
  "summary": {
    "total": 18, "urgent": 2, "upcoming": 5,
    "later": 11, "closed": 0, "central": 13, "kerala": 5
  },
  "exams": {
    "urgent": [...], "upcoming": [...], "later": [...], "closed": [...]
  },
  "all": [...]
}
```

---

## 🕷️ Web Scraping — How It Works

EasyHire scrapes official government portals on a configurable interval (default: **6 hours**):

| Source | URL Scraped | What's extracted |
|--------|-------------|-----------------| 
| UPSC | upsc.gov.in/examinations/active-examinations | Active exam names, dates, links |
| SSC | ssc.gov.in/portal/LatestNotice | Latest notifications, deadlines |
| IBPS | ibps.in | PO, Clerk, RRB notifications |
| Kerala PSC | keralapsc.gov.in/notifications | All PSC recruitment notifications |
| RRB | indianrailways.gov.in | Railway recruitment notices |

### Scraping Strategy

```
┌─────────────────────────────────────────┐
│  Every N hours (configurable via admin) │
│                                         │
│  1. Run all scrapers in sequence        │
│  2. Parse HTML with BeautifulSoup       │
│  3. Extract: name, dates, links         │
│  4. Merge with manual fallback DB       │
│  5. Merge with admin-added jobs         │
│  6. Deduplicate by exam ID              │
│  7. Cache result in memory              │
│  8. Stamp last_scrape_at in DB          │
└─────────────────────────────────────────┘
         ↓ On API request
┌─────────────────────────────────────────┐
│  Return cached data (instant response)  │
│  If cache expired → re-scrape first     │
└─────────────────────────────────────────┘
```

### Fallback System

- **If scraping succeeds**: scraped data is merged with manual + admin database
- **If scraping fails**: manual database with 20+ pre-curated exams is used
- Each exam has a `source` field: `"scraped-upsc"`, `"scraped-kpsc"`, `"manual"`, or `"Admin"`

---

## 🎯 Eligibility Engine

The backend checks 4 criteria per exam:

| Check | Logic |
|-------|-------|
| **Qualification** | User's highest qual must be ≥ exam's minimum (10th < 12th < Graduation < PG < PhD) |
| **Age** | User's current age must be between `minAge` and `maxAge + category_relaxation` |
| **Percentage** | If exam has `minPercentage`, user's % must be ≥ that value |
| **Gender** | Some exams (e.g. NDA) are male-only — filtered based on profile |

**Age Relaxation** is applied automatically:
- OBC: +3 years
- SC/ST: +5 years
- PwD: +10 years
- Ex-Servicemen: varies

---

## 🤖 Study Assistant

EasyHire includes a built-in **Study Assistant chatbot** powered by the Claude API:

- Syllabus breakdowns and topic-wise advice
- Book and resource recommendations
- Study strategies based on time remaining
- Kerala-specific exam tips
- Answers to questions about exam pattern, cutoffs, and more

> The Study Assistant is **hidden in the Admin Panel** and only shown to regular users.

---

## 🔧 Configuration

### Change scrape interval

Via the **Admin Panel → Dashboard → Scraper Control** (no restart needed), or in `app.py`:
```python
CACHE_TTL_HOURS = 6  # default fallback value
```

### Change admin credentials

In `admin_routes.py`:
```python
ADMIN_EMAIL    = "admin@easyhire.com"   # change this
ADMIN_PASSWORD = "Admin@123456"         # change this
```

### Add new exams to manual database

In `app.py`, add a new entry to `MANUAL_EXAMS`:
```python
{
    "id": "unique-id",
    "name": "Exam Name",
    "body": "Conducting Body",
    "level": "Central",       # or "Kerala"
    "category": "Banking",
    "applicationEnd": "2025-12-31",
    "minAge": 21,
    "maxAge": 30,
    "qualifications": ["graduation"],
    ...
}
```

Or use **Admin Panel → Jobs & Exams → Add Job/Exam** to add entries without touching code.

---

## 📦 Production Deployment

### Using Gunicorn (recommended)

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Build frontend for production

```bash
cd frontend
npm run build
# Serve the dist/ folder via nginx or any static host
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:5000/api` | Backend URL for frontend |
| `PORT` | `5000` | Backend port |

---

## 🛡️ Responsible Scraping

EasyHire scrapes government websites responsibly:
- Requests use a real browser `User-Agent`
- `REQUEST_TIMEOUT = 20` seconds prevents hanging
- Results are **cached** — configurable interval, minimum 1 hour
- Scrapers fail gracefully — no retry loops that could overload servers

---

## 📋 Covered Exams

### Central Government (15+)
UPSC CSE, UPSC CAPF, SSC CGL, SSC CHSL, SSC MTS, SSC GD, IBPS PO, IBPS Clerk, SBI PO, RBI Grade B, NDA, CDS, Railway NTPC, Railway Group D, KVS Teacher, ISRO Scientist + all new notifications scraped live

### Kerala State (10+)
Kerala PSC Police Constable, LDC, Degree Level (DLPE), Gazetted Services, LP Teacher, UP Teacher, VEO, FCO, KWA, KSRTC + all new PSC notifications scraped live

---

## 🧪 Test the API manually

```bash
# Health check
curl http://localhost:5000/api/health

# Get all exams
curl http://localhost:5000/api/exams

# Check eligibility
curl -X POST http://localhost:5000/api/eligible \
  -H "Content-Type: application/json" \
  -d '{"dob":"2000-05-15","qualification":"graduation","category":"OBC","gender":"male","preferredLevel":"Both"}'

# Force re-scrape
curl -X POST http://localhost:5000/api/scrape

# Stats
curl http://localhost:5000/api/stats

# Admin login
curl -X POST http://localhost:5000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@easyhire.com","password":"Admin@123456"}'

# Admin dashboard (replace TOKEN with value from login response)
curl http://localhost:5000/api/admin/dashboard \
  -H "Authorization: Bearer TOKEN"

# Download user report
curl http://localhost:5000/api/admin/reports/users?format=csv \
  -H "Authorization: Bearer TOKEN" -o users.csv
```

---

*Built with Flask · BeautifulSoup · React · Vite · Claude API · SQLite*
