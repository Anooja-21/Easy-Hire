"""
EasyHire Study Chatbot Backend
-------------------------------
Run:
    pip install flask flask-cors requests
    python chatbot_server.py

Optional (for AI fallback):
    Install Ollama from https://ollama.com
    ollama pull llama3
"""

import json
import re
import random
import sqlite3
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = "questions.db"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:4b"


# ─── DATABASE SETUP ───────────────────────────────────────────────────────────

def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS questions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                topic       TEXT NOT NULL,
                subtopic    TEXT,
                question    TEXT NOT NULL,
                option_a    TEXT NOT NULL,
                option_b    TEXT NOT NULL,
                option_c    TEXT NOT NULL,
                option_d    TEXT NOT NULL,
                answer      TEXT NOT NULL,
                explanation TEXT NOT NULL,
                difficulty  TEXT DEFAULT 'medium'
            );

            CREATE TABLE IF NOT EXISTS facts (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                topic   TEXT NOT NULL,
                keyword TEXT NOT NULL,
                content TEXT NOT NULL
            );
        """)
        if db.execute("SELECT COUNT(*) FROM questions").fetchone()[0] == 0:
            seed_questions(db)
        if db.execute("SELECT COUNT(*) FROM facts").fetchone()[0] == 0:
            seed_facts(db)
    print("Database ready.")


def seed_questions(db):
    qs = [
        # ── QUANTITATIVE APTITUDE ──
        ("quant","percentage","If 20% of a number is 50, what is the number?","200","250","300","150","B","20% of X = 50 → X = 50÷0.20 = 250.","easy"),
        ("quant","percentage","A shirt costs ₹800. After a 15% discount, what is the final price?","₹680","₹700","₹720","₹660","A","Discount = 15% of 800 = ₹120. Final = 800−120 = ₹680.","easy"),
        ("quant","percentage","What percentage is 75 of 300?","20%","25%","30%","15%","B","(75÷300)×100 = 25%.","easy"),
        ("quant","profit_loss","A trader buys an item for ₹500 and sells it for ₹600. Find the profit%.","15%","20%","25%","10%","B","Profit = 100. Profit% = (100÷500)×100 = 20%.","easy"),
        ("quant","profit_loss","If SP = ₹780 and loss% = 10%, find the CP.","₹850","₹860","₹870","₹880","B","CP = SP÷(1−loss%) = 780÷0.9 = ₹866.67 ≈ ₹860 (nearest).","medium"),
        ("quant","simple_interest","Find SI on ₹5000 at 8% per annum for 3 years.","₹1100","₹1200","₹1300","₹1400","B","SI = (P×R×T)÷100 = (5000×8×3)÷100 = ₹1200.","easy"),
        ("quant","simple_interest","At what rate will ₹2000 double itself in 10 years (SI)?","8%","10%","12%","15%","B","SI = 2000. (2000×R×10)÷100 = 2000 → R = 10%.","medium"),
        ("quant","time_work","A can do a work in 10 days, B in 15 days. Together they finish in?","5 days","6 days","7 days","8 days","B","Combined rate = 1/10+1/15 = 5/30 = 1/6. Time = 6 days.","medium"),
        ("quant","number_series","2, 6, 12, 20, 30, ?","40","42","44","48","B","Differences: 4,6,8,10,12 → next = 30+12 = 42.","medium"),
        ("quant","number_series","1, 4, 9, 16, 25, ?","36","34","38","40","A","Perfect squares: 1²,2²,3²,4²,5²,6² = 36.","easy"),
        ("quant","ratio","If A:B = 3:4 and B:C = 5:6, find A:C.","5:8","15:24","3:6","5:6","A","A:C = (3×5):(4×6) = 15:24 = 5:8.","medium"),
        ("quant","average","Average of 5 numbers is 20. If one number is removed, average becomes 18. Find the removed number.","28","26","24","30","A","Sum = 100. New sum = 18×4 = 72. Removed = 100−72 = 28.","medium"),

        # ── REASONING ──
        ("reasoning","coding_decoding","If CAT = 3120, then DOG = ?","41521","41523","41527","41520","A","C=3,A=1,T=20 → 3+1+20=24? Actually: position×position: C=3,A=1,T=20 → D=4,O=15,G=7 → 4+15+21=? Pattern: D(4)×O(15)×G(7)=420. Choose option: 41521 represents D=4,O=15,G=7 → 4,15,2,1 → 41521.","hard"),
        ("reasoning","coding_decoding","In a code, APPLE is written as BQQMF. How is MANGO coded?","NBOHO","NBOHP","NBNHP","OCOHP","B","Each letter is shifted +1: M→N, A→B, N→O, G→H, O→P → NBOHP.","easy"),
        ("reasoning","blood_relation","A is B's father. C is A's sister. D is C's mother. How is D related to B?","Aunt","Grandmother","Mother","Sister","B","A is father of B. C is A's sister. D is C's mother → D is A's mother → D is B's grandmother.","medium"),
        ("reasoning","direction","Ram walks 10m North, turns right and walks 5m, then turns right and walks 10m. How far is he from start?","5m","10m","15m","0m","A","He ends up 5m East of start. Distance = 5m.","easy"),
        ("reasoning","direction","A person faces East. He turns 90° clockwise, then 180° anticlockwise. Which direction does he face now?","North","South","East","West","A","East → 90° clockwise = South → 180° anticlockwise = North.","medium"),
        ("reasoning","series","AZ, BY, CX, DW, ?","EV","EU","FV","EW","A","First letters: A,B,C,D,E. Second letters: Z,Y,X,W,V → EV.","easy"),
        ("reasoning","analogy","Book : Library :: Painting : ?","Gallery","Museum","Artist","Canvas","A","A library stores books; a gallery stores paintings.","easy"),
        ("reasoning","syllogism","All cats are animals. All animals are living. Conclusion: All cats are living.","True","False","Uncertain","Cannot say","A","By transitive property: cats → animals → living. So all cats are living. True.","easy"),
        ("reasoning","puzzle","5 people sit in a row. A is to the left of B but right of C. D is to the right of B. E is between A and B. Who is in the middle?","A","B","C","E","D","Order: C,A,E,B,D → Middle (3rd position) = E.","hard"),

        # ── ENGLISH ──
        ("english","synonyms","Synonym of DILIGENT","Lazy","Hardworking","Careless","Reckless","B","Diligent means showing care and effort; hardworking is the closest synonym.","easy"),
        ("english","synonyms","Synonym of ELOQUENT","Silent","Fluent & expressive","Rude","Confused","B","Eloquent means well-spoken and expressive.","easy"),
        ("english","antonyms","Antonym of TRANSPARENT","Clear","Obvious","Opaque","Bright","C","Transparent means see-through; opaque means the opposite.","easy"),
        ("english","antonyms","Antonym of COURAGE","Bravery","Fear","Boldness","Strength","B","Courage means bravery; its antonym is fear/cowardice.","easy"),
        ("english","grammar","Which sentence is grammatically correct?","She don't like tea.","She doesn't likes tea.","She doesn't like tea.","She not like tea.","C","With 'she', use 'doesn't' + base form: 'She doesn't like tea.'","easy"),
        ("english","grammar","Choose the correct passive voice: 'She wrote a letter.'","A letter was written by her.","A letter is written by her.","A letter were written by her.","A letter had written by her.","A","Past tense passive: was/were + past participle + by + subject.","medium"),
        ("english","fill_blanks","He is __ honest man.","a","an","the","no article","B","Before a vowel sound (honest starts with 'o' sound), use 'an'.","easy"),
        ("english","idioms","'Bite the bullet' means:","To eat fast","To endure pain bravely","To attack someone","To give up","B","'Bite the bullet' means to endure a painful situation with courage.","medium"),

        # ── GENERAL KNOWLEDGE ──
        ("gk","history","Who gave the slogan 'Do or Die'?","B.R. Ambedkar","Jawaharlal Nehru","Mahatma Gandhi","Subhas Chandra Bose","C","Mahatma Gandhi gave 'Do or Die' during the Quit India Movement in 1942.","easy"),
        ("gk","history","The Dandi March took place in which year?","1920","1930","1942","1947","B","The Dandi March (Salt Satyagraha) was conducted by Gandhi in 1930.","easy"),
        ("gk","geography","Which is the tallest mountain peak in the world?","K2","Kangchenjunga","Mount Everest","Lhotse","C","Mount Everest (8,848.86m) is the world's highest peak.","easy"),
        ("gk","polity","How many Fundamental Rights are guaranteed by the Indian Constitution?","5","6","7","8","B","The Indian Constitution guarantees 6 Fundamental Rights.","easy"),
        ("gk","polity","Who has the power to dissolve the Lok Sabha?","Prime Minister","President","Speaker","Chief Justice","B","The President dissolves the Lok Sabha on the advice of the Prime Minister.","medium"),
        ("gk","science","What is the chemical symbol for Gold?","Ag","Au","Gd","Go","B","Au comes from the Latin word 'Aurum' meaning Gold.","easy"),
        ("gk","science","The speed of sound in air is approximately?","340 m/s","300 m/s","3×10⁸ m/s","1500 m/s","A","Speed of sound in air at 20°C is approximately 343 m/s.","easy"),
        ("gk","economy","GDP stands for?","Gross Domestic Product","General Development Plan","Gross Daily Production","Government Development Policy","A","GDP = Gross Domestic Product — total value of goods and services produced in a country.","easy"),
        ("gk","current_affairs","ISRO stands for?","Indian Space Research Organisation","Indian Science Research Organisation","International Space Research Organisation","Indian Satellite Research Office","A","ISRO — Indian Space Research Organisation — is India's national space agency.","easy"),

        # ── COMPUTER AWARENESS ──
        ("computer","basics","CPU stands for?","Central Processing Unit","Computer Processing Unit","Central Program Unit","Central Processor Utility","A","CPU = Central Processing Unit, the brain of a computer.","easy"),
        ("computer","basics","Which of the following is an input device?","Monitor","Printer","Keyboard","Speaker","C","Keyboard is used to input data into the computer.","easy"),
        ("computer","basics","The full form of RAM is?","Random Access Memory","Read Access Memory","Random Application Memory","Read Application Module","A","RAM = Random Access Memory — temporary storage used by the CPU.","easy"),
        ("computer","internet","HTTP stands for?","HyperText Transfer Protocol","High Text Transfer Protocol","HyperText Transmission Process","High Transfer Text Protocol","A","HTTP = HyperText Transfer Protocol — foundation of data on the web.","easy"),
        ("computer","internet","Which of the following is NOT a web browser?","Chrome","Firefox","MS Word","Safari","C","MS Word is a word processor, not a web browser.","easy"),
        ("computer","ms_office","In MS Excel, a formula always starts with?","=","#","@","$","A","All Excel formulas begin with the '=' sign.","easy"),
        ("computer","security","Malware is short for?","Malicious Software","Manual Software","Main Software","Multi-layer Software","A","Malware = Malicious Software — designed to harm or exploit systems.","easy"),
    ]

    db.executemany("""
        INSERT INTO questions
          (topic,subtopic,question,option_a,option_b,option_c,option_d,answer,explanation,difficulty)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, qs)
    print(f"Seeded {len(qs)} questions.")


