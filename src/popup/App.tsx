import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldOff, ShieldCheck, Settings, RefreshCw,
  AlertTriangle, CheckCircle, Info, Lock, Zap, Globe,
  ToggleLeft, ToggleRight, Activity, X, Mail, Phone,
  Key, Database, FileKey, Cpu, Hash, CreditCard, Fingerprint,
  MapPin, Calendar, Bitcoin, Terminal, Network, User, Building,
  Wallet, IdCard, Server
} from 'lucide-react';
import type { ExtensionSettings, SessionStats } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import styles from './App.module.css';

type Tab = 'main' | 'settings' | 'privacy';

const SITE_CONFIG = [
  { id: 'chatgpt.com', name: 'ChatGPT', hostname: 'chatgpt.com', icon: '🤖', colorKey: 'chatgpt', activeColor: '#059669' },
  { id: 'claude.ai', name: 'Claude', hostname: 'claude.ai', icon: '🧠', colorKey: 'claude', activeColor: '#ea580c' },
  { id: 'gemini.google.com', name: 'Google Gemini', hostname: 'gemini.google.com', icon: '✨', colorKey: 'gemini', activeColor: '#2563eb' },
  { id: 'copilot.microsoft.com', name: 'Microsoft Copilot', hostname: 'copilot.microsoft.com', icon: '💠', colorKey: 'copilot', activeColor: '#0284c7' },
];

// ── Category metadata ───────────────────────────────────────────────────────

interface CategoryMeta {
  label: string;
  severity: string;
  group: 'credentials' | 'pii' | 'advanced';
  icon: React.ReactNode;
  description: string;
}

const CATEGORIES: Record<string, CategoryMeta> = {
  // Credentials group
  api_key: {
    label: 'API Keys',
    severity: 'critical',
    group: 'credentials',
    icon: <Key size={13} />,
    description: 'OpenAI, GitHub, AWS, Google, Stripe…',
  },
  private_key: {
    label: 'Private Keys (PEM)',
    severity: 'critical',
    group: 'credentials',
    icon: <FileKey size={13} />,
    description: 'RSA, EC, DSA cryptographic keys',
  },
  ssh_key: {
    label: 'SSH Keys',
    severity: 'critical',
    group: 'credentials',
    icon: <Terminal size={13} />,
    description: 'SSH private and public key blocks',
  },
  auth_header: {
    label: 'Auth Headers',
    severity: 'critical',
    group: 'credentials',
    icon: <Shield size={13} />,
    description: 'Bearer tokens, Basic auth headers',
  },
  database_credentials: {
    label: 'Database Credentials',
    severity: 'critical',
    group: 'credentials',
    icon: <Database size={13} />,
    description: 'PostgreSQL, MySQL, MongoDB, Redis URIs',
  },
  password: {
    label: 'Passwords & Secrets',
    severity: 'high',
    group: 'credentials',
    icon: <Lock size={13} />,
    description: 'Password/secret variable assignments',
  },
  access_token: {
    label: 'Access Tokens',
    severity: 'high',
    group: 'credentials',
    icon: <Zap size={13} />,
    description: 'OAuth & session token assignments',
  },
  jwt: {
    label: 'JWT Tokens',
    severity: 'high',
    group: 'credentials',
    icon: <Cpu size={13} />,
    description: 'JSON Web Tokens (eyJ… format)',
  },
  crypto_wallet: {
    label: 'Crypto Wallet Addresses',
    severity: 'high',
    group: 'credentials',
    icon: <Wallet size={13} />,
    description: 'Bitcoin and Ethereum wallet addresses',
  },

  // PII group
  ssn: {
    label: 'Social Security Numbers',
    severity: 'critical',
    group: 'pii',
    icon: <IdCard size={13} />,
    description: 'US SSN (xxx-xx-xxxx format)',
  },
  credit_card: {
    label: 'Credit / Debit Cards',
    severity: 'critical',
    group: 'pii',
    icon: <CreditCard size={13} />,
    description: 'Visa, Mastercard, Amex, Discover…',
  },
  national_id: {
    label: 'National IDs',
    severity: 'high',
    group: 'pii',
    icon: <Fingerprint size={13} />,
    description: 'Aadhaar, PAN, passport numbers',
  },
  iban: {
    label: 'Bank Accounts (IBAN)',
    severity: 'high',
    group: 'pii',
    icon: <Building size={13} />,
    description: 'International bank account numbers',
  },
  email: {
    label: 'Email Addresses',
    severity: 'medium',
    group: 'pii',
    icon: <Mail size={13} />,
    description: 'Any email address pattern',
  },
  phone: {
    label: 'Phone Numbers',
    severity: 'medium',
    group: 'pii',
    icon: <Phone size={13} />,
    description: 'International phone number formats',
  },
  date_of_birth: {
    label: 'Date of Birth',
    severity: 'medium',
    group: 'pii',
    icon: <Calendar size={13} />,
    description: 'DOB keyword followed by a date',
  },
  physical_address: {
    label: 'Physical Addresses',
    severity: 'medium',
    group: 'pii',
    icon: <MapPin size={13} />,
    description: 'Street/mailing address patterns',
  },

  // Advanced / Heuristic group
  ip_address: {
    label: 'Private IP Addresses',
    severity: 'low',
    group: 'advanced',
    icon: <Network size={13} />,
    description: '192.168.x.x, 10.x.x.x, 172.16-31.x.x',
  },
  high_entropy: {
    label: 'High-Entropy Strings',
    severity: 'low',
    group: 'advanced',
    icon: <Hash size={13} />,
    description: 'Heuristic — may have false positives',
  },
};

