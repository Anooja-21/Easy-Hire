import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:5001/api";

const TOPICS = [
  { id: "quant",     label: "Quantitative",  icon: "📐" },
  { id: "reasoning", label: "Reasoning",     icon: "🧠" },
  { id: "english",   label: "English",       icon: "📝" },
  { id: "gk",        label: "General KG",    icon: "🌍" },
  { id: "computer",  label: "Computer",      icon: "💻" },
];

const SUGGESTIONS = [
  "Give me a quant question",
  "Reasoning practice",
  "English vocabulary question",
  "GK question",
  "Computer awareness MCQ",
  "SI formula",
  "Mock test quant",
  "What is GDP?",
];

function uid() { return Math.random().toString(36).slice(2); }

function TopicBadge({ topic }) {
  const colors = {
    quant:     { bg: "#EEF2FF", color: "#4338CA" },
    reasoning: { bg: "#FFF7ED", color: "#C2410C" },
    english:   { bg: "#F0FDF4", color: "#166534" },
    gk:        { bg: "#EFF6FF", color: "#1D4ED8" },
    computer:  { bg: "#FDF4FF", color: "#7E22CE" },
  };
  const s = colors[topic] || { bg: "#F3F4F6", color: "#374151" };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{topic}</span>
  );
}

function DiffBadge({ diff }) {
  const colors = { easy: "#16a34a", medium: "#d97706", hard: "#dc2626" };
  return (
    <span style={{ fontSize: 11, color: colors[diff] || "#6b7280", fontWeight: 600 }}>
      {diff ? diff.toUpperCase() : ""}
    </span>
  );
}

function BotText({ text }) {
  return (
    <div style={{
      background: "#F9FAFB", border: "0.5px solid #E5E7EB",
      borderRadius: "16px 16px 16px 4px",
      padding: "12px 16px", maxWidth: "80%",
      fontSize: 14, lineHeight: 1.6, color: "#111827",
      whiteSpace: "pre-wrap",
    }}>{text}</div>
  );
}

function UserBubble({ text }) {
  return (
    <div style={{
      background: "#4F46E5", color: "#fff",
      borderRadius: "16px 16px 4px 16px",
      padding: "12px 16px", maxWidth: "75%",
      fontSize: 14, lineHeight: 1.6, alignSelf: "flex-end",
    }}>{text}</div>
  );
}

function QuestionCard({ msg, onAnswer }) {
  const [chosen, setChosen] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function selectOption(letter) {
    if (chosen) return;
    setChosen(letter);
    setLoading(true);
    try {
      const res = await fetch(`${API}/check-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: msg.id, answer: letter }),
      });
      const data = await res.json();
      setResult(data);
      onAnswer && onAnswer(data);
    } catch (e) {
      setResult({ is_correct: null, explanation: "Error checking answer." });
    }
    setLoading(false);
  }

  const optColors = (letter) => {
    if (!result) return chosen === letter ? "#EEF2FF" : "#fff";
    if (letter === result.correct) return "#F0FDF4";
    if (letter === chosen && !result.is_correct) return "#FEF2F2";
    return "#fff";
  };
  const optBorder = (letter) => {
    if (!result) return chosen === letter ? "#6366F1" : "#E5E7EB";
    if (letter === result.correct) return "#22C55E";
    if (letter === chosen && !result.is_correct) return "#EF4444";
    return "#E5E7EB";
  };
  const optIcon = (letter) => {
    if (!result) return null;
    if (letter === result.correct) return "✓";
    if (letter === chosen && !result.is_correct) return "✗";
    return null;
  };

  return (
    <div style={{
      background: "#fff", border: "0.5px solid #E5E7EB",
      borderRadius: 16, padding: 18, maxWidth: "85%",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <TopicBadge topic={msg.topic} />
        <DiffBadge diff={msg.difficulty} />
        {msg.subtopic && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{msg.subtopic}</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", marginBottom: 14, lineHeight: 1.6 }}>
        {msg.question}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(msg.options).map(([letter, text]) => (
          <button key={letter} onClick={() => selectOption(letter)} disabled={!!chosen}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10,
              border: `1.5px solid ${optBorder(letter)}`,
              background: optColors(letter),
              cursor: chosen ? "default" : "pointer",
              textAlign: "left", fontSize: 13, transition: "all 0.15s",
            }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: optBorder(letter) === "#E5E7EB" ? "#F3F4F6" : optBorder(letter),
              color: optBorder(letter) === "#E5E7EB" ? "#6B7280" : "#fff",
              fontSize: 12, fontWeight: 700,
            }}>
              {optIcon(letter) || letter}
            </span>
            <span style={{ color: "#374151", flex: 1 }}>{text}</span>
          </button>
        ))}
      </div>
      {loading && <div style={{ marginTop: 12, fontSize: 13, color: "#6B7280" }}>Checking…</div>}
      {result && (
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 10,
          background: result.is_correct ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${result.is_correct ? "#BBF7D0" : "#FECACA"}`,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: result.is_correct ? "#15803D" : "#DC2626" }}>
            {result.is_correct ? "✓ Correct!" : `✗ Wrong — Answer is (${result.correct}) ${result.correct_text}`}
          </div>
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{result.explanation}</div>
        </div>
      )}
    </div>
  );
}