def seed_facts(db):
    facts = [
        ("gk","capital","The capital of India is New Delhi."),
        ("gk","currency","The currency of India is Indian Rupee (INR), symbol ₹."),
        ("gk","president","The President of India is the constitutional head of state."),
        ("gk","parliament","The Indian Parliament consists of Lok Sabha (Lower House) and Rajya Sabha (Upper House)."),
        ("gk","constitution","The Indian Constitution came into effect on 26 January 1950."),
        ("gk","independence","India gained independence on 15 August 1947."),
        ("quant","formula","Simple Interest formula: SI = (P × R × T) / 100"),
        ("quant","formula","Compound Interest formula: CI = P(1 + R/100)^T - P"),
        ("quant","formula","Profit% = (Profit / CP) × 100"),
        ("quant","formula","Loss% = (Loss / CP) × 100"),
        ("quant","formula","Speed = Distance / Time"),
        ("quant","formula","Average = Sum of all values / Number of values"),
        ("english","grammar","Articles: Use 'a' before consonant sounds, 'an' before vowel sounds."),
        ("english","grammar","Tenses: Present (is/are), Past (was/were), Future (will be)."),
        ("computer","shortcut","Ctrl+C = Copy, Ctrl+V = Paste, Ctrl+Z = Undo, Ctrl+S = Save."),
        ("computer","shortcut","Alt+F4 closes the active window. Ctrl+Alt+Del opens Task Manager."),
    ]
    db.executemany("INSERT INTO facts (topic, keyword, content) VALUES (?,?,?)", facts)
    print(f"Seeded {len(facts)} facts.")


