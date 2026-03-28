"""
admin_routes.py — EasyHire Admin API  (v2)
Registers all /api/admin/* routes on the Flask app.

New in v2:
 - Activity / access-log tracking  (log_access helper + table)
 - Scraper interval control        (GET/POST /admin/settings)
 - Rich analytics endpoints        (hourly, daily, weekly trends)
 - Report generation               (CSV / JSON download)
 - Enhanced dashboard stats
"""
import csv
import io
import json
import sqlite3
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request, make_response
from auth import hash_password, verify_password

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

DB_PATH = "easyhire.db"

# ─── SEED CREDENTIALS (change before production) ──────────────────────────────
ADMIN_EMAIL    = "admin@easyhire.com"
ADMIN_PASSWORD = "Admin@123456"


# ─── DB HELPER ────────────────────────────────────────────────────────────────
def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── SCHEMA MIGRATION ─────────────────────────────────────────────────────────
def init_admin_schema():
    """Idempotent — safe to call on every startup."""
    for col_sql in [
        "ALTER TABLE users ADD COLUMN role   TEXT NOT NULL DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
    ]:
        try:
            with sqlite3.connect(DB_PATH) as db:
                db.execute(col_sql)
        except sqlite3.OperationalError:
            pass

    with sqlite3.connect(DB_PATH) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token      TEXT PRIMARY KEY,
                admin_id   INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admin_jobs (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                title             TEXT NOT NULL,
                body              TEXT,
                category          TEXT DEFAULT 'Other',
                level             TEXT DEFAULT 'Central',
                min_age           INTEGER DEFAULT 18,
                max_age           INTEGER DEFAULT 35,
                qualification     TEXT DEFAULT 'Any',
                vacancies         INTEGER DEFAULT 0,
                salary            TEXT DEFAULT '',
                official_link     TEXT DEFAULT '',
                application_start TEXT,
                application_end   TEXT,
                exam_date         TEXT,
                source            TEXT DEFAULT 'Admin',
                created_at        TEXT DEFAULT (datetime('now')),
                updated_at        TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                title    TEXT NOT NULL,
                message  TEXT NOT NULL,
                target   TEXT NOT NULL DEFAULT 'all',
                sent_at  TEXT DEFAULT (datetime('now')),
                admin_id INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS access_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action  TEXT NOT NULL,
                path    TEXT,
                ip      TEXT,
                ts      TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS system_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO system_settings (key,value) VALUES ('scrape_interval_hours','6');
            INSERT OR IGNORE INTO system_settings (key,value) VALUES ('last_scrape_at','');
            INSERT OR IGNORE INTO system_settings (key,value) VALUES ('scrape_interval_dirty','0');

            INSERT OR IGNORE INTO users (name,email,password,role,status)
            VALUES ('EasyHire Admin','admin@easyhire.com','PLACEHOLDER','admin','active');
        """)

    with sqlite3.connect(DB_PATH) as db:
        row = db.execute(
            "SELECT id,password FROM users WHERE email='admin@easyhire.com'"
        ).fetchone()
        if row and row[1] == "PLACEHOLDER":
            db.execute(
                "UPDATE users SET password=? WHERE email='admin@easyhire.com'",
                (hash_password(ADMIN_PASSWORD),),
            )

    print("[Admin] Schema v2 initialised.")


# ─── ACTIVITY LOGGING ─────────────────────────────────────────────────────────
def log_access(user_id, action, path=None, ip=None):
    try:
        with sqlite3.connect(DB_PATH) as db:
            db.execute(
                "INSERT INTO access_log (user_id,action,path,ip) VALUES (?,?,?,?)",
                (user_id, action, path, ip),
            )
    except Exception:
        pass


# ─── SETTINGS HELPERS ─────────────────────────────────────────────────────────
def get_setting(key, default=None):
    try:
        with _db() as db:
            row = db.execute(
                "SELECT value FROM system_settings WHERE key=?", (key,)
            ).fetchone()
        return row["value"] if row else default
    except Exception:
        return default


def set_setting(key, value):
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT OR REPLACE INTO system_settings (key,value) VALUES (?,?)",
            (key, str(value)),
        )


# ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
def _get_admin_from_token(token):
    if not token:
        return None
    with _db() as db:
        row = db.execute(
            """SELECT u.* FROM admin_sessions s
               JOIN users u ON u.id=s.admin_id
               WHERE s.token=? AND s.expires_at>datetime('now')""",
            (token,),
        ).fetchone()
    if row and row["role"] == "admin":
        return dict(row)
    return None


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = (
            request.headers.get("Authorization", "")
            .replace("Bearer ", "")
            .strip()
        )
        admin = _get_admin_from_token(token)
        if not admin:
            return jsonify({"error": "Admin access required."}), 403
        return f(current_admin=admin, *args, **kwargs)
    return decorated


# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
@admin_bp.route("/auth/login", methods=["POST"])
def admin_login():
    data     = request.get_json() or {}
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    with _db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE email=? AND role='admin'", (email,)
        ).fetchone()

    if not user or not verify_password(password, user["password"]):
        return jsonify({"error": "Invalid admin credentials"}), 401
    if user["status"] != "active":
        return jsonify({"error": "Admin account is disabled"}), 403

    token   = secrets.token_hex(32)
    expires = (datetime.utcnow() + timedelta(days=1)).isoformat()
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT INTO admin_sessions (token,admin_id,expires_at) VALUES (?,?,?)",
            (token, user["id"], expires),
        )
    log_access(user["id"], "admin_login", "/api/admin/auth/login", request.remote_addr)
    return jsonify(
        {"token": token, "admin": {"id": user["id"], "name": user["name"], "email": user["email"]}}
    )


@admin_bp.route("/auth/logout", methods=["POST"])
@require_admin
def admin_logout(current_admin):
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM admin_sessions WHERE token=?", (token,))
    return jsonify({"message": "Admin logged out"})


@admin_bp.route("/auth/me", methods=["GET"])
@require_admin
def admin_me(current_admin):
    return jsonify({
        "id":    current_admin["id"],
        "name":  current_admin["name"],
        "email": current_admin["email"],
        "role":  current_admin["role"],
    })


# ─── SETTINGS ─────────────────────────────────────────────────────────────────
@admin_bp.route("/settings", methods=["GET"])
@require_admin
def get_settings(current_admin):
    return jsonify({
        "scrapeIntervalHours": int(get_setting("scrape_interval_hours", "6")),
        "lastScrapeAt":        get_setting("last_scrape_at", ""),
    })


@admin_bp.route("/settings", methods=["POST"])
@require_admin
def update_settings(current_admin):
    data = request.get_json() or {}
    if "scrapeIntervalHours" in data:
        hours = int(data["scrapeIntervalHours"])
        if hours < 1 or hours > 168:
            return jsonify({"error": "Interval must be 1–168 hours"}), 400
        set_setting("scrape_interval_hours", hours)
        set_setting("scrape_interval_dirty", "1")
    return jsonify({
        "message":             "Settings saved",
        "scrapeIntervalHours": int(get_setting("scrape_interval_hours")),
    })


# ─── DASHBOARD ────────────────────────────────────────────────────────────────
@admin_bp.route("/dashboard", methods=["GET"])
@require_admin
def dashboard(current_admin):
    with _db() as db:
        total_users   = db.execute("SELECT COUNT(*) FROM users WHERE role='user'").fetchone()[0]
        active_users  = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND status='active'").fetchone()[0]
        blocked_users = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND status='blocked'").fetchone()[0]
        pending_users = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND status='pending'").fetchone()[0]
        total_jobs    = db.execute("SELECT COUNT(*) FROM admin_jobs").fetchone()[0]
        total_notifs  = db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]

        new_today = db.execute(
            "SELECT COUNT(*) FROM users WHERE role='user' AND date(created_at)=date('now')"
        ).fetchone()[0]
        new_7d  = db.execute(
            "SELECT COUNT(*) FROM users WHERE role='user' AND created_at>=datetime('now','-7 days')"
        ).fetchone()[0]
        new_30d = db.execute(
            "SELECT COUNT(*) FROM users WHERE role='user' AND created_at>=datetime('now','-30 days')"
        ).fetchone()[0]

        active_sessions = db.execute(
            "SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at>datetime('now')"
        ).fetchone()[0]
        accesses_24h = db.execute(
            "SELECT COUNT(*) FROM access_log WHERE ts>=datetime('now','-1 day')"
        ).fetchone()[0]

        reg_trend = db.execute("""
            SELECT date(created_at) as day, COUNT(*) as cnt
            FROM users WHERE role='user' AND created_at>=datetime('now','-14 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        access_trend = db.execute("""
            SELECT date(ts) as day, COUNT(*) as cnt
            FROM access_log WHERE ts>=datetime('now','-14 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        hourly = db.execute("""
            SELECT strftime('%H',ts) as hr, COUNT(*) as cnt
            FROM access_log WHERE ts>=datetime('now','-1 day')
            GROUP BY hr ORDER BY hr
        """).fetchall()

        top_actions = db.execute("""
            SELECT action, COUNT(*) as cnt FROM access_log
            WHERE ts>=datetime('now','-7 days')
            GROUP BY action ORDER BY cnt DESC LIMIT 8
        """).fetchall()

        qual_dist = db.execute("""
            SELECT p.qualification, COUNT(*) as cnt
            FROM profiles p JOIN users u ON u.id=p.user_id
            WHERE u.role='user' GROUP BY p.qualification ORDER BY cnt DESC
        """).fetchall()

        recent_users = db.execute(
            "SELECT id,name,email,status,created_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 6"
        ).fetchall()

        recent_jobs = db.execute(
            "SELECT id,title,category,level,application_end FROM admin_jobs ORDER BY created_at DESC LIMIT 5"
        ).fetchall()

    return jsonify({
        "stats": {
            "totalUsers":     total_users,
            "activeUsers":    active_users,
            "blockedUsers":   blocked_users,
            "pendingUsers":   pending_users,
            "totalJobs":      total_jobs,
            "totalNotifs":    total_notifs,
            "newToday":       new_today,
            "new7d":          new_7d,
            "new30d":         new_30d,
            "activeSessions": active_sessions,
            "accesses24h":    accesses_24h,
        },
        "trends": {
            "registrations": [dict(r) for r in reg_trend],
            "access":        [dict(r) for r in access_trend],
            "hourly":        [dict(r) for r in hourly],
            "topActions":    [dict(r) for r in top_actions],
            "qualDist":      [dict(r) for r in qual_dist],
        },
        "recentUsers": [dict(r) for r in recent_users],
        "recentJobs":  [dict(r) for r in recent_jobs],
        "settings": {
            "scrapeIntervalHours": int(get_setting("scrape_interval_hours", "6")),
            "lastScrapeAt":        get_setting("last_scrape_at", ""),
        },
    })


# ─── ANALYTICS ────────────────────────────────────────────────────────────────
@admin_bp.route("/analytics", methods=["GET"])
@require_admin
def analytics(current_admin):
    days = int(request.args.get("days", 30))
    with _db() as db:
        reg_daily = db.execute(f"""
            SELECT date(created_at) as day, COUNT(*) as cnt
            FROM users WHERE role='user' AND created_at>=datetime('now','-{days} days')
            GROUP BY day ORDER BY day
        """).fetchall()

        access_daily = db.execute(f"""
            SELECT date(ts) as day, COUNT(*) as cnt
            FROM access_log WHERE ts>=datetime('now','-{days} days')
            GROUP BY day ORDER BY day
        """).fetchall()

        unique_daily = db.execute(f"""
            SELECT date(ts) as day, COUNT(DISTINCT user_id) as cnt
            FROM access_log WHERE ts>=datetime('now','-{days} days') AND user_id IS NOT NULL
            GROUP BY day ORDER BY day
        """).fetchall()

        hourly_24h = db.execute("""
            SELECT strftime('%H',ts) as hr, COUNT(*) as cnt
            FROM access_log WHERE ts>=datetime('now','-1 day')
            GROUP BY hr ORDER BY hr
        """).fetchall()

        action_breakdown = db.execute(f"""
            SELECT action, COUNT(*) as cnt FROM access_log
            WHERE ts>=datetime('now','-{days} days')
            GROUP BY action ORDER BY cnt DESC
        """).fetchall()

        qual_dist = db.execute("""
            SELECT p.qualification, COUNT(*) as cnt
            FROM profiles p JOIN users u ON u.id=p.user_id
            WHERE u.role='user' GROUP BY p.qualification ORDER BY cnt DESC
        """).fetchall()

        level_dist = db.execute("""
            SELECT preferred_level, COUNT(*) as cnt
            FROM profiles GROUP BY preferred_level ORDER BY cnt DESC
        """).fetchall()

        category_dist = db.execute("""
            SELECT category, COUNT(*) as cnt
            FROM profiles GROUP BY category ORDER BY cnt DESC
        """).fetchall()

    return jsonify({
        "period":               days,
        "registrationsDaily":   [dict(r) for r in reg_daily],
        "accessDaily":          [dict(r) for r in access_daily],
        "uniqueUsersDaily":     [dict(r) for r in unique_daily],
        "hourly24h":            [dict(r) for r in hourly_24h],
        "actionBreakdown":      [dict(r) for r in action_breakdown],
        "qualDist":             [dict(r) for r in qual_dist],
        "levelDist":            [dict(r) for r in level_dist],
        "categoryDist":         [dict(r) for r in category_dist],
    })


# ─── REPORTS ──────────────────────────────────────────────────────────────────
@admin_bp.route("/reports/users", methods=["GET"])
@require_admin
def report_users(current_admin):
    fmt = request.args.get("format", "csv")
    with _db() as db:
        rows = db.execute(
            "SELECT id,name,email,status,created_at FROM users WHERE role='user' ORDER BY created_at DESC"
        ).fetchall()
    data = [dict(r) for r in rows]

    if fmt == "json":
        resp = make_response(json.dumps(
            {"generated_at": datetime.utcnow().isoformat(), "total": len(data), "users": data}, indent=2
        ))
        resp.headers["Content-Type"] = "application/json"
        resp.headers["Content-Disposition"] = "attachment; filename=easyhire_users.json"
        return resp

    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=["id","name","email","status","created_at"])
    w.writeheader(); w.writerows(data)
    resp = make_response(out.getvalue())
    resp.headers["Content-Type"] = "text/csv"
    resp.headers["Content-Disposition"] = "attachment; filename=easyhire_users.csv"
    return resp


@admin_bp.route("/reports/activity", methods=["GET"])
@require_admin
def report_activity(current_admin):
    fmt  = request.args.get("format", "csv")
    days = int(request.args.get("days", 30))
    with _db() as db:
        rows = db.execute(
            f"SELECT a.id,a.user_id,u.name as user_name,a.action,a.path,a.ip,a.ts "
            f"FROM access_log a LEFT JOIN users u ON u.id=a.user_id "
            f"WHERE a.ts>=datetime('now','-{days} days') ORDER BY a.ts DESC"
        ).fetchall()
    data = [dict(r) for r in rows]

    if fmt == "json":
        resp = make_response(json.dumps(
            {"generated_at": datetime.utcnow().isoformat(), "period_days": days, "total": len(data), "records": data}, indent=2
        ))
        resp.headers["Content-Type"] = "application/json"
        resp.headers["Content-Disposition"] = "attachment; filename=easyhire_activity.json"
        return resp

    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=["id","user_id","user_name","action","path","ip","ts"])
    w.writeheader(); w.writerows(data)
    resp = make_response(out.getvalue())
    resp.headers["Content-Type"] = "text/csv"
    resp.headers["Content-Disposition"] = "attachment; filename=easyhire_activity.csv"
    return resp


@admin_bp.route("/reports/summary", methods=["GET"])
@require_admin
def report_summary(current_admin):
    fmt = request.args.get("format", "json")
    with _db() as db:
        tu  = db.execute("SELECT COUNT(*) FROM users WHERE role='user'").fetchone()[0]
        au  = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND status='active'").fetchone()[0]
        bu  = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND status='blocked'").fetchone()[0]
        n7  = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND created_at>=datetime('now','-7 days')").fetchone()[0]
        n30 = db.execute("SELECT COUNT(*) FROM users WHERE role='user' AND created_at>=datetime('now','-30 days')").fetchone()[0]
        tj  = db.execute("SELECT COUNT(*) FROM admin_jobs").fetchone()[0]
        tn  = db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
        ta  = db.execute("SELECT COUNT(*) FROM access_log").fetchone()[0]
        a7  = db.execute("SELECT COUNT(*) FROM access_log WHERE ts>=datetime('now','-7 days')").fetchone()[0]
        ase = db.execute("SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at>datetime('now')").fetchone()[0]

    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "users":         {"total": tu, "active": au, "blocked": bu, "new_7d": n7, "new_30d": n30},
        "jobs":          {"total": tj},
        "notifications": {"total": tn},
        "activity":      {"total_events": ta, "events_7d": a7, "active_sessions": ase},
        "settings":      {"scrape_interval_hours": get_setting("scrape_interval_hours","6"), "last_scrape_at": get_setting("last_scrape_at","")},
    }

    if fmt == "csv":
        out = io.StringIO()
        out.write(f"EasyHire Summary Report\nGenerated at,{summary['generated_at']}\n\nMetric,Value\n")
        for k,v in [("Total Users",tu),("Active",au),("Blocked",bu),("New 7d",n7),("New 30d",n30),
                    ("Admin Jobs",tj),("Notifications",tn),("Total Access Events",ta),
                    ("Access Events 7d",a7),("Active Sessions",ase)]:
            out.write(f"{k},{v}\n")
        resp = make_response(out.getvalue())
        resp.headers["Content-Type"] = "text/csv"
        resp.headers["Content-Disposition"] = "attachment; filename=easyhire_summary.csv"
        return resp

    resp = make_response(json.dumps(summary, indent=2))
    resp.headers["Content-Type"] = "application/json"
    resp.headers["Content-Disposition"] = "attachment; filename=easyhire_summary.json"
    return resp


# ─── USER MANAGEMENT ──────────────────────────────────────────────────────────
@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users(current_admin):
    search = request.args.get("q","").strip()
    sf     = request.args.get("status","")
    q      = "SELECT id,name,email,status,created_at FROM users WHERE role='user'"
    params = []
    if search:
        q += " AND (name LIKE ? OR email LIKE ?)"; params += [f"%{search}%",f"%{search}%"]
    if sf:
        q += " AND status=?"; params.append(sf)
    q += " ORDER BY created_at DESC"
    with _db() as db:
        rows = db.execute(q, params).fetchall()
    return jsonify({"users": [dict(r) for r in rows], "total": len(rows)})


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@require_admin
def get_user(current_admin, user_id):
    with _db() as db:
        user = db.execute(
            "SELECT id,name,email,status,created_at FROM users WHERE id=? AND role='user'", (user_id,)
        ).fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
        profile  = db.execute("SELECT * FROM profiles WHERE user_id=?", (user_id,)).fetchone()
        saved    = db.execute("SELECT exam_id,exam_name,saved_at FROM saved_exams WHERE user_id=? ORDER BY saved_at DESC", (user_id,)).fetchall()
        activity = db.execute("SELECT action,path,ts FROM access_log WHERE user_id=? ORDER BY ts DESC LIMIT 10", (user_id,)).fetchall()
    return jsonify({
        "user":           dict(user),
        "profile":        dict(profile) if profile else None,
        "saved":          [dict(s) for s in saved],
        "recentActivity": [dict(a) for a in activity],
    })


@admin_bp.route("/users/<int:user_id>/status", methods=["PATCH"])
@require_admin
def update_user_status(current_admin, user_id):
    data   = request.get_json() or {}
    status = data.get("status","").strip()
    if status not in ("active","blocked","pending"):
        return jsonify({"error": "status must be active | blocked | pending"}), 400
    with sqlite3.connect(DB_PATH) as db:
        db.execute("UPDATE users SET status=? WHERE id=? AND role='user'", (status, user_id))
    return jsonify({"message": f"User {user_id} set to '{status}'"})


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(current_admin, user_id):
    with sqlite3.connect(DB_PATH) as db:
        for tbl in ("saved_exams","profiles","sessions","access_log"):
            db.execute(f"DELETE FROM {tbl} WHERE user_id=?", (user_id,))
        db.execute("DELETE FROM users WHERE id=? AND role='user'", (user_id,))
    return jsonify({"message": f"User {user_id} deleted"})


# ─── JOB / EXAM MANAGEMENT ────────────────────────────────────────────────────
@admin_bp.route("/jobs", methods=["GET"])
@require_admin
def list_jobs(current_admin):
    with _db() as db:
        rows = db.execute("SELECT * FROM admin_jobs ORDER BY created_at DESC").fetchall()
    return jsonify({"jobs": [dict(r) for r in rows], "total": len(rows)})


@admin_bp.route("/jobs", methods=["POST"])
@require_admin
def create_job(current_admin):
    data  = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    with sqlite3.connect(DB_PATH) as db:
        cur = db.execute(
            """INSERT INTO admin_jobs
               (title,body,category,level,min_age,max_age,qualification,
                vacancies,salary,official_link,application_start,application_end,exam_date)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (title, data.get("body",""), data.get("category","Other"), data.get("level","Central"),
             int(data.get("minAge",18)), int(data.get("maxAge",35)), data.get("qualification","Any"),
             int(data.get("vacancies",0)), data.get("salary",""), data.get("officialLink",""),
             data.get("applicationStart",""), data.get("applicationEnd",""), data.get("examDate","")),
        )
    return jsonify({"message": "Job created", "id": cur.lastrowid}), 201


@admin_bp.route("/jobs/<int:job_id>", methods=["PUT"])
@require_admin
def update_job(current_admin, job_id):
    data = request.get_json() or {}
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """UPDATE admin_jobs SET title=?,body=?,category=?,level=?,min_age=?,max_age=?,
               qualification=?,vacancies=?,salary=?,official_link=?,
               application_start=?,application_end=?,exam_date=?,updated_at=datetime('now')
               WHERE id=?""",
            (data.get("title",""), data.get("body",""), data.get("category","Other"),
             data.get("level","Central"), int(data.get("minAge",18)), int(data.get("maxAge",35)),
             data.get("qualification","Any"), int(data.get("vacancies",0)), data.get("salary",""),
             data.get("officialLink",""), data.get("applicationStart",""),
             data.get("applicationEnd",""), data.get("examDate",""), job_id),
        )
    return jsonify({"message": "Job updated"})


@admin_bp.route("/jobs/<int:job_id>", methods=["DELETE"])
@require_admin
def delete_job(current_admin, job_id):
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM admin_jobs WHERE id=?", (job_id,))
    return jsonify({"message": "Job deleted"})


# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
@admin_bp.route("/notifications", methods=["GET"])
@require_admin
def list_notifications(current_admin):
    with _db() as db:
        rows = db.execute("SELECT * FROM notifications ORDER BY sent_at DESC LIMIT 50").fetchall()
    return jsonify({"notifications": [dict(r) for r in rows]})


@admin_bp.route("/notifications", methods=["POST"])
@require_admin
def send_notification(current_admin):
    data    = request.get_json() or {}
    title   = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    target  = data.get("target","all")
    if not title or not message:
        return jsonify({"error": "title and message are required"}), 400
    with sqlite3.connect(DB_PATH) as db:
        cur = db.execute(
            "INSERT INTO notifications (title,message,target,admin_id) VALUES (?,?,?,?)",
            (title, message, str(target), current_admin["id"]),
        )
    return jsonify({"message": "Notification sent", "id": cur.lastrowid}), 201


@admin_bp.route("/notifications/<int:notif_id>", methods=["DELETE"])
@require_admin
def delete_notification(current_admin, notif_id):
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM notifications WHERE id=?", (notif_id,))
    return jsonify({"message": "Notification deleted"})


# ─── USER-FACING NOTIFICATIONS ────────────────────────────────────────────────
def get_user_notifications(user_id):
    with _db() as db:
        rows = db.execute(
            "SELECT id,title,message,sent_at FROM notifications "
            "WHERE target='all' OR target=? ORDER BY sent_at DESC LIMIT 20",
            (str(user_id),),
        ).fetchall()
    return [dict(r) for r in rows]
