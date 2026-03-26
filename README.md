# 🏛️ EasyHire — Government Job Exam Tracker

> A full-stack web portal that automatically matches government exam aspirants in Kerala to eligible UPSC, SSC, IBPS, RRB, and Kerala PSC examinations based on their profile — with live web scraping, deadline tracking, and an integrated Study Assistant chatbot.

---

## 📁 Project Structure

```
EasyHire/
├── app.py                  ← Flask backend (scraping + API)
├── requirements.txt        ← Python dependencies
├── start.sh                ← One-command launcher
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        └── App.jsx         ← Full React frontend
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

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/exams` | All exams (scraped + manual) |
| POST | `/api/eligible` | Get exams matching your profile |
| GET | `/api/exam/<id>` | Single exam detail |
| GET | `/api/stats` | Database statistics |
| POST | `/api/scrape/refresh` | Force re-scrape now |

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
    "total": 18,
    "urgent": 2,
    "upcoming": 5,
    "later": 11,
    "closed": 0,
    "central": 13,
    "kerala": 5
  },
  "exams": {
    "urgent":   [...],
    "upcoming": [...],
    "later":    [...],
    "closed":   [...]
  },
  "all": [...]
}
```

---

## 🕷️ Web Scraping — How It Works

EasyHire scrapes 5 official government portals every **6 hours**:

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
│  Every 6 hours (APScheduler)            │
│                                         │
│  1. Run all 5 scrapers in sequence      │
│  2. Parse HTML with BeautifulSoup       │
│  3. Extract: name, dates, links         │
│  4. Merge with manual fallback DB       │
│  5. Deduplicate by name similarity      │
│  6. Cache result in memory              │
└─────────────────────────────────────────┘
         ↓ On API request
┌─────────────────────────────────────────┐
│  Return cached data (instant response)  │
│  If cache expired → re-scrape first     │
└─────────────────────────────────────────┘
```

### Fallback System

Government websites sometimes block scrapers or change layout. EasyHire handles this gracefully:

- **If scraping succeeds**: scraped data is merged with manual database
- **If scraping fails**: manual database with 20+ pre-curated exams is used
- Each exam has a `source` field: `"scraped-upsc"`, `"scraped-kpsc"`, or `"manual"`

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

EasyHire includes a built-in **Study Assistant chatbot** powered by the Claude API. It gives aspirants a conversational way to get exam guidance, including:

- Syllabus breakdowns and topic-wise advice
- Book and resource recommendations
- Study strategies based on time remaining
- Kerala-specific exam tips
- Answers to questions about exam pattern, cutoffs, and more

The chatbot is accessible directly within the app interface and uses the Claude API to deliver context-aware, personalised responses.

---

## 🔧 Configuration

### Change scrape interval (default: 6 hours)

In `app.py`:
```python
CACHE_TTL_HOURS = 6  # change to desired hours
```

### Add new exams to manual database

In `app.py`, add a new entry to `MANUAL_EXAMS` list:
```python
{
    "id": "unique-id",
    "name": "Exam Name",
    "body": "Conducting Body",
    "level": "Central",  # or "Kerala"
    "category": "Banking",
    "applicationEnd": "2025-12-31",
    "minAge": 21,
    "maxAge": 30,
    "qualifications": ["graduation"],
    ...
}
```

### Add a new scraper

In `app.py`, add a function:
```python
def scrape_mysite():
    exams = []
    r = safe_get("https://example.gov.in/recruitment")
    # parse with BeautifulSoup
    return exams
```

Then register it in `run_all_scrapers()`:
```python
("MySite", scrape_mysite),
```

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
- `REQUEST_TIMEOUT = 15` seconds prevents hanging
- Results are **cached for 6 hours** — only 4 requests/day per site
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
curl -X POST http://localhost:5000/api/scrape/refresh

# Stats
curl http://localhost:5000/api/stats
```

---

*Built with Flask · BeautifulSoup · React · Vite · Claude API*