# ─── DATABASE HELPERS ─────────────────────────────────────────────────────────

def get_questions_by_topic(topic, limit=5):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT * FROM questions WHERE topic=? ORDER BY RANDOM() LIMIT ?",
            (topic, limit)
        ).fetchall()
    return [dict(r) for r in rows]


def search_question(text):
    keywords = [w for w in re.findall(r'\w+', text.lower()) if len(w) > 3]
    if not keywords:
        return None
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        for kw in keywords:
            row = db.execute(
                "SELECT * FROM questions WHERE LOWER(question) LIKE ? ORDER BY RANDOM() LIMIT 1",
                (f"%{kw}%",)
            ).fetchone()
            if row:
                return dict(row)
    return None


def search_fact(text):
    keywords = [w for w in re.findall(r'\w+', text.lower()) if len(w) > 3]
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        for kw in keywords:
            row = db.execute(
                "SELECT * FROM facts WHERE LOWER(content) LIKE ? OR LOWER(keyword) LIKE ? LIMIT 1",
                (f"%{kw}%", f"%{kw}%")
            ).fetchone()
            if row:
                return dict(row)
    return None


def get_mock_test(topic, count=10):
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT * FROM questions WHERE topic=? ORDER BY RANDOM() LIMIT ?",
            (topic, count)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── OLLAMA (LOCAL AI) ────────────────────────────────────────────────────────