function MockTestCard({ msg, onComplete }) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);

  const qs = msg.questions;
  const q = qs[current];

  async function selectOption(letter) {
    if (answers[current] !== undefined) return;
    const newAnswers = { ...answers, [current]: letter };
    setAnswers(newAnswers);
    setChecking(true);
    try {
      const res = await fetch(`${API}/check-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id, answer: letter }),
      });
      const data = await res.json();
      const newResults = [...results, data];
      setResults(newResults);
      if (current + 1 >= qs.length) {
        const sc = newResults.filter(r => r.is_correct).length;
        setScore(sc);
        setDone(true);
        onComplete && onComplete(sc, qs.length);
      }
    } catch (e) {}
    setChecking(false);
  }

  function next() { if (current < qs.length - 1) setCurrent(c => c + 1); }

  if (done) {
    const pct = Math.round((score / qs.length) * 100);
    const grade = pct >= 80 ? "Excellent!" : pct >= 60 ? "Good effort!" : pct >= 40 ? "Keep practising!" : "Needs more study!";
    const gradeColor = pct >= 80 ? "#16A34A" : pct >= 60 ? "#D97706" : pct >= 40 ? "#EA580C" : "#DC2626";
    return (
      <div style={{ background: "#fff", border: "0.5px solid #E5E7EB", borderRadius: 16, padding: 24, maxWidth: "85%" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏁</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>Mock Test Complete!</div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{msg.topic.toUpperCase()} Quiz</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Score", value: `${score}/${qs.length}`, color: gradeColor },
            { label: "Correct", value: score, color: "#16A34A" },
            { label: "Wrong", value: qs.length - score, color: "#DC2626" },
          ].map(s => (
            <div key={s.label} style={{ background: "#F9FAFB", borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, color: gradeColor, marginBottom: 8 }}>{grade}</div>
        <div style={{ background: "#F3F4F6", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "#374151", textAlign: "center" }}>
          Percentage: {pct}%
        </div>
      </div>
    );
  }

  const res = results[current];
  const optColors = (letter) => {
    if (!res) return answers[current] === letter ? "#EEF2FF" : "#fff";
    if (letter === res.correct) return "#F0FDF4";
    if (letter === answers[current] && !res.is_correct) return "#FEF2F2";
    return "#fff";
  };
  const optBorder = (letter) => {
    if (!res) return answers[current] === letter ? "#6366F1" : "#E5E7EB";
    if (letter === res.correct) return "#22C55E";
    if (letter === answers[current] && !res.is_correct) return "#EF4444";
    return "#E5E7EB";
  };

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E5E7EB", borderRadius: 16, padding: 18, maxWidth: "85%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <TopicBadge topic={msg.topic} />
        <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 500 }}>{current + 1} / {qs.length}</span>
        <div style={{ display: "flex", gap: 3 }}>
          {qs.map((_, i) => (
            <div key={i} style={{
              width: 20, height: 4, borderRadius: 2,
              background: i < results.length ? (results[i]?.is_correct ? "#22C55E" : "#EF4444") : i === current ? "#6366F1" : "#E5E7EB",
            }} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", marginBottom: 14, lineHeight: 1.6 }}>{q.question}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {["A","B","C","D"].map(letter => (
          <button key={letter} onClick={() => selectOption(letter)} disabled={answers[current] !== undefined}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10,
              border: `1.5px solid ${optBorder(letter)}`,
              background: optColors(letter),
              cursor: answers[current] !== undefined ? "default" : "pointer",
              textAlign: "left", fontSize: 13,
            }}>
            <span style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0, fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#F3F4F6", color: "#374151",
            }}>{letter}</span>
            <span style={{ color: "#374151" }}>{q["option_" + letter.toLowerCase()]}</span>
          </button>
        ))}
      </div>
      {checking && <div style={{ marginTop: 10, fontSize: 13, color: "#6B7280" }}>Checking…</div>}
      {res && (
        <div style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 10,
          background: res.is_correct ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${res.is_correct ? "#BBF7D0" : "#FECACA"}`,
          fontSize: 13,
        }}>
          <span style={{ fontWeight: 600, color: res.is_correct ? "#15803D" : "#DC2626" }}>
            {res.is_correct ? "✓ Correct! " : `✗ Answer: (${res.correct}) ${res.correct_text}. `}
          </span>
          <span style={{ color: "#374151" }}>{res.explanation}</span>
        </div>
      )}
      {answers[current] !== undefined && current < qs.length - 1 && (
        <button onClick={next} style={{
          marginTop: 14, width: "100%", padding: "10px", borderRadius: 10,
          background: "#4F46E5", color: "#fff", border: "none", cursor: "pointer",
          fontSize: 14, fontWeight: 600,
        }}>Next Question →</button>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "14px 16px", background: "#F9FAFB", borderRadius: "16px 16px 16px 4px", maxWidth: 70 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%", background: "#9CA3AF",
          animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  );
}

