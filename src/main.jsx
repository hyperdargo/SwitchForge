import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Save,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

const fmt = (n) => new Intl.NumberFormat("en-US").format(n);
const dateFmt = (value) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
const gatewayBase = location.origin;
const auxiliaryTasks = [
  ["vision", "Vision", "Image analysis"],
  ["web_extract", "Web Extract", "Page summarization"],
  ["compression", "Compression", "Context compaction"],
  ["skills_hub", "Skills Hub", "Skill search"],
  ["approval", "Approval", "Smart auto-approve"],
  ["mcp", "MCP", "MCP tool routing"],
  ["title_gen", "Title Gen", "Session titles"],
  ["triage_specifier", "Triage Specifier", "Kanban spec fleshing"],
  ["kanban_decomposer", "Kanban Decomposer", "Task decomposition"],
  ["profile_describer", "Profile Describer", "Auto profile descriptions"],
  ["curator", "Curator", "Skill-usage review"],
];
const session = {
  get: () => localStorage.getItem("dt_session"),
  set: (value) => localStorage.setItem("dt_session", value),
  clear: () => localStorage.removeItem("dt_session"),
};
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}),
      ...options.headers,
    },
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "Something went wrong. Please try again.",
    );
    error.code = data?.error?.code;
    if (error.code === "account_suspended")
      window.dispatchEvent(new CustomEvent("switchforge:suspended"));
    throw error;
  }
  return data;
}

function Brand() {
  return (
    <a className="brand" href="/" title="SwitchForge by DTEmpire home">
      <div className="brand-mark">
        <img src="/dtempire-logo.png" alt="" />
      </div>
      <span>
        Switch<span>Forge</span>
        <small>BY DTEMPIRE</small>
      </span>
    </a>
  );
}

function SuspendedPage({ onLogout }) {
  return (
    <div className="suspended-page">
      <div className="suspended-card">
        <div className="card-icon">
          <ShieldCheck />
        </div>
        <div className="eyebrow">
          <span /> ACCOUNT ACCESS PAUSED
        </div>
        <h1>Your account is suspended</h1>
        <p>
          Access to your SwitchForge dashboard, API keys, and services has been
          paused by an administrator.
        </p>
        <div className="suspended-note">
          <ShieldCheck />
          <span>
            Please contact the SwitchForge administration team and ask them to
            restore your account. Your data and usage history are preserved.
          </span>
        </div>
        <button className="primary-btn" onClick={onLogout}>
          <LogOut />
          Sign out
        </button>
      </div>
    </div>
  );
}

