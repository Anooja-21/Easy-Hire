"""
EasyHire Backend — Flask API
"""
import json, re, time, logging, hashlib, sqlite3, secrets, os
from datetime import datetime, timedelta
from threading import Lock
from functools import wraps

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request, g

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

try:
    from flask_cors import CORS
except ImportError:
    class CORS:
        def __init__(self, app, **kwargs):
            @app.after_request
            def add_cors(response):
                response.headers["Access-Control-Allow-Origin"] = "*"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                return response

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:
    import threading
    class BackgroundScheduler:
        def __init__(self): pass
        def add_job(self, func, trigger, hours=6, id=None):
            def runner():
                while True:
                    time.sleep(hours * 3600)
                    try: func()
                    except: pass
            threading.Thread(target=runner, daemon=True).start()
        def start(self): pass

from auth import hash_password, verify_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("EasyHire")

app = Flask(__name__)
CORS(app)

DB_PATH = "easyhire.db"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}
REQUEST_TIMEOUT = 20

# ─── DATABASE ─────────────────────────────────────────────────────────────────

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)
    if db: db.close()

def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                dob TEXT, gender TEXT, qualification TEXT, percentage REAL,
                stream TEXT, category TEXT, preferred_level TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS saved_exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                exam_id TEXT NOT NULL, exam_name TEXT NOT NULL,
                saved_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, exam_id)
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL
            );
        """)
    log.info("Database initialised.")

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

SESSION_TTL_DAYS = 30

def create_session(user_id):
    token = secrets.token_hex(32)
    expires = (datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS)).isoformat()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, expires))
    return token

def get_user_from_token(token):
    if not token: return None
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')",
            (token,)
        ).fetchone()
    return dict(row) if row else None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
        user = get_user_from_token(token)
        if not user:
            return jsonify({"error": "Unauthorised. Please log in."}), 401
        return f(current_user=user, *args, **kwargs)
    return decorated

# ─── CACHE ────────────────────────────────────────────────────────────────────

_cache = {}
_cache_lock = Lock()
CACHE_TTL_HOURS = 6

def cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (datetime.utcnow() - entry["ts"]) < timedelta(hours=CACHE_TTL_HOURS):
            return entry["data"]
    return None

def cache_set(key, data):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": datetime.utcnow()}

# ─── MANUAL EXAMS ─────────────────────────────────────────────────────────────

MANUAL_EXAMS = [
    {"id":"upsc-cse","name":"UPSC Civil Services Examination (IAS/IPS/IFS)","body":"UPSC","level":"Central","category":"Civil Services","notificationDate":"2025-01-22","applicationStart":"2025-01-22","applicationEnd":"2025-02-11","examDate":"2025-05-25","minAge":21,"maxAge":32,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10,"Ex-Servicemen":5},"qualifications":["graduation"],"minPercentage":None,"subjects":["General Studies","CSAT","Optional Subject"],"vacancies":979,"salary":"₹56,100 – ₹2,50,000","officialLink":"https://upsc.gov.in","previousPapers":"https://upsc.gov.in/examinations/previous-question-papers","syllabus":"https://upsc.gov.in/examinations/syllabus","tags":["IAS","IPS","IFS","prestigious"],"description":"The most prestigious civil services exam for IAS, IPS, IFS and 22 other All India Services.","source":"manual"},
    {"id":"ssc-cgl","name":"SSC Combined Graduate Level (CGL)","body":"SSC","level":"Central","category":"Staff Selection","notificationDate":"2025-06-01","applicationStart":"2025-06-01","applicationEnd":"2025-06-25","examDate":"2025-09-10","minAge":18,"maxAge":32,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10,"Ex-Servicemen":3},"qualifications":["graduation"],"minPercentage":None,"subjects":["Quantitative Aptitude","English","Reasoning","General Awareness"],"vacancies":14582,"salary":"₹25,500 – ₹1,51,100","officialLink":"https://ssc.gov.in","previousPapers":"https://ssc.gov.in/Examination/PreviousYear","syllabus":"https://ssc.gov.in/Syllabus","tags":["Income Tax","CBI","Excise","CSS"],"description":"One of India's largest recruitment exams for Group B & C posts in central government departments.","source":"manual"},
    {"id":"ssc-chsl","name":"SSC Combined Higher Secondary Level (CHSL)","body":"SSC","level":"Central","category":"Staff Selection","notificationDate":"2025-03-03","applicationStart":"2025-03-03","applicationEnd":"2025-03-31","examDate":"2025-06-16","minAge":18,"maxAge":27,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10},"qualifications":["12th","graduation"],"minPercentage":None,"subjects":["Quantitative Aptitude","English","Reasoning","General Awareness"],"vacancies":3712,"salary":"₹19,900 – ₹81,100","officialLink":"https://ssc.gov.in","previousPapers":"https://ssc.gov.in/Examination/PreviousYear","syllabus":"https://ssc.gov.in/Syllabus","tags":["LDC","DEO","Postal Assistant"],"description":"Recruitment for LDC, DEO, Postal and Sorting Assistants in central government departments.","source":"manual"},
    {"id":"ibps-po","name":"IBPS PO (Probationary Officer)","body":"IBPS","level":"Central","category":"Banking","notificationDate":"2025-07-28","applicationStart":"2025-07-28","applicationEnd":"2025-08-18","examDate":"2025-10-11","minAge":20,"maxAge":30,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10},"qualifications":["graduation"],"minPercentage":None,"subjects":["Reasoning","English","Quantitative Aptitude","General Awareness","Computer"],"vacancies":4455,"salary":"₹52,000 – ₹80,000 (CTC)","officialLink":"https://ibps.in","previousPapers":"https://ibps.in/resources/common-written-examination","syllabus":"https://ibps.in/cwe-po-mt-xiii","tags":["Bank PO","officer","banking"],"description":"Common recruitment for Probationary Officers in 11 public sector banks across India.","source":"manual"},
    {"id":"ibps-clerk","name":"IBPS Clerk","body":"IBPS","level":"Central","category":"Banking","notificationDate":"2025-09-01","applicationStart":"2025-09-01","applicationEnd":"2025-09-21","examDate":"2025-12-06","minAge":20,"maxAge":28,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10},"qualifications":["graduation"],"minPercentage":None,"subjects":["Reasoning","English","Quantitative Aptitude","General Awareness","Computer"],"vacancies":6128,"salary":"₹29,000 – ₹45,000 (CTC)","officialLink":"https://ibps.in","previousPapers":"https://ibps.in/resources/common-written-examination","syllabus":"https://ibps.in/cwe-clerk-xiv","tags":["Bank Clerk","clerical","banking"],"description":"Common recruitment for Clerical Cadre posts in public sector banks.","source":"manual"},
    {"id":"sbi-po","name":"SBI PO (Probationary Officer)","body":"SBI","level":"Central","category":"Banking","notificationDate":"2025-04-01","applicationStart":"2025-04-01","applicationEnd":"2025-04-21","examDate":"2025-06-08","minAge":21,"maxAge":30,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10},"qualifications":["graduation"],"minPercentage":None,"subjects":["Reasoning & Computer","Data Analysis","English","General/Economy/Banking Awareness"],"vacancies":600,"salary":"₹41,960 – ₹85,920 (plus perks)","officialLink":"https://sbi.co.in/careers","previousPapers":"https://bank.exampundit.in/sbi-po-previous-papers","syllabus":"https://sbi.co.in/careers","tags":["SBI","bank PO","prestigious"],"description":"Recruitment of Probationary Officers in State Bank of India.","source":"manual"},
    {"id":"railway-ntpc","name":"Railway NTPC (Non-Technical Popular Categories)","body":"RRB","level":"Central","category":"Railway","notificationDate":"2025-09-01","applicationStart":"2025-09-01","applicationEnd":"2025-09-30","examDate":"2026-01-01","minAge":18,"maxAge":33,"ageRelaxation":{"OBC":3,"SC_ST":5,"PwD":10,"Ex-Servicemen":3},"qualifications":["12th","graduation"],"minPercentage":None,"subjects":["Mathematics","General Intelligence & Reasoning","General Awareness"],"vacancies":11558,"salary":"₹19,900 – ₹92,300","officialLink":"https://indianrailways.gov.in","previousPapers":"https://rrbchennai.gov.in/previous-papers","syllabus":"https://indianrailways.gov.in/","tags":["RRB","railway","NTPC"],"description":"Recruitment for various non-technical posts in Indian Railways.","source":"manual"},
    {"id":"nda","name":"NDA & NA Examination","body":"UPSC","level":"Central","category":"Defence","notificationDate":"2025-01-11","applicationStart":"2025-01-11","applicationEnd":"2025-01-31","examDate":"2025-04-13","minAge":16,"maxAge":19,"ageRelaxation":{},"qualifications":["12th"],"minPercentage":None,"subjects":["Mathematics","General Ability Test"],"vacancies":395,"salary":"₹56,100 – ₹1,77,500 (after commission)","officialLink":"https://upsc.gov.in","previousPapers":"https://upsc.gov.in/examinations/previous-question-papers","syllabus":"https://upsc.gov.in/examinations/syllabus","tags":["Army","Navy","Air Force","defence"],"description":"Entry into National Defence Academy and Naval Academy for 12th pass candidates.","genderRestriction":"male","source":"manual"},
    {"id":"psc-police-constable","name":"Kerala PSC Police Constable","body":"Kerala PSC","level":"Kerala","category":"Police / Defence","notificationDate":"2025-03-12","applicationStart":"2025-03-12","applicationEnd":"2025-04-10","examDate":"2025-07-20","minAge":18,"maxAge":26,"ageRelaxation":{"SC_ST":5,"OBC":3,"Ex-Servicemen":5},"qualifications":["10th","12th","graduation"],"minPercentage":None,"subjects":["General Knowledge","Current Affairs","Kerala Renaissance","Mathematics","Mental Ability"],"vacancies":383,"salary":"₹21,000 – ₹45,800","officialLink":"https://keralapsc.gov.in","previousPapers":"https://keralapsc.gov.in/question-papers","syllabus":"https://keralapsc.gov.in/recruitments","tags":["Kerala Police","Constable","PSC"],"description":"Recruitment of Police Constables in Kerala Police through Kerala PSC.","source":"manual"},
    {"id":"psc-ldc","name":"Kerala PSC Lower Division Clerk (LDC)","body":"Kerala PSC","level":"Kerala","category":"Clerical","notificationDate":"2025-04-05","applicationStart":"2025-04-05","applicationEnd":"2025-05-05","examDate":"2025-08-10","minAge":18,"maxAge":36,"ageRelaxation":{"SC_ST":5,"OBC":3,"PwD":10},"qualifications":["10th","12th","graduation"],"minPercentage":None,"subjects":["General Knowledge","Current Affairs","Mental Ability","English","Malayalam"],"vacancies":720,"salary":"₹19,000 – ₹43,600","officialLink":"https://keralapsc.gov.in","previousPapers":"https://keralapsc.gov.in/question-papers","syllabus":"https://keralapsc.gov.in/recruitments","tags":["LDC","Last Grade","PSC","clerical"],"description":"Lower Division Clerk and Last Grade Servant posts across Kerala government departments.","source":"manual"},
    {"id":"psc-degree-level","name":"Kerala PSC Degree Level Preliminary Examination (DLPE)","body":"Kerala PSC","level":"Kerala","category":"Civil Services","notificationDate":"2025-01-20","applicationStart":"2025-01-20","applicationEnd":"2025-02-19","examDate":"2025-05-18","minAge":18,"maxAge":36,"ageRelaxation":{"SC_ST":5,"OBC":3,"PwD":10},"qualifications":["graduation"],"minPercentage":None,"subjects":["General Knowledge","Current Affairs","Renaissance of Kerala","Mental Ability"],"vacancies":180,"salary":"₹27,900 – ₹85,000+","officialLink":"https://keralapsc.gov.in","previousPapers":"https://keralapsc.gov.in/question-papers","syllabus":"https://keralapsc.gov.in/recruitments","tags":["Degree Level","DLPE","PSC","common prelims"],"description":"Common preliminary exam for degree-level posts in the Kerala government.","source":"manual"},
    {"id":"psc-teacher-lp","name":"Kerala PSC LP School Teacher","body":"Kerala PSC","level":"Kerala","category":"Teaching","notificationDate":"2025-06-01","applicationStart":"2025-06-01","applicationEnd":"2025-07-01","examDate":"2025-10-12","minAge":18,"maxAge":43,"ageRelaxation":{"SC_ST":5,"OBC":3,"PwD":10},"qualifications":["12th","graduation"],"minPercentage":50,"subjects":["Child Development & Pedagogy","Language-I (Malayalam)","Language-II (English)","Mathematics & Environmental Science"],"vacancies":240,"salary":"₹29,200 – ₹62,400","officialLink":"https://keralapsc.gov.in","previousPapers":"https://keralapsc.gov.in/question-papers","syllabus":"https://keralapsc.gov.in/recruitments","tags":["LP Teacher","Primary Teacher","PSC"],"description":"Lower Primary School Teacher posts under the Kerala Education Department.","source":"manual"},
    {"id":"psc-veo","name":"Kerala PSC Village Extension Officer (VEO)","body":"Kerala PSC","level":"Kerala","category":"Revenue / Administration","notificationDate":"2025-08-01","applicationStart":"2025-08-01","applicationEnd":"2025-09-01","examDate":"2025-12-14","minAge":18,"maxAge":36,"ageRelaxation":{"SC_ST":5,"OBC":3,"PwD":10},"qualifications":["graduation"],"minPercentage":None,"subjects":["General Knowledge","Kerala Renaissance","Mental Ability","Agriculture Basics"],"vacancies":75,"salary":"₹26,500 – ₹56,700","officialLink":"https://keralapsc.gov.in","previousPapers":"https://keralapsc.gov.in/question-papers","syllabus":"https://keralapsc.gov.in/recruitments","tags":["VEO","Village Officer","PSC","Revenue"],"description":"Village Extension Officer posts in Kerala's Local Self Government Department.","source":"manual"},
]

# ─── SCRAPERS ─────────────────────────────────────────────────────────────────

def safe_get(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r
    except Exception as e:
        log.warning(f"GET failed {url}: {e}")
        return None

def _parse_date(s):
    if not s: return None
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d",
                "%d %b %Y", "%d %B %Y", "%d %b. %Y"):
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def _make_id(prefix, name):
    return prefix + hashlib.md5(name.encode()).hexdigest()[:10]

# ─── KERALA PSC SCRAPER ───────────────────────────────────────────────────────

def scrape_kerala_psc():
    exams = []
    cutoff = (datetime.today() - timedelta(days=180)).strftime("%Y-%m-%d")

    r = safe_get("https://www.keralapsc.gov.in/notifications")
    if not r:
        log.warning("  KPSC: Could not fetch notifications listing")
        return exams

    soup = BeautifulSoup(r.text, "lxml")
    gazette_rows = []

    for row in soup.select("table tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue
        link_tag = cells[0].find("a", href=True)
        if not link_tag:
            continue
        href = link_tag["href"]
        gazette_url = href if href.startswith("http") else "https://www.keralapsc.gov.in" + href
        if "gazette" not in gazette_url.lower():
            continue
        raw_date = cells[2].get_text(strip=True)
        last_date = _parse_date(raw_date)
        if last_date and last_date < cutoff:
            continue
        gazette_rows.append((gazette_url, last_date))

    gazette_rows = gazette_rows[:2]
    log.info(f"  KPSC: scraping latest {len(gazette_rows)} gazette(s)")

    POST_SKIP = [
        "ANSWER KEY", "RANK LIST", "HALL TICKET", "ADMIT CARD", "RESULT",
        "INTERVIEW", "CIRCULAR", "TENDER", "CORRIGENDUM", "QUESTION PAPER",
        "MERIT LIST", "SCORE CARD", "DOCUMENT VERIFICATION",
    ]

    KPSC_PDF_RE = re.compile(r'sites/default/files/\d{4}-\d{2}/noti', re.I)

    for gazette_url, last_date in gazette_rows:
        gr = safe_get(gazette_url)
        if not gr:
            continue

        gsoup = BeautifulSoup(gr.text, "lxml")
        post_count = 0

        for a in gsoup.find_all("a", href=True):
            href = a["href"]
            if not (KPSC_PDF_RE.search(href)):
                continue

            raw_title = a.get_text(strip=True)
            if not raw_title or len(raw_title) < 15:
                continue
            if any(k in raw_title.upper() for k in POST_SKIP):
                continue

            title = re.sub(r'\s*\(CAT\.NO\.[^)]*\)\s*$', '', raw_title, flags=re.I).strip()
            title = re.sub(r'\s*-?\s*CAT\.?\s*NO\.?\s*\d+[-/]\d+\s*$', '', title, flags=re.I).strip()
            title = re.sub(r'\s+', ' ', title).strip()

            if len(title) < 10:
                continue

            # ── FIX: Proper qualification detection ──────────────────────────
            tl = title.lower()
            if any(w in tl for w in [
                "degree", "graduate", "b.sc", "b.com", "b.a ", "b.tech", "llb",
                "mba", "engineer", "officer", "executive", "lecturer", "professor",
                "doctor", "surgeon", "inspector", "auditor", "accountant", "overseer",
            ]):
                qual = ["graduation"]
            elif any(w in tl for w in ["diploma"]):
                qual = ["diploma", "graduation"]
            elif any(w in tl for w in ["iti", "technician", "fitter", "welder", "turner", "mechanic"]):
                qual = ["iti", "diploma", "graduation"]
            elif any(w in tl for w in [
                "plus two", "12th", "+2", "hse", "higher secondary",
                "typist", "data entry", "stenographer",
            ]):
                qual = ["12th", "diploma", "graduation"]
            else:
                # General/clerical posts open to 10th and above
                qual = ["10th", "12th", "iti", "diploma", "graduation"]

            pdf_link = href if href.startswith("http") else "https://www.keralapsc.gov.in" + href

            exams.append({
                "id": _make_id("kpsc-", title + gazette_url),
                "name": title[:150],
                "body": "Kerala PSC",
                "level": "Kerala",
                "category": "General",
                "notificationDate": None,
                "applicationStart": None,
                "applicationEnd": last_date,
                "examDate": None,
                "minAge": 18,
                "maxAge": 43,
                "ageRelaxation": {"SC_ST": 5, "OBC": 3, "PwD": 10},
                "qualifications": qual,
                "minPercentage": None,
                "subjects": ["General Knowledge", "Current Affairs", "Mental Ability"],
                "vacancies": 0,
                "salary": "As per Kerala Service Rules",
                "officialLink": pdf_link,
                "previousPapers": "https://keralapsc.gov.in/previous-question-papers",
                "syllabus": gazette_url,
                "tags": ["Kerala PSC"],
                "description": raw_title[:200],
                "source": "scraped-kpsc",
            })
            post_count += 1

        log.info(f"  KPSC {gazette_url.split('gazette-date-')[-1]}: {post_count} posts")

    seen_ids = set()
    result = [e for e in exams if not (e["id"] in seen_ids or seen_ids.add(e["id"]))]
    log.info(f"  Kerala PSC total: {len(result)} posts")
    return result

# ─── SARKARI RESULT SCRAPER ───────────────────────────────────────────────────

BODY_MAP = {
    "SSC": ("SSC", "Central", "Staff Selection"),
    "UPSC": ("UPSC", "Central", "Civil Services"),
    "IBPS": ("IBPS", "Central", "Banking"),
    "SBI": ("SBI", "Central", "Banking"),
    "RBI": ("RBI", "Central", "Banking"),
    "RRB": ("RRB", "Central", "Railway"),
    "RAILWAY": ("RRB", "Central", "Railway"),
    "INDIAN RAILWAY": ("RRB", "Central", "Railway"),
    "KERALA PSC": ("Kerala PSC", "Kerala", "General"),
    "KERALA": ("Kerala PSC", "Kerala", "General"),
    "POLICE": ("Police Dept", "Central", "Police / Defence"),
    "ARMY": ("Indian Army", "Central", "Defence"),
    "NAVY": ("Indian Navy", "Central", "Defence"),
    "AIRFORCE": ("Indian Air Force", "Central", "Defence"),
    "NDA": ("UPSC", "Central", "Defence"),
    "CRPF": ("CRPF", "Central", "Police / Defence"),
    "BSF": ("BSF", "Central", "Police / Defence"),
    "CISF": ("CISF", "Central", "Police / Defence"),
    "ESIC": ("ESIC", "Central", "Health"),
    "AIIMS": ("AIIMS", "Central", "Health"),
    "ISRO": ("ISRO", "Central", "Science & Tech"),
    "HIGH COURT": ("High Court", "Central", "Judiciary"),
    "LIC": ("LIC", "Central", "Insurance"),
    "FCI": ("FCI", "Central", "General"),
    "NVS": ("NVS", "Central", "Teaching"),
    "KVS": ("KVS", "Central", "Teaching"),
}

SKIP_KEYS = [
    "RESULT", "ANSWER KEY", "ADMIT CARD", "HALL TICKET",
    "MERIT LIST", "RANK LIST", "CUT OFF", "SCORE CARD",
    "DOCUMENT VERIFICATION", "INTERVIEW SCHEDULE", "JOINING LETTER",
]

MUST_HAVE = [
    "RECRUITMENT", "VACANCY", "NOTIFICATION", "BHARTI",
    "ONLINE FORM", "APPLY ONLINE", "APPLICATION FORM",
    "ADVT", "ADVERTISEMENT", "JOBS", "POSTS", "HIRING",
]

def _detect_body(title_up):
    for kw, (b, lv, cat) in BODY_MAP.items():
        if kw in title_up:
            return b, lv, cat
    return "Various", "Central", "General"

def _detect_qual(text_up):
    if any(w in text_up for w in ["GRADUATE","DEGREE","BACHELOR","B.TECH","B.SC","B.COM","B.A","LLB","MBA","B.E","M.SC","MCA","BCA"]):
        return ["graduation"]
    if any(w in text_up for w in ["DIPLOMA"]):
        return ["diploma", "graduation"]
    if any(w in text_up for w in ["ITI","TECHNICIAN","FITTER","WELDER","TURNER"]):
        return ["iti", "diploma", "graduation"]
    if any(w in text_up for w in ["12TH","HIGHER SECONDARY","INTERMEDIATE","PLUS TWO","HSC","10+2","XII"]):
        return ["12th", "diploma", "graduation"]
    return ["10th", "12th", "iti", "diploma", "graduation"]

def _extract_row_data(texts):
    vacancies = 0
    app_start = app_end = None
    age_min, age_max = 18, 35
    qual = ["10th", "12th", "iti", "diploma", "graduation"]
    for t in texts:
        if not t: continue
        tu = t.upper()
        if not vacancies:
            m = re.search(r'(\d{2,6})\s*(?:posts?|vacanc(?:y|ies)|seats?)', t, re.I)
            if m: vacancies = int(m.group(1))
            elif re.fullmatch(r'\s*\d{2,6}\s*', t): vacancies = int(t.strip())
        dates = re.findall(r'\d{1,2}[./-]\d{1,2}[./-]\d{4}', t)
        if dates:
            tl = t.lower()
            if any(w in tl for w in ["last", "end", "close", "till", "upto", "closing"]):
                app_end = _parse_date(dates[-1])
            elif any(w in tl for w in ["start", "begin", "from", "open"]):
                app_start = _parse_date(dates[0])
            elif len(dates) >= 2:
                app_start = _parse_date(dates[0])
                app_end = _parse_date(dates[-1])
            elif app_end is None:
                app_end = _parse_date(dates[-1])
        am = re.search(r'(\d{2})\s*[-–to]+\s*(\d{2})\s*(?:years?|yrs?)', t, re.I)
        if am:
            age_min = int(am.group(1))
            age_max = int(am.group(2))
        q = _detect_qual(tu)
        if q != ["10th", "12th", "iti", "diploma", "graduation"]: qual = q
    return vacancies, app_start, app_end, age_min, age_max, qual

def scrape_sarkari_result():
    exams = []
    SR_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
        "DNT": "1",
    }
    SR_URLS = [
        "https://www.sarkariresult.com/latestjob/",
        "https://www.sarkariresult.com/latestjob.php",
        "https://www.sarkariresult.com/",
    ]
    global_seen = set()
    for url in SR_URLS:
        try:
            resp = requests.get(url, headers=SR_HEADERS, timeout=15)
            if resp.status_code != 200:
                log.warning(f"  SR {url}: HTTP {resp.status_code}")
                continue
            soup = BeautifulSoup(resp.text, "lxml")
            for table in soup.find_all("table"):
                for row in table.find_all("tr"):
                    cells = row.find_all(["td", "th"])
                    if len(cells) < 2: continue
                    title, link = "", "https://www.sarkariresult.com"
                    for cell in cells:
                        a = cell.find("a", href=True)
                        if a and len(a.get_text(strip=True)) > 10:
                            title = a.get_text(strip=True)
                            href = a["href"]
                            link = href if href.startswith("http") else "https://www.sarkariresult.com/" + href.lstrip("/")
                            break
                    if not title or len(title) < 15 or title in global_seen: continue
                    title_up = title.upper()
                    if any(k in title_up for k in SKIP_KEYS): continue
                    if not any(k in title_up for k in MUST_HAVE): continue
                    global_seen.add(title)
                    texts = [c.get_text(" ", strip=True) for c in cells]
                    vac, app_s, app_e, a_min, a_max, qual = _extract_row_data(texts)
                    body, level, category = _detect_body(title_up)
                    exams.append({
                        "id": _make_id("sr-", title), "name": title[:150],
                        "body": body, "level": level, "category": category,
                        "notificationDate": None, "applicationStart": app_s,
                        "applicationEnd": app_e, "examDate": None,
                        "minAge": a_min, "maxAge": a_max,
                        "ageRelaxation": {"OBC":3,"SC_ST":5,"PwD":10,"Ex-Servicemen":3},
                        "qualifications": qual, "minPercentage": None,
                        "subjects": ["General Knowledge","Reasoning","Quantitative Aptitude"],
                        "vacancies": vac, "salary": "As per Government norms",
                        "officialLink": link, "previousPapers": "", "syllabus": link,
                        "tags": [body], "description": title[:200], "source": "sarkariresult",
                    })
            for li in soup.find_all("li"):
                li_text = li.get_text(" ", strip=True)
                if len(li_text) < 20: continue
                a = li.find("a", href=True)
                if not a: continue
                title = a.get_text(strip=True)
                if not title or len(title) < 15 or title in global_seen: continue
                title_up = title.upper()
                if any(k in title_up for k in SKIP_KEYS): continue
                if not any(k in title_up for k in MUST_HAVE): continue
                global_seen.add(title)
                href = a["href"]
                link = href if href.startswith("http") else "https://www.sarkariresult.com/" + href.lstrip("/")
                vac, app_s, app_e, a_min, a_max, qual = _extract_row_data([li_text])
                body, level, category = _detect_body(title_up)
                exams.append({
                    "id": _make_id("sr-", title), "name": title[:150],
                    "body": body, "level": level, "category": category,
                    "notificationDate": None, "applicationStart": app_s,
                    "applicationEnd": app_e, "examDate": None,
                    "minAge": a_min, "maxAge": a_max,
                    "ageRelaxation": {"OBC":3,"SC_ST":5,"PwD":10,"Ex-Servicemen":3},
                    "qualifications": qual, "minPercentage": None,
                    "subjects": ["General Knowledge","Reasoning","Quantitative Aptitude"],
                    "vacancies": vac, "salary": "As per Government norms",
                    "officialLink": link, "previousPapers": "", "syllabus": link,
                    "tags": [body], "description": title[:200], "source": "sarkariresult",
                })
            log.info(f"  SarkariResult from {url}: {len(exams)} rows")
            if exams: break
        except Exception as e:
            log.error(f"  SarkariResult error {url}: {e}")
    return exams

def _filter_recent(exams):
    cutoff = (datetime.today() - timedelta(days=180)).strftime("%Y-%m-%d")
    result = [e for e in exams if e.get("applicationEnd") and e["applicationEnd"] >= cutoff]
    log.info(f"  Date filter: {len(exams)} → {len(result)} kept")
    return result

def run_all_scrapers():
    log.info("=== Starting scrape cycle ===")
    sr_exams   = scrape_sarkari_result()
    kpsc_exams = scrape_kerala_psc()
    all_scraped = sr_exams + kpsc_exams
    log.info(f"  Raw: {len(sr_exams)} SarkariResult + {len(kpsc_exams)} Kerala PSC")
    filtered = _filter_recent(all_scraped)
    seen = set()
    merged = []
    for exam in MANUAL_EXAMS:
        if exam["id"] not in seen:
            seen.add(exam["id"])
            merged.append(exam)
    for exam in filtered:
        if exam["id"] not in seen:
            seen.add(exam["id"])
            merged.append(exam)
    today_str = datetime.today().strftime("%Y-%m-%d")
    def sort_key(e):
        end = e.get("applicationEnd")
        if not end: return ("B", "9999-12-31")
        if end >= today_str: return ("A", end)
        return ("C", end)
    merged.sort(key=sort_key)
    cache_set("all_exams", merged)
    log.info(f"=== Done. Total: {len(merged)} (manual={len(MANUAL_EXAMS)}, scraped={len(filtered)}) ===")
    return merged

def get_exams():
    cached = cache_get("all_exams")
    return cached if cached else run_all_scrapers()

# ─── ELIGIBILITY ──────────────────────────────────────────────────────────────

# FIX: "iti" and "diploma" added in correct order between 10th and 12th
QUAL_HIERARCHY = ["10th", "iti", "diploma", "12th", "graduation", "post-graduation", "phd"]

def meets_qualification(user_qual, exam_quals):
    """
    User qualifies if their qualification level >= any required qualification in the exam.
    Example: user with "diploma" qualifies for exams requiring "10th" or "iti" but NOT "12th" or "graduation".
    """
    if not exam_quals:
        return False
    try:
        user_idx = QUAL_HIERARCHY.index(user_qual)
    except ValueError:
        user_idx = QUAL_HIERARCHY.index("graduation")

    for q in exam_quals:
        try:
            req_idx = QUAL_HIERARCHY.index(q)
            if user_idx >= req_idx:
                return True
        except ValueError:
            continue
    return False

def calculate_age(dob_str):
    try:
        dob = datetime.strptime(dob_str, "%Y-%m-%d")
        today = datetime.today()
        age = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day): age -= 1
        return age
    except: return 0

def filter_eligible(exams, profile):
    age = calculate_age(profile["dob"])
    category = profile.get("category","General")
    gender = profile.get("gender","")
    qualification = profile.get("qualification","graduation")
    percentage = profile.get("percentage")
    eligible = []
    for exam in exams:
        if exam.get("genderRestriction") and gender and exam["genderRestriction"] != gender: continue
        if not meets_qualification(qualification, exam.get("qualifications",[])): continue
        if exam.get("minPercentage") and percentage and float(percentage) < exam["minPercentage"]: continue
        relaxation = exam.get("ageRelaxation",{})
        bonus = relaxation.get(category,0)
        if age < exam.get("minAge",0) or age > exam.get("maxAge",99) + bonus: continue
        eligible.append({**exam, "_appliedAgeRelaxation": bonus})
    return eligible

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data: return jsonify({"error":"JSON body required"}), 400
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not name: return jsonify({"error":"Name is required"}), 400
    if not email or "@" not in email: return jsonify({"error":"Valid email is required"}), 400
    if len(password) < 8: return jsonify({"error":"Password must be at least 8 characters"}), 400
    try:
        with sqlite3.connect(DB_PATH) as db:
            cursor = db.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", (name, email, hash_password(password)))
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error":"An account with this email already exists"}), 409
    token = create_session(user_id)
    return jsonify({"token": token, "user": {"id": user_id, "name": name, "email": email}}), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data: return jsonify({"error":"JSON body required"}), 400
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password: return jsonify({"error":"Email and password required"}), 400
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not user or not verify_password(password, user["password"]):
        return jsonify({"error":"Invalid email or password"}), 401
    token = create_session(user["id"])
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        profile_row = db.execute("SELECT * FROM profiles WHERE user_id=?", (user["id"],)).fetchone()
    return jsonify({"token": token, "user": {"id":user["id"],"name":user["name"],"email":user["email"]}, "profile": dict(profile_row) if profile_row else None})

@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout(current_user):
    token = request.headers.get("Authorization","").replace("Bearer ","").strip()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM sessions WHERE token=?", (token,))
    return jsonify({"message":"Logged out"})

@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me(current_user):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        profile_row = db.execute("SELECT * FROM profiles WHERE user_id=?", (current_user["id"],)).fetchone()
    return jsonify({"user":{"id":current_user["id"],"name":current_user["name"],"email":current_user["email"]}, "profile":dict(profile_row) if profile_row else None})

# ─── PROFILE ROUTES ───────────────────────────────────────────────────────────

@app.route("/api/profile", methods=["POST"])
@require_auth
def save_profile(current_user):
    data = request.get_json()
    if not data: return jsonify({"error":"JSON body required"}), 400
    with sqlite3.connect(DB_PATH) as db:
        db.execute("""
            INSERT INTO profiles (user_id,dob,gender,qualification,percentage,stream,category,preferred_level,updated_at)
            VALUES (?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                dob=excluded.dob, gender=excluded.gender, qualification=excluded.qualification,
                percentage=excluded.percentage, stream=excluded.stream, category=excluded.category,
                preferred_level=excluded.preferred_level, updated_at=datetime('now')
        """, (current_user["id"], data.get("dob"), data.get("gender"), data.get("qualification"),
              data.get("percentage"), data.get("stream"), data.get("category"), data.get("preferredLevel")))
    return jsonify({"message":"Profile saved"})

# ─── SAVED EXAMS ──────────────────────────────────────────────────────────────

@app.route("/api/saved", methods=["GET"])
@require_auth
def get_saved(current_user):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute("SELECT exam_id,exam_name,saved_at FROM saved_exams WHERE user_id=? ORDER BY saved_at DESC", (current_user["id"],)).fetchall()
    saved_ids = [r["exam_id"] for r in rows]
    exam_map = {e["id"]: e for e in get_exams()}
    return jsonify({"savedIds": saved_ids, "exams": [exam_map[eid] for eid in saved_ids if eid in exam_map]})

@app.route("/api/saved/<exam_id>", methods=["POST"])
@require_auth
def save_exam(current_user, exam_id):
    exam = next((e for e in get_exams() if e["id"] == exam_id), None)
    if not exam: return jsonify({"error":"Exam not found"}), 404
    with sqlite3.connect(DB_PATH) as db:
        db.execute("INSERT OR IGNORE INTO saved_exams (user_id,exam_id,exam_name) VALUES (?,?,?)", (current_user["id"], exam_id, exam["name"]))
    return jsonify({"message":"Exam saved","examId":exam_id})

@app.route("/api/saved/<exam_id>", methods=["DELETE"])
@require_auth
def unsave_exam(current_user, exam_id):
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM saved_exams WHERE user_id=? AND exam_id=?", (current_user["id"], exam_id))
    return jsonify({"message":"Exam removed","examId":exam_id})

# ─── CORE ROUTES ──────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status":"ok","timestamp":datetime.utcnow().isoformat()})

@app.route("/api/exams", methods=["GET"])
def all_exams():
    exams = get_exams()
    sources = {}
    for e in exams: sources[e.get("source","?")] = sources.get(e.get("source","?"),0) + 1
    return jsonify({"exams":exams,"total":len(exams),"sources":sources})

@app.route("/api/scrape", methods=["POST"])
def force_scrape():
    with _cache_lock: _cache.pop("all_exams", None)
    exams = run_all_scrapers()
    sources = {}
    for e in exams: sources[e.get("source","?")] = sources.get(e.get("source","?"),0) + 1
    return jsonify({"message":"Scrape complete","total":len(exams),"sources":sources})

@app.route("/api/eligible", methods=["POST"])
def eligible_exams():
    data = request.get_json()
    if not data: return jsonify({"error":"JSON body required"}), 400
    exams = get_exams()
    level_filter = data.get("preferredLevel","Both")
    if level_filter and level_filter != "Both":
        exams = [e for e in exams if e.get("level") == level_filter]
    eligible = filter_eligible(exams, data)
    today = datetime.today().date()
    urgent, upcoming, later, closed = [], [], [], []
    for e in eligible:
        end = e.get("applicationEnd")
        if not end: later.append(e); continue
        try:
            days = (datetime.strptime(end,"%Y-%m-%d").date() - today).days
            if days < 0: closed.append(e)
            elif days <= 7: urgent.append(e)
            elif days <= 30: upcoming.append(e)
            else: later.append(e)
        except: later.append(e)
    return jsonify({
        "profile":{"age":calculate_age(data["dob"]),"qualification":data.get("qualification"),"category":data.get("category","General")},
        "summary":{"total":len(eligible),"urgent":len(urgent),"upcoming":len(upcoming),"later":len(later),"closed":len(closed),
                   "central":sum(1 for e in eligible if e.get("level")=="Central"),
                   "kerala":sum(1 for e in eligible if e.get("level")=="Kerala")},
        "exams":{"urgent":urgent,"upcoming":upcoming,"later":later,"closed":closed},
        "all":eligible,
    })

@app.route("/api/stats", methods=["GET"])
def stats():
    exams = get_exams()
    bodies, levels, categories = {}, {}, {}
    for e in exams:
        bodies[e.get("body","?")] = bodies.get(e.get("body","?"),0) + 1
        levels[e.get("level","?")] = levels.get(e.get("level","?"),0) + 1
        categories[e.get("category","Other")] = categories.get(e.get("category","Other"),0) + 1
    return jsonify({"totalExams":len(exams),"byLevel":levels,"byBody":bodies,"byCategory":categories})

# ─── STARTUP ──────────────────────────────────────────────────────────────────

scheduler = BackgroundScheduler()
scheduler.add_job(run_all_scrapers, "interval", hours=CACHE_TTL_HOURS, id="scrape_job")
scheduler.start()

if __name__ == "__main__":
    log.info("EasyHire Backend starting...")
    init_db()
    run_all_scrapers()
    app.run(host="0.0.0.0", port=5000, debug=False)