def ask_ollama(prompt):
    try:
        resp = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }, timeout=30)
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
    except Exception as e:
        print(f"Ollama error: {e}")
    return None


def fallback_response(user_msg):
    """Try Ollama first, then give a helpful static response."""
    ollama_prompt = (
        f"You are a helpful assistant for Indian government exam students. "
        f"Answer this question briefly and clearly (max 80 words): {user_msg}"
    )
    ai_answer = ask_ollama(ollama_prompt)
    if ai_answer:
        return {"type": "ai", "message": ai_answer, "source": "ollama"}

    return {
        "type": "fallback",
        "message": (
            "I don't have a specific answer for that in my database. "
            "Here are some tips:\n\n"
            "• Try asking topic-wise: 'give me a quant question' or 'reasoning practice'\n"
            "• Type 'mock test quant' for a full quiz\n"
            "• Ask formula questions like 'SI formula' or 'profit formula'\n\n"
            "Install Ollama (ollama.com) and run 'ollama pull llama3' for full AI support!"
        ),
        "source": "static"
    }


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON required"}), 400

    user_msg = (data.get("message") or "").strip()
    if not user_msg:
        return jsonify({"error": "message required"}), 400

    msg_lower = user_msg.lower()

    # ── MOCK TEST ──
    if "mock test" in msg_lower or "mocktest" in msg_lower:
        topic = None
        for t in ["quant", "reasoning", "english", "gk", "computer"]:
            if t in msg_lower:
                topic = t
                break
        topic = topic or "quant"
        qs = get_mock_test(topic, count=10)
        if not qs:
            return jsonify({"type": "error", "message": "No questions found for that topic."})
        return jsonify({"type": "mock_test", "topic": topic, "questions": qs})

    # ── PRACTICE / GIVE ME QUESTIONS ──
    practice_triggers = ["practice", "give me", "question", "quiz", "mcq", "generate"]
    if any(t in msg_lower for t in practice_triggers):
        topic_map = {
            "quant": ["quant", "quantitative", "math", "maths", "aptitude", "percentage", "profit", "interest"],
            "reasoning": ["reasoning", "logical", "coding", "direction", "blood", "series"],
            "english": ["english", "grammar", "synonym", "antonym", "vocabulary"],
            "gk": ["gk", "general knowledge", "history", "geography", "polity", "science"],
            "computer": ["computer", "it", "technology", "internet", "software"],
        }
        topic = "quant"
        for t, keywords in topic_map.items():
            if any(k in msg_lower for k in keywords):
                topic = t
                break
        qs = get_questions_by_topic(topic, limit=1)
        if qs:
            q = qs[0]
            return jsonify({
                "type": "question",
                "id": q["id"],
                "topic": q["topic"],
                "subtopic": q["subtopic"],
                "question": q["question"],
                "options": {
                    "A": q["option_a"],
                    "B": q["option_b"],
                    "C": q["option_c"],
                    "D": q["option_d"],
                },
                "difficulty": q["difficulty"],
            })

    # ── CHECK ANSWER ──
    answer_match = re.match(r'^(my answer is |answer is |ans |answer )?([abcd])\.?$', msg_lower.strip())
    if answer_match or msg_lower in ["a","b","c","d"]:
        return jsonify({
            "type": "answer_prompt",
            "message": "Please send your answer with the question context like: 'answer A' after I give you a question. Use 'practice quant' to get a question first!"
        })

    # ── FORMULA / FACT LOOKUP ──
    fact_triggers = ["formula", "what is", "define", "explain", "meaning", "stands for", "full form"]
    if any(t in msg_lower for t in fact_triggers):
        fact = search_fact(user_msg)
        if fact:
            return jsonify({"type": "fact", "message": fact["content"]})
        db_q = search_question(user_msg)
        if db_q:
            return jsonify({
                "type": "question",
                "id": db_q["id"],
                "topic": db_q["topic"],
                "subtopic": db_q["subtopic"],
                "question": db_q["question"],
                "options": {
                    "A": db_q["option_a"],
                    "B": db_q["option_b"],
                    "C": db_q["option_c"],
                    "D": db_q["option_d"],
                },
                "difficulty": db_q["difficulty"],
            })

    # ── TOPIC STUDY MODE ──
    topic_triggers = {
        "quant": ["quantitative","aptitude","quant","percentage","profit","interest","ratio","average","number series"],
        "reasoning": ["reasoning","logical reasoning","puzzle","coding decoding","blood relation"],
        "english": ["english","grammar","vocabulary","synonyms","antonyms"],
        "gk": ["general knowledge","gk","history","geography","polity","constitution","science"],
        "computer": ["computer","ms office","internet","hardware","software","network"],
    }
    for topic, keywords in topic_triggers.items():
        if any(k in msg_lower for k in keywords):
            qs = get_questions_by_topic(topic, limit=1)
            if qs:
                q = qs[0]
                return jsonify({
                    "type": "question",
                    "id": q["id"],
                    "topic": q["topic"],
                    "subtopic": q["subtopic"],
                    "question": q["question"],
                    "options": {
                        "A": q["option_a"],
                        "B": q["option_b"],
                        "C": q["option_c"],
                        "D": q["option_d"],
                    },
                    "difficulty": q["difficulty"],
                })

    # ── SEARCH DB THEN AI FALLBACK ──
    db_q = search_question(user_msg)
    if db_q:
        return jsonify({
            "type": "question",
            "id": db_q["id"],
            "topic": db_q["topic"],
            "subtopic": db_q["subtopic"],
            "question": db_q["question"],
            "options": {
                "A": db_q["option_a"],
                "B": db_q["option_b"],
                "C": db_q["option_c"],
                "D": db_q["option_d"],
            },
            "difficulty": db_q["difficulty"],
        })

    fact = search_fact(user_msg)
    if fact:
        return jsonify({"type": "fact", "message": fact["content"]})

    return jsonify(fallback_response(user_msg))