function Auth({ onAuthed, onDocs }) {
  const [mode, setMode] = useState("signup");
  const [step, setStep] = useState("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState("right");
  const [demoMessage, setDemoMessage] = useState("");
  const [demoReply, setDemoReply] = useState(
    "Ask SwitchForge a short question to see the gateway respond.",
  );
  const [demoTier, setDemoTier] = useState("free");
  const [demoLoading, setDemoLoading] = useState(false);
  const curlExample = `curl ${gatewayBase}/v1/chat/completions \\
  -H "Authorization: Bearer $DT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"SwitchForge","tier":"free","messages":[{"role":"user","content":"Hello"}]}'`;
  const switchMode = (next) => {
    setDirection(next === "login" ? "left" : "right");
    setMode(next);
    setStep("form");
    setError("");
  };
  const runDemo = async (e) => {
    e.preventDefault();
    if (!demoMessage.trim() || demoLoading) return;
    setDemoLoading(true);
    setDemoReply("Thinking...");
    try {
      const data = await api("/demo/chat", {
        method: "POST",
        body: JSON.stringify({ message: demoMessage.trim() }),
      });
      setDemoReply(data.reply);
      setDemoTier(data.tier || "free");
    } catch (err) {
      setDemoReply(err.message);
    } finally {
      setDemoLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.toLowerCase().endsWith("@gmail.com"))
      return setError("Please use a valid @gmail.com address.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      if (mode === "login") {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        session.set(data.token);
        onAuthed(data.user);
      } else {
        await api("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        setStep("otp");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const updateOtp = (value, i) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[i] = value;
    setOtp(next);
    if (value) document.getElementById(`otp-${i + 1}`)?.focus();
  };
  const verify = async () => {
    if (otp.join("").length < 6)
      return setError("Enter the complete 6-digit code.");
    setLoading(true);
    setError("");
    try {
      const data = await api("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp: otp.join("") }),
      });
      session.set(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const resend = async () => {
    setLoading(true);
    setError("");
    try {
      await api("/auth/resend", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <nav className="auth-nav">
        <Brand />
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#why">Why SwitchForge</a>
          <button onClick={onDocs}>Documentation</button>
        </div>
        <button className="ghost-btn" onClick={() => switchMode("login")}>
          Sign in
        </button>
      </nav>
      <section className="auth-content">
        <div className="auth-pitch">
          <div className="eyebrow">
            <span /> THE API BUILT FOR BUILDERS
          </div>
          <h1>
            One endpoint.
            <br />
            <em>Limitless intelligence.</em>
          </h1>
          <p>
            Ship intelligent products faster with a unified model API,
            predictable usage, and keys you control.
          </p>
          <div className="feature-row">
            <div>
              <Zap />
              <span>
                <b>Fast by default</b>Low-latency responses
              </span>
            </div>
            <div>
              <ShieldCheck />
              <span>
                <b>Secure by design</b>Scoped, expiring keys
              </span>
            </div>
          </div>
          <div className="code-card">
            <div className="code-head">
              <i />
              <i />
              <i />
              <span>QUICK START</span>
              <button
                title="Copy curl command"
                onClick={() => navigator.clipboard?.writeText(curlExample)}
              >
                <Copy />
              </button>
            </div>
            <pre>
              <span>curl</span> {gatewayBase}/v1/chat/completions \ -H{" "}
              <b>"Authorization: Bearer $DT_API_KEY"</b> \ -d{" "}
              <b>'&#123;"model": "SwitchForge", "tier": "free"&#125;'</b>
            </pre>
          </div>
          <div className="demo-chat">
            <div className="demo-chat-head">
              <span>
                <i />
                LIVE GATEWAY DEMO
              </span>
              <small className={demoTier === "premium" ? "premium-route" : ""}>
                {demoTier.toUpperCase()} ROUTE
              </small>
            </div>
            <div className="demo-response">
              <Sparkles />
              <p>{demoReply}</p>
            </div>
            <form onSubmit={runDemo}>
              <input
                maxLength="240"
                value={demoMessage}
                onChange={(e) => setDemoMessage(e.target.value)}
                placeholder="Ask a short question..."
              />
              <button
                disabled={!demoMessage.trim() || demoLoading}
                title="Send message"
              >
                <ArrowRight />
              </button>
            </form>
          </div>
        </div>
        <div
          className={`auth-card auth-slide-${direction}`}
          key={`${mode}-${step}`}
        >
          {step === "form" ? (
            <>
              <div className="card-icon">
                <KeyRound />
              </div>
              <h2>
                {mode === "signup" ? "Create your account" : "Welcome back"}
              </h2>
              <p>
                {mode === "signup"
                  ? "Start building with SwitchForge in minutes."
                  : "Sign in to manage your API keys."}
              </p>
              <form onSubmit={submit}>
                {mode === "signup" && (
                  <label>
                    Full name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Morgan"
                      required
                    />
                  </label>
                )}
                <label>
                  Gmail address
                  <div className="input-wrap">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      required
                    />
                    <span>@gmail only</span>
                  </div>
                </label>
                <label>
                  Password
                  <div className="input-wrap">
                    <input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                    />
                    <button type="button" onClick={() => setShow(!show)}>
                      {show ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </label>
                {error && <div className="form-error">{error}</div>}
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait..."
                    : mode === "signup"
                      ? "Create account"
                      : "Sign in"}
                  <ArrowRight />
                </button>
              </form>
              <div className="switch-auth">
                {mode === "signup"
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  onClick={() =>
                    switchMode(mode === "signup" ? "login" : "signup")
                  }
                >
                  {mode === "signup" ? "Sign in" : "Create one"}
                </button>
              </div>
              <small>
                By continuing, you agree to our Terms and Privacy Policy.
              </small>
            </>
          ) : (
            <>
              <div className="card-icon success">
                <ShieldCheck />
              </div>
              <h2>Check your Gmail</h2>
              <p>
                We sent a 6-digit verification code to
                <br />
                <strong>{email}</strong>
              </p>
              <div className="otp-row">
                {otp.map((v, i) => (
                  <input
                    id={`otp-${i}`}
                    key={i}
                    value={v}
                    maxLength="1"
                    inputMode="numeric"
                    onChange={(e) => updateOtp(e.target.value, i)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !v)
                        document.getElementById(`otp-${i - 1}`)?.focus();
                    }}
                  />
                ))}
              </div>
              {error && <div className="form-error">{error}</div>}
              <button
                className="primary-btn"
                onClick={verify}
                disabled={loading}
              >
                {loading ? "Verifying..." : "Verify & continue"}
                <ArrowRight />
              </button>
              <div className="switch-auth">
                Didn't receive it?{" "}
                <button onClick={resend} disabled={loading}>
                  Resend code
                </button>
              </div>
              <button
                className="back-link"
                onClick={() => {
                  setStep("form");
                  setError("");
                }}
              >
                ← Change email address
              </button>
              <div className="demo-hint">The code expires in 10 minutes</div>
            </>
          )}
        </div>
      </section>
      <section className="story-band" id="how">
        <div>
          <small>HOW IT WORKS</small>
          <h2>One key. One model. Two levels of intelligence.</h2>
          <p>
            Create a secure API key, call the OpenAI-compatible endpoint, and
            choose free routing for everyday chat or premium routing for harder
            reasoning. SwitchForge handles the gateway while your application
            keeps one stable integration.
          </p>
        </div>
        <div className="story-steps">
          <span>
            <b>01</b>Create and verify
          </span>
          <span>
            <b>02</b>Generate a key
          </span>
          <span>
            <b>03</b>Call SwitchForge
          </span>
        </div>
      </section>
      <section className="story-band why-band" id="why">
        <div>
          <small>WHY WE BUILT IT</small>
          <h2>Learn how model gateways work without a costly starting line.</h2>
          <p>
            SwitchForge by DTEmpire is free during this early testing phase so
            developers can experiment, understand routing, and build real
            projects. It will not necessarily remain free forever. As the
            platform improves, we may introduce subscriptions to cover reliable
            infrastructure and premium-model costs while keeping access
            transparent and fairly priced.
          </p>
          <button className="secondary-btn" onClick={onDocs}>
            <BookOpen />
            Explore the documentation
          </button>
        </div>
      </section>
      <footer className="site-footer">
        &copy; {new Date().getFullYear()} DargoTamber (DTEmpire). SwitchForge.
      </footer>
    </main>
  );
}

function Documentation({ onClose }) {
  const sections = [
    ["intro", "Introduction"],
    ["walkthrough-doc", "Walkthrough"],
    ["auth-doc", "API keys"],
    ["request-doc", "Chat completions"],
    ["tiers-doc", "Routing tiers"],
    ["limits-doc", "Limits & expiry"],
    ["usage-doc", "Usage & rotation"],
  ];
  const [active, setActive] = useState("intro");
  useEffect(() => {
    const root = document.querySelector(".docs-overlay");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActive(visible.target.id);
      },
      { root, rootMargin: "-15% 0px -65%", threshold: 0 },
    );
    sections.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="docs-overlay">
      <header>
        <Brand />
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="docs-layout">
        <aside>
          <small>GET STARTED</small>
          {sections.map(([id, label]) => (
            <a
              key={id}
              className={active === id ? "current" : ""}
              href={`#${id}`}
            >
              {label}
            </a>
          ))}
        </aside>
        <article>
          <div className="docs-eyebrow">
            SWITCHFORGE BY DTEMPIRE / DOCUMENTATION
          </div>
          <h1 id="intro">Build once. Route intelligently.</h1>
          <p className="docs-lead">
            SwitchForge exposes one OpenAI-compatible chat endpoint backed by
            OmniRoute. Your application uses the stable public model name{" "}
            <code>SwitchForge</code> while the gateway handles the underlying
            route.
          </p>
          <div className="docs-callout">
            <Sparkles />
            <div>
              <b>Early access</b>
              <p>
                The service is free while we test and help developers learn how
                model gateways work. Future subscriptions may support
                infrastructure and premium model access as the platform matures.
              </p>
            </div>
          </div>
          <h2 id="walkthrough-doc">Start-to-finish walkthrough</h2>
          <div className="docs-steps">
            <div>
              <b>1</b>
              <span>
                <strong>Create an account</strong>Enter your name, Gmail
                address, and password. SwitchForge emails a six-digit OTP that
                expires after 10 minutes.
              </span>
            </div>
            <div>
              <b>2</b>
              <span>
                <strong>Verify and sign in</strong>Enter the OTP to open the
                developer console. Future visits use your email and password.
              </span>
            </div>
            <div>
              <b>3</b>
              <span>
                <strong>Create a key</strong>Select <em>Create API key</em>,
                give it a recognizable name, choose its expiry and token
                allowance, then copy the secret immediately.
              </span>
            </div>
            <div>
              <b>4</b>
              <span>
                <strong>Send a request</strong>Put the secret in the Bearer
                authorization header and choose either the free or premium tier.
              </span>
            </div>
            <div>
              <b>5</b>
              <span>
                <strong>Monitor and rotate</strong>Check usage with the usage
                endpoint. Create a replacement before expiry and revoke keys you
                no longer use.
              </span>
            </div>
          </div>
          <h2 id="auth-doc">Create and store an API key</h2>
          <p>
            From the console, select <strong>Create API key</strong>. Choose a
            name, an expiry of one, two, or three months, and an allowance of
            100K, 500K, or 1M tokens. The full <code>dt_live_...</code> secret
            is displayed only once. Store it in a server-side environment
            variable and never place it in browser code or commit it to Git.
          </p>
          <pre>
            <span>export</span> DT_API_KEY=<b>"dt_live_YOUR_KEY"</b>
          </pre>
          <h2 id="request-doc">Make your first request</h2>
          <pre>
            <span>curl</span> {gatewayBase}/v1/chat/completions \ -H{" "}
            <b>"Authorization: Bearer dt_live_YOUR_KEY"</b> \ -H{" "}
            <b>"Content-Type: application/json"</b> \ -d{" "}
            <b>
              '&#123; "model": "SwitchForge", "tier": "free", "messages":
              [&#123;"role":"user","content":"Hello"&#125;] &#125;'
            </b>
          </pre>
          <h2 id="tiers-doc">Choose a routing tier</h2>
          <div className="docs-tier-grid">
            <div>
              <Zap />
              <b>Free</b>
              <p>
                Designed for normal chat, rewriting, summaries, and everyday
                questions. It routes to OmniRoute Normal Chat.
              </p>
              <code>"tier": "free"</code>
            </div>
            <div>
              <Sparkles />
              <b>Premium</b>
              <p>
                Use for difficult reasoning, coding, and tasks where stronger
                model capability matters. It routes to OmniRoute Premium.
              </p>
              <code>"tier": "premium"</code>
            </div>
          </div>
          <h2 id="limits-doc">Limits and expiry</h2>
          <p>
            Limits are configured separately for every key and enforced by the
            backend before a request is sent upstream. Administrators can
            additionally choose <strong>Unlimited tokens</strong> and{" "}
            <strong>Never expires</strong>, and may create any number of active
            keys.
          </p>
          <div className="limit-table">
            <div>
              <b>Token allowances</b>
              <span>
                100K, 500K, or 1M tokens per key; unlimited for admins
              </span>
            </div>
            <div>
              <b>Expiry choices</b>
              <span>1, 2, or 3 months; no expiry for admins</span>
            </div>
            <div>
              <b>Active keys</b>
              <span>
                Maximum of 3 per regular account; unlimited for admins
              </span>
            </div>
            <div>
              <b>Allowance exhausted</b>
              <span>Requests return HTTP 429 until you use another key</span>
            </div>
            <div>
              <b>Key expired</b>
              <span>Requests return HTTP 401; create a replacement key</span>
            </div>
          </div>
          <p>
            The console shows tokens used, the selected allowance, expiry date,
            and current status. Usage is recorded after successful responses.
            Streaming requests use an estimated token count.
          </p>
          <h2 id="usage-doc">Check usage and rotate keys</h2>
          <p>
            Use the same API key to read its current allowance, consumption,
            remaining tokens, and expiry timestamp.
          </p>
          <pre>
            <span>curl</span> {gatewayBase}/v1/usage \ -H{" "}
            <b>"Authorization: Bearer $DT_API_KEY"</b>
          </pre>
          <p>
            Create a new key before the old one expires, update your application
            environment variable, confirm requests work, and then revoke the old
            key from the console. Revoke immediately if a secret is exposed.
          </p>
          <h2>Endpoints</h2>
          <div className="endpoint-list">
            <code>POST /v1/chat/completions</code>
            <span>Create a chat completion</span>
            <code>GET /v1/models</code>
            <span>List the SwitchForge model</span>
            <code>GET /v1/usage</code>
            <span>Read usage for the current key</span>
          </div>
          <footer className="docs-footer">
            &copy; {new Date().getFullYear()} DargoTamber (DTEmpire).
            SwitchForge.
          </footer>
        </article>
        <nav className="docs-rail" aria-label="Current documentation section">
          <i />
          {sections.map(([id, label]) => (
            <a
              key={id}
              className={active === id ? "current" : ""}
              href={`#${id}`}
            >
              <span />
              {label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

function CreateKeyModal({ onClose, onCreate, isAdmin }) {
  const [name, setName] = useState("");
  const [months, setMonths] = useState(1);
  const [limit, setLimit] = useState(100000);
  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
        <div className="card-icon">
          <KeyRound />
        </div>
        <h2>Create a new API key</h2>
        <p>Configure access and usage for this key.</p>
        <label>
          Key name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production app"
          />
        </label>
        <div className="field-grid">
          <label>
            Expires after
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {isAdmin && <option value="0">Never expires</option>}
              <option value="1">1 month</option>
              <option value="2">2 months</option>
              <option value="3">3 months</option>
            </select>
            <ChevronDown />
          </label>
          <label>
            Token allowance
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {isAdmin && <option value="0">Unlimited tokens</option>}
              <option value="100000">100K tokens</option>
              <option value="500000">500K tokens</option>
              <option value="1000000">1M tokens</option>
            </select>
            <ChevronDown />
          </label>
        </div>
        <div className="modal-note">
          <Clock3 />
          {isAdmin
            ? "Administrators may create unlimited keys with no expiry or token cap."
            : "Keys automatically expire after 1–3 months. Create a new key when this one expires."}
        </div>
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-btn"
            disabled={!name.trim()}
            onClick={() => onCreate({ name, months, limit })}
          >
            Create API key
            <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const submit = async () => {
    if (newPassword !== confirm)
      return setMessage("New passwords do not match.");
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage(data.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-bg">
      <div className="modal settings-modal">
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>
        <div className="card-icon">
          <ShieldCheck />
        </div>
        <h2>Account settings</h2>
        <p>Change the password used to sign in to SwitchForge.</p>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {message && <div className="admin-message">{message}</div>}
        <button
          className="primary-btn"
          disabled={
            busy || !currentPassword || newPassword.length < 8 || !confirm
          }
          onClick={submit}
        >
          <Save />
          {busy ? "Updating..." : "Change password"}
        </button>
      </div>
    </div>
  );
}

function AdminPanel({ onClose, initialTab = "gateway" }) {
  const [tab, setTab] = useState(initialTab),
    [config, setConfig] = useState(null),
    [apiKey, setApiKey] = useState(""),
    [models, setModels] = useState([]),
    [oauth, setOauth] = useState({ providers: [], connections: [] }),
    [oauthFlow, setOauthFlow] = useState(null),
    [oauthCallback, setOauthCallback] = useState(""),
    [users, setUsers] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/admin/gateway")
      .then((data) => setConfig(data.gateway))
      .catch((err) => setMessage(err.message));
    api("/admin/users")
      .then((data) => setUsers(data.users))
      .catch((err) => setMessage(err.message));
    api("/admin/oauth")
      .then(setOauth)
      .catch((err) => setMessage(err.message));
  }, []);
  const update = (field, value) =>
    setConfig((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/admin/gateway", {
        method: "PUT",
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          freeModel: config.freeModel,
          premiumModel: config.premiumModel,
          auxiliary: config.auxiliary,
          providers: config.providers,
          routes: config.routes,
          apiKey,
        }),
      });
      setConfig(data.gateway);
      setApiKey("");
      setMessage("Gateway configuration saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/admin/gateway/test", {
        method: "POST",
        body: JSON.stringify({ baseUrl: config.baseUrl, apiKey }),
      });
      setModels(data.models || []);
      setMessage(`Connection successful. ${data.count} models loaded.`);
    } catch (err) {
      setModels([]);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  const toggleUser = async (user) => {
    try {
      const data = await api(`/admin/users/${user.id}/suspension`, {
        method: "PUT",
        body: JSON.stringify({ suspended: !user.suspended }),
      });
      setUsers((items) =>
        items.map((item) =>
          item.id === user.id
            ? { ...item, suspended: data.user.suspended }
            : item,
        ),
      );
      setMessage(data.user.suspended ? "User suspended." : "User restored.");
    } catch (err) {
      setMessage(err.message);
    }
  };
  const togglePremium = async (user) => {
    try {
      const data = await api(`/admin/users/${user.id}/premium`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !user.premiumAccess }),
      });
      setUsers((items) =>
        items.map((item) =>
          item.id === user.id
            ? { ...item, premiumAccess: data.user.premiumAccess }
            : item,
        ),
      );
      setMessage(
        data.user.premiumAccess
          ? "Premium access granted."
          : "Premium access revoked.",
      );
    } catch (err) {
      setMessage(err.message);
    }
  };
  const grant = async (user) => {
    try {
      await api(`/admin/users/${user.id}/grant`, { method: "POST" });
      setMessage(`Granted 100K tokens to ${user.email}.`);
    } catch (err) {
      setMessage(err.message);
    }
  };
  const toggleAdmin = async (user) => {
    try {
      const data = await api(`/admin/users/${user.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ admin: user.role !== "admin" }),
      });
      setUsers((items) =>
        items.map((item) =>
          item.id === user.id ? { ...item, ...data.user } : item,
        ),
      );
      setMessage(
        data.user.role === "admin"
          ? `${user.email} is now an administrator.`
          : `Administrator access removed from ${user.email}.`,
      );
    } catch (err) {
      setMessage(err.message);
    }
  };
  const deleteUser = async (user) => {
    if (
      !window.confirm(
        `Permanently delete ${user.email}? This removes their sessions, API keys, and usage history and cannot be undone.`,
      )
    )
      return;
    try {
      await api(`/admin/users/${user.id}`, { method: "DELETE" });
      setUsers((items) => items.filter((item) => item.id !== user.id));
      setMessage(`${user.email} was permanently deleted.`);
    } catch (err) {
      setMessage(err.message);
    }
  };
  const options = (value) => [...new Set([value, ...models].filter(Boolean))];
  const updateProvider = (providerId, field, value) =>
    setConfig((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === providerId ? { ...provider, [field]: value } : provider,
      ),
    }));
  const addProvider = () => {
    const providerId = crypto.randomUUID();
    setConfig((current) => ({
      ...current,
      providers: [...current.providers, { id: providerId, name: "New provider", baseUrl: "https://website.com/v1", model: "model-name", premiumModel: "model-name", timeoutMs: 60000, apiKey: "", apiKeyConfigured: false }],
      routes: { ...current.routes, free: { ...current.routes.free, providerIds: [...current.routes.free.providerIds, providerId] }, premium: { ...current.routes.premium, providerIds: [...current.routes.premium.providerIds, providerId] } },
    }));
  };
  const removeProvider = (providerId) => setConfig((current) => ({ ...current, providers: current.providers.filter((provider) => provider.id !== providerId), routes: { free: { ...current.routes.free, providerIds: current.routes.free.providerIds.filter((id) => id !== providerId) }, premium: { ...current.routes.premium, providerIds: current.routes.premium.providerIds.filter((id) => id !== providerId) } } }));
  const toggleRouteProvider = (tier, providerId) => setConfig((current) => { const selected = current.routes[tier].providerIds.includes(providerId); return { ...current, routes: { ...current.routes, [tier]: { ...current.routes[tier], providerIds: selected ? current.routes[tier].providerIds.filter((id) => id !== providerId) : [...current.routes[tier].providerIds, providerId] } } }; });
  const refreshOauth = () => api("/admin/oauth").then(setOauth);
  const refreshGateway = () => api("/admin/gateway").then((data) => setConfig(data.gateway));
  const startOauth = async (provider) => {
    setBusy(true); setMessage(""); setOauthCallback("");
    try {
      const data = await api(`/admin/oauth/${provider.id}/start`, { method: "POST", body: JSON.stringify({}) });
      const flow = { ...data, provider };
      setOauthFlow(flow);
      if (provider.flow === "device" && data.state) pollOauth(provider, data.state);
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  };
  const pollOauth = async (provider, state) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const status = await api(`/admin/oauth/${provider.id}/status?state=${encodeURIComponent(state)}`);
        if (["complete", "completed", "authorized"].includes(status.status)) {
          await api(`/admin/oauth/${provider.id}/apply`, { method: "POST", body: JSON.stringify({ state }) });
          await api(`/admin/oauth/${provider.id}/register`, { method: "POST", body: JSON.stringify({}) });
          setMessage(`${provider.name} connected and added to the provider router.`); setOauthFlow(null); await Promise.all([refreshOauth(), refreshGateway()]); return;
        }
        if (["error", "failed"].includes(status.status)) throw new Error(status.error || "Authorization failed.");
      } catch (err) { setMessage(err.message); return; }
    }
    setMessage("OAuth authorization timed out.");
  };
  const exchangeOauth = async () => {
    try {
      await api(`/admin/oauth/${oauthFlow.provider.id}/exchange`, { method: "POST", body: JSON.stringify({ callback: oauthCallback, state: oauthFlow.state, redirectUri: oauthFlow.redirectUri, codeVerifier: oauthFlow.codeVerifier }) });
      await api(`/admin/oauth/${oauthFlow.provider.id}/register`, { method: "POST", body: JSON.stringify({}) });
      setMessage(`${oauthFlow.provider.name} connected and added to the provider router.`); setOauthFlow(null); setOauthCallback(""); await Promise.all([refreshOauth(), refreshGateway()]);
    } catch (err) { setMessage(err.message); }
  };
  return (
    <div className="modal-bg admin-bg">
      <div className="admin-panel">
        <header>
          <div>
            <div className="eyebrow">
              <span /> ADMINISTRATION
            </div>
            <h2>SwitchForge control</h2>
            <p>Manage gateway routing, users, access, and allowances.</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="admin-tabs">
          <button
            className={tab === "gateway" ? "active" : ""}
            onClick={() => setTab("gateway")}
          >
            <ServerCog />
            Gateway
          </button>
          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            <BarChart3 />
            Users & usage
          </button>
        </div>
        {!config ? (
          <div className="admin-loading">Loading administration data...</div>
        ) : tab === "gateway" ? (
          <div className="admin-form">
            <div className="admin-status">
              <ServerCog />
              <div>
                <b>Active configuration</b>
                <span>
                  {config.source === "admin"
                    ? "Managed from this console"
                    : "Using server environment defaults"}{" "}
                  · API key {config.apiKeyConfigured ? "configured" : "missing"}
                </span>
              </div>
            </div>
            <label>
              OmniRoute base URL
              <input
                value={config.baseUrl}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder="https://route.example.com/v1"
              />
            </label>
            <label>
              Replace OmniRoute API key
              <input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to test with the saved key"
              />
            </label>
            <div className="model-loader">
              <button
                className="secondary-btn"
                disabled={busy || !config.baseUrl}
                onClick={test}
              >
                <Zap />
                {busy ? "Testing..." : "Test connection & load models"}
              </button>
              <span>
                {models.length
                  ? `${models.length} models available`
                  : "Load models before choosing routes."}
              </span>
            </div>
            <div className="admin-combos">
              <label>
                Free route model
                <select
                  value={config.freeModel}
                  onChange={(e) => update("freeModel", e.target.value)}
                >
                  {options(config.freeModel).map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
                <small>Used for every request from Free-only users.</small>
              </label>
              <label>
                Premium route model
                <select
                  value={config.premiumModel}
                  onChange={(e) => update("premiumModel", e.target.value)}
                >
                  {options(config.premiumModel).map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
                <small>Available only to users granted Premium access.</small>
              </label>
            </div>
            <div className="provider-router-head">
              <div>
                <h3>Provider router</h3>
                <p>Add OpenAI-compatible <code>/v1</code> providers and assign them to Normal or Premium traffic.</p>
              </div>
              <button className="secondary-btn" onClick={addProvider}><Plus />Add provider</button>
            </div>
            <div className="route-strategies">
              {[["free", "Normal"], ["premium", "Premium"]].map(([tier, label]) => (
                <label key={tier}>{label} routing<select value={config.routes[tier].strategy} onChange={(e) => setConfig((current) => ({ ...current, routes: { ...current.routes, [tier]: { ...current.routes[tier], strategy: e.target.value } } }))}><option value="fallback">Ordered fallback</option><option value="round_robin">Round robin</option></select></label>
              ))}
            </div>
            <div className="provider-list">
              {config.providers.map((provider, index) => (
                <div className="provider-card" key={provider.id}>
                  <div className="provider-card-head"><b>{index + 1}. {provider.name || "Provider"}</b><button disabled={config.providers.length === 1} onClick={() => removeProvider(provider.id)} title="Remove provider"><Trash2 /></button></div>
                  <div className="provider-grid">
                    <label>Name<input value={provider.name} onChange={(e) => updateProvider(provider.id, "name", e.target.value)} /></label>
                    <label>Base URL<input value={provider.baseUrl} onChange={(e) => updateProvider(provider.id, "baseUrl", e.target.value)} placeholder="https://website.com/v1" /></label>
                    <label>Normal model<input value={provider.model} onChange={(e) => updateProvider(provider.id, "model", e.target.value)} /></label>
                    <label>Premium model<input value={provider.premiumModel || ""} onChange={(e) => updateProvider(provider.id, "premiumModel", e.target.value)} /></label>
                    <label>API key<input type="password" value={provider.apiKey || ""} onChange={(e) => updateProvider(provider.id, "apiKey", e.target.value)} placeholder={provider.apiKeyConfigured ? "Saved — leave blank to keep" : "Required"} /></label>
                    <label>Timeout (ms)<input type="number" min="5000" max="180000" step="1000" value={provider.timeoutMs || 60000} onChange={(e) => updateProvider(provider.id, "timeoutMs", Number(e.target.value))} /></label>
                  </div>
                  <div className="provider-assign"><label><input type="checkbox" checked={config.routes.free.providerIds.includes(provider.id)} onChange={() => toggleRouteProvider("free", provider.id)} /> Normal</label><label><input type="checkbox" checked={config.routes.premium.providerIds.includes(provider.id)} onChange={() => toggleRouteProvider("premium", provider.id)} /> Premium</label></div>
                </div>
              ))}
            </div>
            <div className="oauth-router">
              <div className="provider-router-head">
                <div><h3>Account connections</h3><p>Connect supported subscriptions through OmniRoute OAuth. Credentials stay inside OmniRoute.</p></div>
              </div>
              <div className="oauth-provider-grid">
                {oauth.providers.map((provider) => (
                  <button key={provider.id} className="oauth-provider" disabled={busy} onClick={() => startOauth(provider)}>
                    <span><b>{provider.name}</b><small>{provider.flow === "device" ? "Device authorization" : "Browser authorization"}</small></span><ArrowRight />
                  </button>
                ))}
              </div>
              {oauthFlow && (
                <div className="oauth-flow">
                  <b>Connect {oauthFlow.provider.name}</b>
                  {(() => {
                    const authorizationUrl = oauthFlow.authUrl || oauthFlow.authorizeUrl || oauthFlow.verificationUri || oauthFlow.verification_uri_complete || oauthFlow.verification_uri;
                    return authorizationUrl ? <><p>Open this authorization link in any browser or account profile:</p><div className="oauth-link"><code>{authorizationUrl}</code><a href={authorizationUrl} target="_blank" rel="noreferrer"><ArrowRight />Open link</a><button onClick={() => { navigator.clipboard?.writeText(authorizationUrl); setMessage("Authorization link copied."); }}><Copy />Copy link</button></div></> : null;
                  })()}
                  {(oauthFlow.userCode || oauthFlow.user_code) && <p>Enter code <code>{oauthFlow.userCode || oauthFlow.user_code}</code> in the opened page.</p>}
                  {oauthFlow.provider.flow === "browser" && <><p>After approval, paste the complete callback URL or <code>code#state</code>.</p><textarea value={oauthCallback} onChange={(e) => setOauthCallback(e.target.value)} placeholder="http://127.0.0.1:20128/callback?code=...&state=..." /><button className="primary-btn" disabled={!oauthCallback.trim()} onClick={exchangeOauth}>Complete connection</button></>}
                </div>
              )}
              <p className="oauth-count">{oauth.connections.length} active OAuth connection{oauth.connections.length === 1 ? "" : "s"} in OmniRoute.</p>
            </div>
            <div className="aux-head">
              <div>
                <h3>Auxiliary tasks</h3>
                <p>
                  Use <code>auto</code> or select a loaded provider model.
                </p>
              </div>
              <button
                className="secondary-btn"
                onClick={() =>
                  setConfig((current) => ({
                    ...current,
                    auxiliary: Object.fromEntries(
                      auxiliaryTasks.map(([id]) => [id, "auto"]),
                    ),
                  }))
                }
              >
                <RotateCcw />
                Reset all
              </button>
            </div>
            <div className="aux-list">
              {auxiliaryTasks.map(([id, label, description]) => (
                <div className="aux-row" key={id}>
                  <span>
                    <b>{label}</b>
                    <small>{description}</small>
                  </span>
                  <input
                    list="gateway-models"
                    value={config.auxiliary?.[id] || "auto"}
                    onChange={(e) =>
                      setConfig((current) => ({
                        ...current,
                        auxiliary: {
                          ...current.auxiliary,
                          [id]: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <datalist id="gateway-models">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            {message && <div className="admin-message">{message}</div>}
            <div className="admin-actions">
              <button
                className="primary-btn"
                disabled={busy || !config.freeModel || !config.premiumModel}
                onClick={save}
              >
                <Save />
                Save configuration
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-users">
            <div className="admin-user-head">
              <span>USER</span>
              <span>USAGE</span>
              <span>KEYS</span>
              <span>ACTIONS</span>
            </div>
            {users.map((user) => (
              <div className="admin-user-row" key={user.id}>
                <span>
                  <b>{user.name}</b>
                  <small>
                    {user.email}
                    {user.role === "admin"
                      ? " · Admin"
                      : user.premiumAccess
                        ? " · Premium"
                        : " · Free only"}
                  </small>
                </span>
                <span>
                  <b>{fmt(user.tokens)} tokens</b>
                  <small>{fmt(user.requests)} requests</small>
                </span>
                <span>{user.activeKeys} active</span>
                <span>
                  {!user.ownerAdmin && (
                    <>
                      <button
                        className={user.role === "admin" ? "restore" : ""}
                        onClick={() => toggleAdmin(user)}
                      >
                        {user.role === "admin" ? "Remove Admin" : "Make Admin"}
                      </button>
                      {user.role !== "admin" && (
                        <>
                          <button
                            className={user.premiumAccess ? "restore" : ""}
                            onClick={() => togglePremium(user)}
                          >
                            {user.premiumAccess
                              ? "Revoke Premium"
                              : "Grant Premium"}
                          </button>
                          <button onClick={() => grant(user)}>+100K</button>
                          <button
                            className={user.suspended ? "restore" : "suspend"}
                            onClick={() => toggleUser(user)}
                          >
                            {user.suspended ? "Restore" : "Suspend"}
                          </button>
                        </>
                      )}
                      <button
                        className="delete-user"
                        onClick={() => deleteUser(user)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
            {message && <div className="admin-message">{message}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function UsagePage() {
  const [usage, setUsage] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/usage")
      .then(setUsage)
      .catch((err) => setError(err.message));
  }, []);
  if (error)
    return (
      <div className="usage-page">
        <div className="form-error">{error}</div>
      </div>
    );
  if (!usage)
    return (
      <div className="usage-page">
        <div className="empty">Loading usage data...</div>
      </div>
    );
  const maxTokens = Math.max(1, ...usage.daily.map((day) => day.tokens)),
    totalRoutes = Math.max(
      1,
      usage.summary.freeRequests + usage.summary.premiumRequests,
    );
  return (
    <div className="usage-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> USAGE ANALYTICS
          </div>
          <h1>Usage</h1>
          <p>
            Requests and token consumption across all of your SwitchForge keys.
          </p>
        </div>
        <span className="period-pill">Last 30 days</span>
      </div>
      <section className="usage-summary">
        <div>
          <small>TOTAL REQUESTS</small>
          <strong>{fmt(usage.summary.requests)}</strong>
          <span>All recorded requests</span>
        </div>
        <div>
          <small>TOKENS USED</small>
          <strong>{fmt(usage.summary.tokens)}</strong>
          <span>Across active and revoked keys</span>
        </div>
        <div>
          <small>FREE ROUTE</small>
          <strong>{fmt(usage.summary.freeRequests)}</strong>
          <span>
            {Math.round((usage.summary.freeRequests / totalRoutes) * 100)}% of
            requests
          </span>
        </div>
        <div>
          <small>PREMIUM ROUTE</small>
          <strong>{fmt(usage.summary.premiumRequests)}</strong>
          <span>
            {Math.round((usage.summary.premiumRequests / totalRoutes) * 100)}%
            of requests
          </span>
        </div>
      </section>
      <section className="usage-chart">
        <div className="usage-section-head">
          <div>
            <h2>Token activity</h2>
            <p>Daily token consumption during the last 30 days.</p>
          </div>
          <BarChart3 />
        </div>
        <div className="bars">
          {usage.daily.map((day) => (
            <div
              className="bar-slot"
              key={day.date}
              title={`${day.date}: ${fmt(day.tokens)} tokens`}
            >
              <i
                style={{
                  height: `${Math.max(day.tokens ? 6 : 2, (day.tokens / maxTokens) * 100)}%`,
                }}
              />
              <span>{new Date(`${day.date}T00:00:00`).getDate()}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="usage-detail-grid">
        <div className="usage-table">
          <div className="usage-section-head">
            <div>
              <h2>Usage by key</h2>
              <p>Allowance and request totals for each key.</p>
            </div>
          </div>
          <div className="usage-list">
            {usage.keys.length ? (
              usage.keys.map((key) => (
                <div key={key.id}>
                  <span>
                    <b>{key.name}</b>
                    <small>
                      {key.requests} requests ·{" "}
                      {key.expiresAt
                        ? `expires ${dateFmt(key.expiresAt)}`
                        : "never expires"}
                    </small>
                  </span>
                  <strong>
                    {fmt(key.tokenUsed)}{" "}
                    <small>
                      /{" "}
                      {key.tokenLimit == null
                        ? "Unlimited"
                        : fmt(key.tokenLimit)}
                    </small>
                  </strong>
                </div>
              ))
            ) : (
              <div className="empty">No API keys yet.</div>
            )}
          </div>
        </div>
        <div className="route-breakdown">
          <div className="usage-section-head">
            <div>
              <h2>Route mix</h2>
              <p>How SwitchForge handled your requests.</p>
            </div>
          </div>
          <div className="route-meter">
            <i
              style={{
                width: `${(usage.summary.freeRequests / totalRoutes) * 100}%`,
              }}
            />
          </div>
          <div className="route-label">
            <span>
              <i className="free" />
              Free <b>{usage.summary.freeRequests}</b>
            </span>
            <span>
              <i className="premium" />
              Premium <b>{usage.summary.premiumRequests}</b>
            </span>
          </div>
        </div>
      </section>
      <section className="recent-usage">
        <div className="usage-section-head">
          <div>
            <h2>Recent requests</h2>
            <p>Latest metered API activity.</p>
          </div>
        </div>
        <div className="recent-table">
          <div className="recent-row head">
            <span>KEY</span>
            <span>ROUTE</span>
            <span>MODEL</span>
            <span>TOKENS</span>
            <span>TIME</span>
          </div>
          {usage.recent.length ? (
            usage.recent.map((event) => (
              <div className="recent-row" key={event.id}>
                <span>{event.keyName}</span>
                <span>
                  <b className={`route-tag ${event.tier}`}>{event.tier}</b>
                </span>
                <span>{event.model || "SwitchForge"}</span>
                <span>{fmt(event.tokens)}</span>
                <span>{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))
          ) : (
            <div className="empty">No requests recorded yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function ApiPlayground({ premiumAccess }) {
  const [apiKey, setApiKey] = useState(""),
    [message, setMessage] = useState(""),
    [tier, setTier] = useState("auto"),
    [reply, setReply] = useState(""),
    [route, setRoute] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const send = async (event) => {
    event.preventDefault();
    if (!apiKey.trim() || !message.trim()) return;
    setBusy(true);
    setError("");
    setReply("");
    setRoute("");
    try {
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "SwitchForge",
          tier,
          messages: [{ role: "user", content: message.trim() }],
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.error?.message || "The API request failed.");
      setReply(
        data?.choices?.[0]?.message?.content || "No text response returned.",
      );
      setRoute(
        `${data?.switchforge?.tier || response.headers.get("X-DTEmpire-Tier") || "free"} · ${response.headers.get("X-SwitchForge-Route-Model") || data?.switchforge?.model || "SwitchForge"}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="api-playground">
      <div className="playground-head">
        <div>
          <div className="eyebrow">
            <span /> API PLAYGROUND
          </div>
          <h2>Test your key</h2>
          <p>
            Send a quick request through the same endpoint your application
            uses.
          </p>
        </div>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="auto">Auto</option>
          <option value="free">Free</option>
          {premiumAccess && <option value="premium">Premium</option>}
        </select>
      </div>
      <label>
        API key
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="dt_live_..."
          autoComplete="off"
        />
      </label>
      <div className="playground-chat">
        {reply ? (
          <div className="playground-reply">
            <Sparkles />
            <div>
              <small>{route}</small>
              <p>{reply}</p>
            </div>
          </div>
        ) : (
          <div className="playground-empty">
            Your SwitchForge response will appear here.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={send}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask SwitchForge something..."
            maxLength="1000"
          />
          <button
            disabled={busy || !apiKey.trim() || !message.trim()}
            title="Send request"
          >
            <ArrowRight />
          </button>
        </form>
      </div>
      <small className="playground-privacy">
        <ShieldCheck />
        Your API key is used only for this request and is not stored.
      </small>
    </section>
  );
}

function Dashboard({ user, onLogout, onDocs }) {
  const [keys, setKeys] = useState([]);
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [newSecret, setNewSecret] = useState(null);
  const [adminSection, setAdminSection] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 900);
  const total = keys.reduce((a, k) => a + k.tokenUsed, 0);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 2600);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    Promise.all([api("/keys"), api("/usage")])
      .then(([keyData, usageData]) => {
        setKeys(keyData.keys);
        setUsage(usageData);
      })
      .catch((err) => setToast(err.message))
      .finally(() => setLoading(false));
  }, []);
  const createKey = async ({ name, months, limit }) => {
    try {
      const data = await api("/keys", {
        method: "POST",
        body: JSON.stringify({ name, months, tokenLimit: limit }),
      });
      setKeys([...keys, data.key]);
      setModal(false);
      setNewSecret(data.secret);
    } catch (err) {
      setToast(err.message);
    }
  };
  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setToast("Copied to clipboard");
  };
  const revoke = async (key) => {
    try {
      await api(`/keys/${key.id}`, { method: "DELETE" });
      setKeys(keys.filter((k) => k.id !== key.id));
      setToast("API key revoked");
    } catch (err) {
      setToast(err.message);
    }
  };
  const isAdmin = user.role === "admin";
  const showKeys = () => {
    setView("overview");
    setTimeout(
      () =>
        document
          .querySelector(".keys-section")
          ?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside>
        <Brand />
        <nav>
          <p>PLATFORM</p>
          <a
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            <Layers3 />
            Overview
          </a>
          <a onClick={showKeys}>
            <KeyRound />
            API keys<span>{keys.length}</span>
          </a>
          <a
            className={view === "usage" ? "active" : ""}
            onClick={() => setView("usage")}
          >
            <BarChart3 />
            Usage
          </a>
          <p>DEVELOPERS</p>
          <a onClick={onDocs}>
            <BookOpen />
            Documentation
            <ArrowRight />
          </a>
          <a onClick={() => setSettingsOpen(true)}>
            <Settings />
            Settings
          </a>
          {user.role === "admin" && (
            <>
              <p>ADMIN</p>
              <a onClick={() => setAdminSection("gateway")}>
                <ServerCog />
                Gateway control
                <ArrowRight />
              </a>
              <a onClick={() => setAdminSection("users")}>
                <BarChart3 />
                Users & usage
                <ArrowRight />
              </a>
            </>
          )}
        </nav>
        <div className="side-bottom">
          <div>
            <span className="status-dot" />
            All systems operational
          </div>
          <small>
            &copy; {new Date().getFullYear()} DargoTamber (DTEmpire)
          </small>
          <button onClick={onLogout}>
            <LogOut />
            Sign out
          </button>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <button className="mobile-menu" onClick={() => setSidebarCollapsed((value) => !value)} title="Toggle sidebar">
            <Menu />
          </button>
          <div className="header-right">
            {user.role === "admin" && (
              <button
                className="admin-header-btn"
                onClick={() => setAdminSection("users")}
              >
                <BarChart3 />
                Users
              </button>
            )}
            <button className="docs-btn" onClick={onDocs}>
              <BookOpen />
              Docs
            </button>
            <button className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        <div className="dash-body">
          {view === "usage" ? (
            <UsagePage />
          ) : (
            <>
              <div className="welcome">
                <div>
                  <div className="eyebrow">
                    <span /> DEVELOPER CONSOLE
                  </div>
                  <h1>Good morning, {user.name.split(" ")[0]}.</h1>
                  <p>Here's what's happening with your SwitchForge APIs.</p>
                </div>
                <button
                  className="primary-btn"
                  onClick={() =>
                    isAdmin || keys.length < 3
                      ? setModal(true)
                      : setToast("You can create a maximum of 3 API keys")
                  }
                >
                  <Plus />
                  Create API key
                </button>
              </div>
              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon purple">
                      <KeyRound />
                    </span>
                    <small>API KEYS</small>
                  </div>
                  <strong>
                    {keys.length}
                    {!isAdmin && <em>/ 3</em>}
                  </strong>
                  <p>
                    {isAdmin
                      ? "Unlimited key creation enabled"
                      : `${3 - keys.length} key slot${3 - keys.length === 1 ? "" : "s"} remaining`}
                  </p>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon blue">
                      <Zap />
                    </span>
                    <small>TOKENS USED</small>
                  </div>
                  <strong>
                    {total > 999 ? `${(total / 1000).toFixed(1)}K` : total}
                  </strong>
                  <p>This billing period</p>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon green">
                      <CheckCircle2 />
                    </span>
                    <small>SUCCESS RATE</small>
                  </div>
                  <strong>
                    {usage?.summary.successRate == null
                      ? "N/A"
                      : `${usage.summary.successRate.toFixed(1)}%`}
                  </strong>
                  <p>
                    {usage?.summary.requests
                      ? `Across ${usage.summary.requests.toLocaleString()} recorded requests`
                      : "No requests recorded yet"}
                  </p>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon orange">
                      <Clock3 />
                    </span>
                    <small>AVG. LATENCY</small>
                  </div>
                  <strong>
                    {usage?.summary.averageLatencyMs == null
                      ? "N/A"
                      : usage.summary.averageLatencyMs}
                    {usage?.summary.averageLatencyMs != null && <em>ms</em>}
                  </strong>
                  <p>
                    {usage?.summary.latencySamples
                      ? `Across ${usage.summary.latencySamples.toLocaleString()} successful requests`
                      : "Timing starts with the next request"}
                  </p>
                </div>
              </section>
              <section className="endpoint-card">
                <div className="endpoint-copy">
                  <span className="model-icon">
                    <Sparkles />
                  </span>
                  <div>
                    <small>YOUR ENDPOINT</small>
                    <h3>Chat Completions API</h3>
                    <p>
                      Use tier “free” for normal chat or “premium” for complex
                      work.
                    </p>
                  </div>
                </div>
                <div className="endpoint-values">
                  <div className="endpoint-url-field">
                    <small>ENDPOINT</small>
                    <div
                      className="endpoint-cube"
                      aria-label={`${gatewayBase}/v1/chat/completions`}
                    >
                      <div className="endpoint-cube-inner">
                        <code className="endpoint-face endpoint-face-base">
                          {`${gatewayBase}/v1`}
                        </code>
                        <code className="endpoint-face endpoint-face-full">
                          {`${gatewayBase}/v1/chat/completions`}
                        </code>
                      </div>
                    </div>
                    <button
                      aria-label="Copy chat completions endpoint"
                      onClick={() => copy(`${gatewayBase}/v1/chat/completions`)}
                    >
                      <Copy />
                    </button>
                  </div>
                  <div>
                    <small>MODEL</small>
                    <code>SwitchForge</code>
                    <button onClick={() => copy("SwitchForge")}>
                      <Copy />
                    </button>
                  </div>
                </div>
              </section>
              <ApiPlayground premiumAccess={user.premiumAccess} />
              <section className="keys-section">
                <div className="section-head">
                  <div>
                    <h2>API keys</h2>
                    <p>Manage keys and monitor token usage.</p>
                  </div>
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      isAdmin || keys.length < 3
                        ? setModal(true)
                        : setToast("Maximum of 3 API keys reached")
                    }
                  >
                    <Plus />
                    New key
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>SECRET KEY</th>
                        <th>TOKEN USAGE</th>
                        <th>EXPIRES</th>
                        <th>STATUS</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.id}>
                          <td>
                            <div className="key-name">
                              <span>
                                <KeyRound />
                              </span>
                              <div>
                                <b>{key.name}</b>
                                <small>Created {dateFmt(key.createdAt)}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="secret">
                              <code>
                                {key.prefix}••••••••••••{key.lastFour}
                              </code>
                            </div>
                          </td>
                          <td>
                            <div className="usage">
                              <span>
                                {fmt(key.tokenUsed)}{" "}
                                <small>
                                  /{" "}
                                  {key.tokenLimit == null
                                    ? "Unlimited"
                                    : fmt(key.tokenLimit)}
                                </small>
                              </span>
                              <div>
                                <i
                                  style={{
                                    width:
                                      key.tokenLimit == null
                                        ? "0%"
                                        : `${Math.min(100, (key.tokenUsed / key.tokenLimit) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="expiry">
                              <Clock3 />
                              {key.expiresAt ? dateFmt(key.expiresAt) : "Never"}
                            </span>
                          </td>
                          <td>
                            <span className="active-pill">
                              <i />
                              {key.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="icon-btn danger"
                              onClick={() => revoke(key)}
                            >
                              <Trash2 />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!loading && keys.length === 0 && (
                    <div className="empty">
                      No API keys yet. Create one to get started.
                    </div>
                  )}
                  {loading && <div className="empty">Loading API keys...</div>}
                </div>
              </section>
              <div className="quick-grid">
                <div className="quick-card">
                  <div className="q-icon">
                    <BookOpen />
                  </div>
                  <div>
                    <h3>Make your first request</h3>
                    <p>
                      Follow the quickstart and start building in under five
                      minutes.
                    </p>
                    <button className="quick-link" onClick={onDocs}>
                      Read the quickstart <ArrowRight />
                    </button>
                  </div>
                </div>
                <div className="quick-card">
                  <div className="q-icon purple">
                    <RotateCcw />
                  </div>
                  <div>
                    <h3>Keys expire automatically</h3>
                    <p>
                      For security, keys last 1–3 months. Rotate before
                      expiration.
                    </p>
                    <button className="quick-link" onClick={onDocs}>
                      Learn about key security <ArrowRight />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      {modal && (
        <CreateKeyModal
          isAdmin={isAdmin}
          onClose={() => setModal(false)}
          onCreate={createKey}
        />
      )}{" "}
      {newSecret && (
        <div className="modal-bg">
          <div className="modal secret-modal">
            <button className="modal-close" onClick={() => setNewSecret(null)}>
              <X />
            </button>
            <div className="card-icon success">
              <Check />
            </div>
            <h2>API key created</h2>
            <p>Copy this key now. For security, it will not be shown again.</p>
            <div className="new-secret">
              <code>{newSecret}</code>
              <button onClick={() => copy(newSecret)}>
                <Copy />
              </button>
            </div>
            <div className="modal-note">
              <ShieldCheck />
              Store this secret somewhere secure. Anyone with it can use your
              token allowance.
            </div>
            <button className="primary-btn" onClick={() => setNewSecret(null)}>
              I saved my key
            </button>
          </div>
        </div>
      )}{" "}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}{" "}
      {adminSection && (
        <AdminPanel
          initialTab={adminSection}
          onClose={() => setAdminSection(null)}
        />
      )}{" "}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(Boolean(session.get()));
  const [suspended, setSuspended] = useState(false);
  const [docs, setDocs] = useState(false);
  useEffect(() => {
    const handler = () => setSuspended(true);
    window.addEventListener("switchforge:suspended", handler);
    if (!session.get()) {
      setChecking(false);
      return () => window.removeEventListener("switchforge:suspended", handler);
    }
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err.code === "account_suspended") setSuspended(true);
        else session.clear();
      })
      .finally(() => setChecking(false));
    return () => window.removeEventListener("switchforge:suspended", handler);
  }, []);
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    session.clear();
    setUser(null);
  };
  if (checking)
    return (
      <div className="boot">
        <Brand />
        <span>Loading console...</span>
      </div>
    );
  return (
    <>
      {suspended ? (
        <SuspendedPage onLogout={logout} />
      ) : user ? (
        <Dashboard user={user} onLogout={logout} onDocs={() => setDocs(true)} />
      ) : (
        <Auth onAuthed={setUser} onDocs={() => setDocs(true)} />
      )}{" "}
      {docs && !suspended && <Documentation onClose={() => setDocs(false)} />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