const GROUP_LABELS: Record<string, string> = {
  credentials: '🔑 Credentials & Tokens',
  pii: '👤 Personal Information (PII)',
  advanced: '🔬 Advanced Heuristics',
};

const GROUP_COLORS: Record<string, string> = {
  credentials: 'credentials',
  pii: 'pii',
  advanced: 'advanced',
};

// ── Messaging ───────────────────────────────────────────────────────────────

function sendMessage(type: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      resolve(response);
    });
  });
}

// ── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<SessionStats>({
    scans: 0, warnings: 0, redactions: 0, allowedOverrides: 0, cancellations: 0,
  });
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [currentSite, setCurrentSite] = useState<{ hostname: string; isSupported: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [genericPermissionState, setGenericPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  const reload = useCallback(async () => {
    const [settingsRes, statsRes] = await Promise.all([
      sendMessage('GET_SETTINGS') as Promise<{ success: boolean; data: ExtensionSettings }>,
      sendMessage('GET_SESSION_STATS') as Promise<{ success: boolean; data: SessionStats }>,
    ]);
    if (settingsRes?.success) setSettings(settingsRes.data);
    if (statsRes?.success) setStats(statsRes.data);
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          const isSupported = SITE_CONFIG.some((s) => s.hostname === hostname) ||
            settings.genericAdapterSites.includes(hostname);
          setCurrentSite({ hostname, isSupported });
        } catch { /* ignore non-URL tabs */ }
      }
    });
  }, [settings]);

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const saveSettings = useCallback(async (patch: Partial<ExtensionSettings>) => {
    setSaving(true);
    const merged = { ...settings, ...patch };
    setSettings(merged);
    await sendMessage('SET_SETTINGS', merged);
    setSaving(false);
  }, [settings]);

  const toggleProtection = useCallback(async () => {
    await saveSettings({ protectionEnabled: !settings.protectionEnabled });
  }, [settings, saveSettings]);

  const toggleCategory = useCallback(async (cat: string) => {
    const newCats = {
      ...settings.detection.categories,
      [cat]: !settings.detection.categories[cat as keyof typeof settings.detection.categories],
    };
    await saveSettings({
      detection: { ...settings.detection, categories: newCats as any },
    });
  }, [settings, saveSettings]);

  const toggleSite = useCallback(async (hostname: string) => {
    const newSites = {
      ...settings.enabledSites,
      [hostname]: !settings.enabledSites[hostname],
    };
    await saveSettings({ enabledSites: newSites });
  }, [settings, saveSettings]);

  const resetSession = useCallback(async () => {
    await sendMessage('RESET_SESSION');
    await reload();
    setResetConfirm(false);
  }, [reload]);

  const enableGenericAdapter = useCallback(async () => {
    if (!currentSite) return;
    setGenericPermissionState('requesting');
    const res = await sendMessage('REQUEST_HOST_PERMISSION', { origin: `https://${currentSite.hostname}` }) as any;
    if (res?.data?.granted) {
      setGenericPermissionState('granted');
      const newGeneric = [...new Set([...settings.genericAdapterSites, currentSite.hostname])];
      const newSites = { ...settings.enabledSites, [currentSite.hostname]: true };
      await saveSettings({ genericAdapterSites: newGeneric, enabledSites: newSites });
    } else {
      setGenericPermissionState('denied');
    }
  }, [currentSite, settings, saveSettings]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <span>Loading PromptGuard…</span>
      </div>
    );
  }

  const isSupportedSite = currentSite && SITE_CONFIG.some((s) => s.hostname === currentSite.hostname);
  const isGenericSite = currentSite && settings.genericAdapterSites.includes(currentSite.hostname);
  const protectionStatus = !settings.protectionEnabled
    ? 'off'
    : isSupportedSite && settings.enabledSites[currentSite!.hostname]
    ? 'active'
    : isGenericSite
    ? 'generic'
    : 'unsupported';

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <img src="/icons/icon32.png" alt="PromptGuard" className={styles.logoImage} />
          </div>
          <div>
            <div className={styles.logoText}>PromptGuard</div>
            <div className={styles.logoTagline}>Privacy • Security • Control</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {saving && <div className={styles.savingDot} title="Saving…" />}
          <button
            className={styles.masterToggle}
            onClick={toggleProtection}
            title={settings.protectionEnabled ? 'Disable protection' : 'Enable protection'}
            aria-label={settings.protectionEnabled ? 'Disable PromptGuard protection' : 'Enable PromptGuard protection'}
          >
            {settings.protectionEnabled
              ? <ToggleRight size={30} color="#a5f3c8" />
              : <ToggleLeft size={30} color="rgba(255,255,255,0.35)" />
            }
          </button>
        </div>
      </header>

      {/* Status Banner */}
      <div className={`${styles.statusBanner} ${styles[`status_${protectionStatus}`]}`}>
        <div className={styles.statusLeft}>
          {protectionStatus === 'active' && <ShieldCheck size={16} />}
          {protectionStatus === 'off' && <ShieldOff size={16} />}
          {protectionStatus === 'generic' && <Globe size={16} />}
          {protectionStatus === 'unsupported' && <AlertTriangle size={16} />}
          <div>
            <div className={styles.statusLabel}>
              {protectionStatus === 'active' && 'Protection Active'}
              {protectionStatus === 'off' && 'Protection Disabled'}
              {protectionStatus === 'generic' && 'Generic Protection'}
              {protectionStatus === 'unsupported' && 'Site Not Supported'}
            </div>
            {currentSite && (
              <div className={styles.statusSite}>
                {protectionStatus === 'active' && 'Monitoring sensitive data in submissions'}
                {protectionStatus === 'off' && 'Enable the toggle to activate'}
                {protectionStatus === 'generic' && 'Using generic adapter — not fully verified'}
                {protectionStatus === 'unsupported' && currentSite.hostname}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['main', 'settings', 'privacy'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'main' && <Activity size={13} />}
            {tab === 'settings' && <Settings size={13} />}
            {tab === 'privacy' && <Lock size={13} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {activeTab === 'main' && (
          <MainTab
            stats={stats}
            settings={settings}
            currentSite={currentSite}
            siteConfig={SITE_CONFIG}
            onToggleSite={toggleSite}
            onResetSession={() => setResetConfirm(true)}
            onEnableGeneric={enableGenericAdapter}
            genericState={genericPermissionState}
            protectionStatus={protectionStatus}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onToggleCategory={toggleCategory}
            onSaveSettings={saveSettings}
          />
        )}
        {activeTab === 'privacy' && <PrivacyTab />}
      </div>

      {/* Reset Confirm */}
      {resetConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard}>
            <h3 className={styles.confirmTitle}>Reset Session?</h3>
            <p className={styles.confirmText}>This will clear all session counters. Your conversation history on AI websites will not be affected.</p>
            <div className={styles.confirmActions}>
              <button className={styles.btnSecondary} onClick={() => setResetConfirm(false)}>Cancel</button>
              <button className={styles.btnDanger} onClick={resetSession}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

function MainTab({ stats, settings, currentSite, siteConfig, onToggleSite, onResetSession, onEnableGeneric, genericState, protectionStatus }: {
  stats: SessionStats;
  settings: ExtensionSettings;
  currentSite: { hostname: string; isSupported: boolean } | null;
  siteConfig: typeof SITE_CONFIG;
  onToggleSite: (hostname: string) => void;
  onResetSession: () => void;
  onEnableGeneric: () => void;
  genericState: string;
  protectionStatus: string;
}) {
  const isUnknownSite = currentSite &&
    !siteConfig.some((s) => s.hostname === currentSite.hostname) &&
    !settings.genericAdapterSites.includes(currentSite.hostname);

  return (
    <div className={styles.tabContent}>
      {/* Session Stats */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Session Statistics</span>
          <button className={styles.resetBtn} onClick={onResetSession} title="Reset session counters">
            <RefreshCw size={11} /> Reset
          </button>
        </div>
        <div className={styles.statsGrid}>
          <StatCard value={stats.scans} label="Scans" icon={<Zap size={14} />} color="blue" />
          <StatCard value={stats.warnings} label="Warnings" icon={<AlertTriangle size={14} />} color="amber" />
          <StatCard value={stats.redactions} label="Redacted" icon={<ShieldCheck size={14} />} color="green" />
          <StatCard value={stats.cancellations} label="Cancelled" icon={<X size={14} />} color="slate" />
        </div>
      </section>

      {/* Enable on this site */}
      {isUnknownSite && settings.protectionEnabled && (
        <section className={styles.section}>
          <div className={styles.enableSiteCard}>
            <div className={styles.enableSiteIcon}><Globe size={18} /></div>
            <div className={styles.enableSiteText}>
              <div className={styles.enableSiteTitle}>Enable on this website?</div>
              <div className={styles.enableSiteDesc}>
                <strong>{currentSite!.hostname}</strong> is not in the built-in list.
                Try the generic adapter — it uses heuristics and may not intercept all submissions.
              </div>
            </div>
            <button
              className={styles.btnPrimary}
              onClick={onEnableGeneric}
              disabled={genericState === 'requesting'}
            >
              {genericState === 'idle' && 'Enable'}
              {genericState === 'requesting' && 'Requesting…'}
              {genericState === 'granted' && <><CheckCircle size={13} /> Granted</>}
              {genericState === 'denied' && 'Denied'}
            </button>
          </div>
        </section>
      )}

      {/* Supported Sites */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Supported Sites</div>
        <div className={styles.siteList}>
          {siteConfig.map((site) => {
            const isEnabled = settings.enabledSites[site.hostname] ?? true;
            const isCurrent = currentSite?.hostname === site.hostname;
            return (
              <div
                key={site.id}
                className={`${styles.siteItem} ${isCurrent ? styles.siteItemCurrent : ''}`}
              >
                <div className={`${styles.siteIconBox} ${styles[`siteIconBox_${site.colorKey}`]}`}>
                  {site.icon}
                </div>
                <div className={styles.siteInfo}>
                  <div className={styles.siteName}>{site.name}</div>
                  <div className={styles.siteStatus}>
                    {isEnabled && settings.protectionEnabled
                      ? <><span className={styles.dotGreen} /><span style={{ color: site.activeColor, fontWeight: 600 }}>Active</span></>
                      : <><span className={styles.dotGray} />Disabled</>
                    }
                    {isCurrent && <span className={styles.currentBadge}>Current</span>}
                  </div>
                </div>
                <button
                  className={`${styles.siteToggle} ${isEnabled ? styles.siteToggleOn : styles.siteToggleOff}`}
                  onClick={() => onToggleSite(site.hostname)}
                  aria-label={`${isEnabled ? 'Disable' : 'Enable'} protection on ${site.name}`}
                >
                  {isEnabled
                    ? <ToggleRight size={22} color={site.activeColor} />
                    : <ToggleLeft size={22} color="#d1d5db" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ value, label, icon, color }: { value: number; label: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`${styles.statCard} ${styles[`statCard_${color}`]}`}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ settings, onToggleCategory, onSaveSettings }: {
  settings: ExtensionSettings;
  onToggleCategory: (cat: string) => void;
  onSaveSettings: (patch: Partial<ExtensionSettings>) => Promise<void>;
}) {
  const groups: Array<'credentials' | 'pii' | 'advanced'> = ['credentials', 'pii', 'advanced'];

  return (
    <div className={styles.tabContent}>
      {/* Sensitivity */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Sensitivity Mode</div>
        <div className={styles.sensitivityOptions}>
          {(['balanced', 'strict'] as const).map((mode) => (
            <button
              key={mode}
              className={`${styles.sensitivityBtn} ${settings.detection.sensitivity === mode ? styles.sensitivityActive : ''}`}
              onClick={() => onSaveSettings({
                detection: { ...settings.detection, sensitivity: mode },
              })}
            >
              <span className={styles.sensitivityLabel}>
                {mode === 'balanced' ? <><Zap size={12} /> Balanced</> : <><Lock size={12} /> Strict</>}
              </span>
              <span className={styles.sensitivityDesc}>
                {mode === 'balanced' ? 'Stable patterns + conservative heuristics' : 'More heuristics, may have false positives'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Detection Categories — grouped */}
      {groups.map((group) => {
        const cats = Object.entries(CATEGORIES).filter(([, m]) => m.group === group);
        return (
          <section key={group} className={styles.section}>
            <div className={`${styles.categoryGroupHeader} ${styles[`categoryGroupHeader_${group}`]}`}>
              <span className={styles.categoryGroupTitle}>{GROUP_LABELS[group]}</span>
            </div>
            <div className={styles.categoryList}>
              {cats.map(([cat, meta]) => {
                const enabled = settings.detection.categories[cat as keyof typeof settings.detection.categories];
                return (
                  <div
                    key={cat}
                    className={styles.categoryItem}
                    data-severity={meta.severity}
                  >
                    <div className={styles.categoryLeft}>
                      <div className={styles.categoryLabelRow}>
                        <span className={styles.categoryIcon}>{meta.icon}</span>
                        <span className={styles.categoryLabel}>{meta.label}</span>
                        <span className={`${styles.categoryBadge} ${styles[`badge_${meta.severity}`]}`}>
                          {meta.severity}
                        </span>
                      </div>
                      <div className={styles.categoryDesc}>{meta.description}</div>
                    </div>
                    <button
                      className={styles.toggle}
                      onClick={() => onToggleCategory(cat)}
                      aria-label={`${enabled ? 'Disable' : 'Enable'} detection for ${meta.label}`}
                      aria-pressed={enabled}
                    >
                      {enabled
                        ? <ToggleRight size={24} color="#5b5ef6" />
                        : <ToggleLeft size={24} color="#d1d5db" />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Warning Behavior */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Warning Behavior</div>
        <div className={styles.categoryList}>
          <div className={styles.categoryItem} data-severity="">
            <div className={styles.categoryLeft}>
              <div className={styles.categoryLabelRow}>
                <span className={styles.categoryIcon}><CheckCircle size={13} /></span>
                <span className={styles.categoryLabel}>Auto-select all findings</span>
              </div>
              <div className={styles.categoryDesc}>Pre-check all findings in the warning dialog</div>
            </div>
            <button
              className={styles.toggle}
              onClick={() => onSaveSettings({
                warningBehavior: {
                  ...settings.warningBehavior,
                  autoSelectAllForRedaction: !settings.warningBehavior.autoSelectAllForRedaction,
                },
              })}
              aria-label="Toggle auto-select all findings"
              aria-pressed={settings.warningBehavior.autoSelectAllForRedaction}
            >
              {settings.warningBehavior.autoSelectAllForRedaction
                ? <ToggleRight size={24} color="#6366f1" />
                : <ToggleLeft size={24} color="#94a3b8" />
              }
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Privacy Tab ──────────────────────────────────────────────────────────────

function PrivacyTab() {
  const items = [
    {
      icon: <Lock size={16} color="#6366f1" />,
      bg: 'rgba(99,102,241,0.1)',
      title: 'Local-only scanning',
      desc: 'All detection runs inside your browser. Your prompt text is never sent to PromptGuard servers.',
    },
    {
      icon: <ShieldCheck size={16} color="#10b981" />,
      bg: 'rgba(16,185,129,0.1)',
      title: 'No prompt storage',
      desc: 'PromptGuard does not write your prompts to browser storage, cookies, or any database.',
    },
    {
      icon: <Activity size={16} color="#3b82f6" />,
      bg: 'rgba(59,130,246,0.1)',
      title: 'No telemetry',
      desc: 'No analytics, tracking, or telemetry. Session counters contain only numbers, not content.',
    },
    {
      icon: <Globe size={16} color="#f59e0b" />,
      bg: 'rgba(245,158,11,0.1)',
      title: 'AI provider independence',
      desc: 'Whatever you submit through an AI website is governed by that provider\'s privacy policy. PromptGuard cannot control their data handling.',
    },
    {
      icon: <Key size={16} color="#8b5cf6" />,
      bg: 'rgba(139,92,246,0.1)',
      title: 'Minimal permissions',
      desc: 'PromptGuard requests only the minimum permissions needed. Generic site access requires your explicit consent each time.',
    },
    {
      icon: <AlertTriangle size={16} color="#ef4444" />,
      bg: 'rgba(239,68,68,0.1)',
      title: 'Honest limitations',
      desc: 'PromptGuard cannot detect every possible secret or guarantee zero false positives. Pattern matching is not proof of real credential validity.',
    },
    {
      icon: <Fingerprint size={16} color="#06b6d4" />,
      bg: 'rgba(6,182,212,0.1)',
      title: 'PII detection scope',
      desc: 'Detection covers 19+ sensitive data types including credentials, PII, financial data, and government IDs — all processed locally.',
    },
  ];

  return (
    <div className={styles.tabContent}>
      <div className={styles.privacyHeader}>
        <Lock size={18} color="#6366f1" />
        <h3 className={styles.privacyTitle}>Privacy Statement</h3>
      </div>
      <p className={styles.privacyIntro}>
        PromptGuard is designed as a local, privacy-first tool. Here's exactly what it does and doesn't do:
      </p>
      <div className={styles.privacyList}>
        {items.map((item, i) => (
          <div key={i} className={styles.privacyItem}>
            <div className={styles.privacyItemIconBox} style={{ background: item.bg }}>
              {item.icon}
            </div>
            <div>
              <div className={styles.privacyItemTitle}>{item.title}</div>
              <div className={styles.privacyItemDesc}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
