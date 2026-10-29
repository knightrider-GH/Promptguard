# PromptGuard 🛡️

A privacy-first Chrome extension that detects and intercepts credentials, secrets, and sensitive personal information (PII) in real time **before** they are submitted to AI assistants.

---

## 📸 Screenshots

| Extension Control Panel | Detection Categories |
| :---: | :---: |
| ![Extension Popup Main](docs/screenshots/popup-main.jpg) | ![Extension Settings](docs/screenshots/popup-settings.jpg) |

| Interception in Action (Google Gemini) | Real-Time Warning Modal |
| :---: | :---: |
| ![Gemini Detection](docs/screenshots/gemini-detection-demo.jpg) | ![Critical Warning Modal](docs/screenshots/warning-dialog-critical.png) |

---

## ⚡ Key Highlights

- **100% Client-Side Processing**: Zero network transmission of prompt text. All pattern matching and entropy evaluation runs purely inside your browser memory.
- **Pre-Flight Interception**: Intercepts Enter/Cmd+Enter keypresses and click events on submission buttons before network packets dispatch.
- **Selective & Full Redaction**: Redact all findings or choose specific items to sanitize with typed tokens (e.g. `[REDACTED_API_KEY]`, `[REDACTED_SSN]`).
- **Override with Confirmation**: Option to bypass protection for intentional testing via a deliberate confirmation step.
- **Shadow DOM UI**: Warning modals render inside a closed Shadow DOM, completely immune to parent website styling or script conflicts.

---

## 🔍 Supported Detection Categories

PromptGuard detects **19+ categories** organized across three operational groups:

### 1. 🔑 Credentials & Tokens (Critical / High)
* **API Keys**: OpenAI (`sk-...`), GitHub (classic PAT, fine-grained, OAuth), AWS (`AKIA...`), Google Cloud, Stripe, Slack, Twilio, SendGrid.
* **Cryptographic Keys**: PEM-encoded private keys (RSA, EC, DSA, OpenSSH).
* **SSH Keys**: OpenSSH private & public keys (`ssh-rsa`, `ssh-ed25519`).
* **Database URIs**: Connection strings with embedded credentials (PostgreSQL, MySQL, MongoDB, Redis).
* **HTTP Auth**: `Authorization: Bearer <token>`, `Basic <base64>`, custom token headers.
* **Secrets & Passwords**: Password assignments, secret keys, tokens.
* **Tokens**: JSON Web Tokens (JWT).
* **Crypto Wallets**: Bitcoin (`bc1...`, `1...`, `3...`) & Ethereum (`0x...`).

### 2. 👤 Personal Information & Identity (PII)
* **Government IDs**: US Social Security Numbers (SSN), Indian Aadhaar (`XXXX XXXX XXXX`), PAN card format, Passport identifiers.
* **Financial Details**: Credit & Debit Cards (Visa, Mastercard, Amex, Discover, JCB) and International Bank Account Numbers (IBAN).
* **Contact Information**: Email addresses and international phone numbers.
* **Personal Data**: Date of Birth (DOB) and physical street addresses.

### 3. 🔬 Advanced Heuristics
* **Network Topology**: Private IPv4 ranges (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`).
* **Shannon Entropy**: Identifies high-entropy unformatted secret tokens.

---

## 🌐 Supported Platforms

* **ChatGPT** (`chatgpt.com`, `chat.openai.com`)
* **Anthropic Claude** (`claude.ai`)
* **Google Gemini** (`gemini.google.com`)
* **Microsoft Copilot** (`copilot.microsoft.com`)
* **Universal Generic Adapter**: Optional heuristic fallback for custom AI web tools with explicit user permission.

---

## 🛠️ Installation & Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* npm

### Build from Source
```bash
# Clone the repository
git clone https://github.com/knightrider-GH/Promptguard.git
cd Promptguard

# Install dependencies
npm install

# Run unit tests (65 tests)
npm test

# Build the extension for production
npm run build
```

### Load into Chrome / Chromium
1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist/` directory generated inside the `Promptguard` folder.

---

## 🧪 Testing Prompts

You can test PromptGuard's interception in any supported chat interface using these synthetic test examples:

```text
Config setup:
DB_URL=postgresql://admin:SecretPass123@db.internal:5432/production
API_KEY=sk-proj-abc1234567890defghijklmnopqrstuvwxyz123456
SSN=123-45-6789
CARD=4111 2222 3333 4444
CONTACT=alex.smith@example.com or +1 (555) 234-5678
```

---

## 📄 License

MIT License. Designed with privacy in mind.
