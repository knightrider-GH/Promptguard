# PromptGuard 🛡️

> **Your AI prompts. Your privacy. Your control.**  
> A privacy-first browser extension that intercepts sensitive credentials, secrets, and personal information *before* they are transmitted to AI assistants.

---

## 🔒 The Mission

As AI assistants like ChatGPT, Claude, Microsoft Copilot, and Google Gemini become integral to development workflows, accidental leakage of API keys, database credentials, passwords, JWTs, and private keys into model training pipelines and remote logs represents a critical threat.

**PromptGuard** acts as an intelligent, zero-latency safety firewall directly inside your browser. It scans text in real time as you compose and intercepts submission events, giving you interactive controls to inspect, mask, redact, or bypass findings safely.

---

## ✨ Features

- **100% Local & Zero-Exfiltration**: Prompt detection and redaction happen purely inside the browser runtime. Zero prompt text, token, or secret ever leaves your device or touches an external server.
- **Pre-Submission Interception**: Intercepts Enter/Cmd+Enter keystrokes, form submissions, and send button clicks across ChatGPT, Claude, Gemini, and Copilot before any network packet is dispatched.
- **Granular Detection Engine**:
  - **API Keys**: OpenAI, Anthropic, AWS (AKIA/ASIA), GitHub PATs & Fine-Grained tokens, Google API keys, Stripe, Slack, HuggingFace, generic high-entropy keys.
  - **Passwords & Secrets**: Environment variable patterns (`PASSWORD=...`, `SECRET=...`), assignment operators, config keys.
  - **Auth Headers**: Bearer tokens, Basic HTTP auth.
  - **Database Credentials**: PostgreSQL, MySQL, MongoDB, Redis connection URIs with embedded user/password strings.
  - **Private Keys**: PEM RSA, EC, DSA, OpenSSH private key blocks.
  - **Personal Information**: Email addresses, phone numbers, SSNs, credit card numbers.
  - **Tokens & Signatures**: JSON Web Tokens (JWT), session cookies.
- **Interactive Shadow DOM Warning Modal**:
  - Clean, dark glassmorphism modal completely isolated from the host page's CSS and scripts via Shadow DOM.
  - Category badges, severity indicators (Critical, High, Medium, Low), and masked secret previews (no plaintext display).
  - **One-Click Redact All**: Replaces all sensitive values with typed placeholders (`[REDACTED_API_KEY]`, `[REDACTED_DATABASE_CREDENTIAL]`).
  - **Granular Redaction**: Choose which specific findings to redact and which to keep.
  - **Explicit Consent Bypass**: "Send Anyway" confirmation requiring deliberate user action for intentional sharing.
  - **Edit In-Place**: Make manual adjustments directly before sending.
- **Site-Specific Adapters**: Dedicated DOM adapters for ChatGPT, Claude, Gemini, and Copilot with generic fallback for custom AI web tools.
- **Modern Extension Popup**:
  - React 19 + TypeScript + CSS Modules dark interface.
  - Real-time protection status toggle (Global & Per-Site).
  - Scan history and lifetime threat counter.
  - Detection sensitivity controls (toggle specific categories).
  - Local export/reset of privacy settings.

---

## 📁 Architecture

```
PromptGuard/
├── manifest.json              # Manifest V3 configuration
├── vite.config.ts             # Vite + CRX build tooling
├── vitest.config.ts           # Test configuration with jsdom
├── src/
│   ├── types/index.ts         # Detection, Redaction & Settings type definitions
│   ├── engine/
│   │   ├── detector.ts        # Pure pattern & entropy detection engine
│   │   └── redactor.ts        # Overlap-safe replacement & masking engine
│   ├── adapters/
│   │   ├── chatgpt.ts         # OpenAI ChatGPT adapter
│   │   ├── claude.ts          # Anthropic Claude adapter
│   │   ├── gemini.ts          # Google Gemini adapter
│   │   ├── copilot.ts         # Microsoft Copilot adapter
│   │   ├── generic.ts         # Universal contenteditable/textarea fallback
│   │   └── registry.ts        # Adapter registry and active-site matcher
│   ├── content/
│   │   ├── index.ts           # Content script entry & event interceptor
│   │   └── warningUI.ts       # Shadow DOM warning overlay component
│   ├── background/
│   │   └── index.ts           # Service worker (tab tracking, stats, storage)
│   ├── popup/
│   │   ├── index.html         # Extension popup HTML entry
│   │   ├── main.tsx           # React root
│   │   ├── App.tsx            # Full-featured control panel
│   │   └── App.module.css     # Premium dark theme styling
│   └── tests/
│       ├── detector.test.ts   # 38 unit tests for regex & entropy rules
│       ├── redactor.test.ts   # 18 unit tests for redaction accuracy
│       └── privacy.test.ts    # 9 unit tests verifying zero exfiltration
└── icons/                     # Standard extension icons (16, 32, 48, 128)
```

---

## 🚀 Quick Start (Development & Installation)

### 1. Prerequisites
- Node.js 18+ and npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Tests
PromptGuard includes 65 comprehensive unit tests verifying detection coverage, redaction safety, and zero-leakage guarantees:
```bash
npm test
```

### 4. Build the Extension
```bash
npm run build
```
The compiled, production-ready extension will be output to the `dist/` directory.

### 5. Load into Chrome / Edge / Brave
1. Open your browser and navigate to the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` directory inside this project:  
   `C:\Users\archi\Desktop\Promptguard\dist`
5. PromptGuard is now active! The shield icon will appear in your browser toolbar.

---

## 🧪 Testing the Extension

Once loaded into your browser, navigate to any supported AI assistant (e.g., https://chatgpt.com or https://claude.ai):

### Test 1: Benign Text (Zero Interruption)
Type:
```
How do I implement binary search in Python?
```
Press Enter. The prompt submits normally without any modal or delay.

### Test 2: Accidental Secret Leak (Interactive Interception)
Type:
```
Please debug this database error:
DATABASE_URL=postgres://app_user:SuperSecretPassword123!@db.production.internal:5432/core
```
Press Enter or click the Send button.

**Result**:
- Submission is immediately paused.
- The PromptGuard warning modal smoothly fades in over the page.
- The credential is identified with a `Critical` badge.
- Clicking **Redact All & Send** replaces the secret with `postgres://[REDACTED_DB_CREDENTIALS]@db.production.internal:5432/core` and submits cleanly.
- Clicking **Send Anyway** prompts for confirmation before allowing the unaltered prompt through.

---

## 🛡️ Security & Privacy Architecture

- **No Remote Telemetry**: PromptGuard does not make network requests to analytics servers, external APIs, or logging systems.
- **Isolated DOM (Shadow Root)**: The warning modal is injected inside an open Shadow Root with encapsulated CSS resets, guaranteeing zero collision with the host page and preventing host scripts from easily accessing warning modal input states.
- **Safe Masking in UI**: Any identified token is partially masked (e.g. `sk-proj-•••••••••••••`) in both the popup and warning UI so secrets are never displayed in plain view over shoulder-surfers or screen recordings.

---

## 📄 License

MIT License. Designed and built with privacy-first engineering principles.