@app.route("/api/check-answer", methods=["POST"])
def check_answer():
    data = request.get_json()
    qid     = data.get("question_id")
    chosen  = (data.get("answer") or "").upper().strip()

    if not qid or not chosen:
        return jsonify({"error": "question_id and answer required"}), 400

    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT * FROM questions WHERE id=?", (qid,)).fetchone()

    if not row:
        return jsonify({"error": "Question not found"}), 404

    q = dict(row)
    correct_letter = q["answer"].upper()
    options = {"A": q["option_a"], "B": q["option_b"], "C": q["option_c"], "D": q["option_d"]}
    is_correct = chosen == correct_letter

    return jsonify({
        "type": "answer_result",
        "is_correct": is_correct,
        "chosen": chosen,
        "chosen_text": options.get(chosen, ""),
        "correct": correct_letter,
        "correct_text": options[correct_letter],
        "explanation": q["explanation"],
        "question": q["question"],
    })


@app.route("/api/topics", methods=["GET"])
def get_topics():
    return jsonify({
        "topics": [
            {"id": "quant",     "label": "Quantitative Aptitude", "icon": "📐"},
            {"id": "reasoning", "label": "Reasoning",             "icon": "🧠"},
            {"id": "english",   "label": "English",               "icon": "📝"},
            {"id": "gk",        "label": "General Knowledge",     "icon": "🌍"},
            {"id": "computer",  "label": "Computer Awareness",    "icon": "💻"},
        ]
    })


@app.route("/api/mock-test", methods=["POST"])
def start_mock_test():
    data    = request.get_json()
    topic   = (data.get("topic") or "quant").lower()
    count   = min(int(data.get("count", 10)), 20)
    qs      = get_mock_test(topic, count)
    return jsonify({"type": "mock_test", "topic": topic, "count": len(qs), "questions": qs})


@app.route("/api/health", methods=["GET"])
def health():
    ollama_ok = False
    try:
        r = requests.get("http://localhost:11434", timeout=2)
        ollama_ok = r.status_code == 200
    except Exception:
        pass
    return jsonify({"status": "ok", "ollama": ollama_ok})


# ─── STARTUP ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("EasyHire Chatbot Server starting on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)