// ── Main Chatbot ──────────────────────────────────────────────────────────────

export default function StudyChatbot() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [lastQId, setLastQId]     = useState(null);
  const [mockActive, setMockActive] = useState(false);
  const [ollamaOk, setOllamaOk]   = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  // ✅ FIX: ref always mirrors the latest input value — never stale in event handlers
  const inputValRef = useRef("");

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        id: uid(), from: "bot", type: "welcome",
        text: "👋 Hi! I am your **EasyHire Study Assistant**.\n\nI can help you practice for government exams — UPSC, SSC, IBPS, Kerala PSC, Railway and more!\n\nChoose a topic below or type your question:",
      }]);
      fetch(`${API}/health`).then(r => r.json()).then(d => setOllamaOk(d.ollama)).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: uid(), ...msg }]);
  }, []);

  // ✅ FIX: keep ref in sync with every keystroke
  function handleInputChange(e) {
    setInput(e.target.value);
    inputValRef.current = e.target.value;
  }

  // ✅ FIX: read from ref when called by button/Enter (avoids stale closure)
  async function sendMessage(textOverride) {
    const msg = textOverride !== undefined
      ? String(textOverride).trim()
      : inputValRef.current.trim();

    if (!msg || loading) return;

    // Clear both state and ref immediately
    setInput("");
    inputValRef.current = "";

    addMessage({ from: "user", type: "text", text: msg });
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();

      if (data.type === "question") {
        setLastQId(data.id);
        addMessage({ from: "bot", type: "question", ...data });
      } else if (data.type === "mock_test") {
        setMockActive(true);
        addMessage({ from: "bot", type: "mock_test", ...data });
      } else if (data.type === "fact" || data.type === "ai" || data.type === "fallback") {
        addMessage({ from: "bot", type: "text", text: data.message });
      } else if (data.type === "answer_prompt") {
        addMessage({ from: "bot", type: "text", text: data.message });
      } else {
        addMessage({ from: "bot", type: "text", text: data.message || "I didn't understand that. Try asking for a practice question!" });
      }
    } catch (e) {
      addMessage({ from: "bot", type: "text", text: "Connection error — make sure the chatbot server is running on port 5001." });
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const unreadCount = messages.filter(m => m.from === "bot" && !m.seen).length;

  return (
    <>
      {/* Floating button */}
      <button onClick={() => setOpen(o => !o)} style={{
        position: "fixed", bottom: 90, right: 28, zIndex: 9999,
        width: 58, height: 58, borderRadius: "50%",
        background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
        border: "none", cursor: "pointer", fontSize: 24,
        boxShadow: "0 4px 20px rgba(79,70,229,0.4)",
      }}>
        {open ? "✕" : "📚"}
        {!open && unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, width: 18, height: 18,
            borderRadius: "50%", background: "#EF4444", color: "#fff",
            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 160, right: 28, zIndex: 9998,
          width: 420, height: "min(600px, calc(100vh - 180px))",
          background: "#fff", borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          overflow: "hidden",
          border: "0.5px solid #E5E7EB",
        }}>

          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
            padding: "16px 18px", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>📚</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Study Assistant</div>

            </div>
          </div>

          {/* Topic quick buttons */}
          <div style={{
            display: "flex", gap: 6, padding: "10px 14px",
            borderBottom: "0.5px solid #F3F4F6", overflowX: "auto",
            scrollbarWidth: "none",
          }}>
            {TOPICS.map(t => (
              <button key={t.id} onClick={() => sendMessage(`Give me a ${t.label} question`)}
                style={{
                  whiteSpace: "nowrap", border: "0.5px solid #E5E7EB",
                  borderRadius: 20, padding: "5px 12px", fontSize: 12,
                  background: "#fff", cursor: "pointer",
                  color: "#374151", display: "flex", alignItems: "center", gap: 4,
                }}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
            <button onClick={() => sendMessage("mock test quant")}
              style={{
                whiteSpace: "nowrap", border: "0.5px solid #E5E7EB",
                borderRadius: 20, padding: "5px 12px", fontSize: 12,
                background: "#4F46E5", cursor: "pointer", color: "#fff",
              }}>
              🏁 Mock Test
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: "flex", flexDirection: "column",
                alignItems: msg.from === "user" ? "flex-end" : "flex-start",
              }}>
                {msg.from === "user" ? (
                  <UserBubble text={msg.text} />
                ) : msg.type === "question" ? (
                  <QuestionCard msg={msg} onAnswer={() => {}} />
                ) : msg.type === "mock_test" ? (
                  <MockTestCard msg={msg} onComplete={() => setMockActive(false)} />
                ) : (
                  <BotText text={msg.text} />
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TypingIndicator />
              </div>
            )}

            {/* Suggestion chips (only at start) */}
            {messages.length === 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    style={{
                      border: "0.5px solid #E5E7EB", borderRadius: 20,
                      padding: "5px 12px", fontSize: 12,
                      background: "#F9FAFB", cursor: "pointer", color: "#4F46E5",
                    }}>{s}</button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>



        </div>
      )}
    </>
  );
}
