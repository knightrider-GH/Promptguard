import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldOff, ShieldCheck, Settings, RefreshCw,
  Eye, EyeOff, AlertTriangle, CheckCircle, Info, ChevronDown,
  ChevronUp, Lock, Zap, Globe, ToggleLeft, ToggleRight,
  Activity, X
} from 'lucide-react';
import type { ExtensionSettings, SessionStats } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import styles from './App.module.css';

type Tab = 'main' | 'settings' | 'privacy';

const SITE_CONFIG = [
  { id: 'chatgpt.com', name: 'ChatGPT', hostname: 'chatgpt.com', icon: '🤖' },
  { id: 'claude.ai', name: 'Claude', hostname: 'claude.ai', icon: '🧠' },
  { id: 'gemini.google.com', name: 'Google Gemini', hostname: 'gemini.google.com', icon: '✨' },
  { id: 'copilot.microsoft.com', name: 'Microsoft Copilot', hostname: 'copilot.microsoft.com', icon: '💠' },
];

const CATEGORY_LABELS: Record<string, string> = {
  email: 'Email Addresses',
  phone: 'Phone Numbers',
  api_key: 'API Keys',
  password: 'Passwords & Secrets',
  access_token: 'Access Tokens',
  auth_header: 'Auth Headers',
  database_credentials: 'Database Credentials',
  private_key: 'Private Keys',
  jwt: 'JWT Tokens',
  high_entropy: 'High-Entropy Strings (Beta)',
};

const CATEGORY_SEVERITY: Record<string, string> = {
  email: 'medium',
  phone: 'medium',
  api_key: 'critical',
  password: 'high',
  access_token: 'high',
  auth_header: 'critical',
  database_credentials: 'critical',
  private_key: 'critical',
  jwt: 'high',
  high_entropy: 'low',
};

function sendMessage(type: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      resolve(response);
    });
  });
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<SessionStats>({
    scans: 0, warnings: 0, redactions: 0, allowedOverrides: 0, cancellations: 0,
  });
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [currentSite, setCurrentSite] = useState<{ hostname: string; isSupported: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [genericPermissionState, setGenericPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  // Load settings and stats
  const reload = useCallback(async () => {
    const [settingsRes, statsRes] = await Promise.all([
      sendMessage('GET_SETTINGS') as Promise<{ success: boolean; data: ExtensionSettings }>,
      sendMessage('GET_SESSION_STATS') as Promise<{ success: boolean; data: SessionStats }>,
    ]);
    if (settingsRes?.success) setSettings(settingsRes.data);
    if (statsRes?.success) setStats(statsRes.data);
  }, []);

  // Detect current site
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
              ? <ToggleRight size={28} color="#6366f1" />
              : <ToggleLeft size={28} color="#475569" />
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
                {protectionStatus === 'active' && 'Monitoring compatible submissions'}
                {protectionStatus === 'off' && 'Enable the toggle to activate'}
                {protectionStatus === 'generic' && 'Using generic adapter (not fully verified)'}
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
            <RefreshCw size={12} /> Reset
          </button>
        </div>
        <div className={styles.statsGrid}>
          <StatCard value={stats.scans} label="Scans" icon={<Zap size={14} />} color="blue" />
          <StatCard value={stats.warnings} label="Warnings" icon={<AlertTriangle size={14} />} color="amber" />
          <StatCard value={stats.redactions} label="Redactions" icon={<ShieldCheck size={14} />} color="green" />
          <StatCard value={stats.cancellations} label="Cancelled" icon={<X size={14} />} color="slate" />
        </div>
      </section>

      {/* Enable on this site */}
      {isUnknownSite && settings.protectionEnabled && (
        <section className={styles.section}>
          <div className={styles.enableSiteCard}>
            <div className={styles.enableSiteIcon}><Globe size={20} /></div>
            <div className={styles.enableSiteText}>
              <div className={styles.enableSiteTitle}>Enable on this website?</div>
              <div className={styles.enableSiteDesc}>
                <strong>{currentSite!.hostname}</strong> is not in the built-in list.
                You can try the generic adapter — it uses heuristics and may not intercept all submissions.
              </div>
            </div>
            <button
              className={styles.btnPrimary}
              onClick={onEnableGeneric}
              disabled={genericState === 'requesting'}
            >
              {genericState === 'idle' && 'Enable'}
              {genericState === 'requesting' && 'Requesting…'}
              {genericState === 'granted' && <><CheckCircle size={14} /> Granted</>}
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
                <span className={styles.siteIcon}>{site.icon}</span>
                <div className={styles.siteInfo}>
                  <div className={styles.siteName}>{site.name}</div>
                  <div className={styles.siteStatus}>
                    {isEnabled && settings.protectionEnabled
                      ? <><span className={styles.dotGreen} />Active</>
                      : <><span className={styles.dotGray} />Disabled</>
                    }
                    {isCurrent && <span className={styles.currentBadge}>Current</span>}
                  </div>
                </div>
                <button
                  className={`${styles.siteToggle} ${isEnabled ? styles.siteToggleOn : ''}`}
                  onClick={() => onToggleSite(site.hostname)}
                  aria-label={`${isEnabled ? 'Disable' : 'Enable'} protection on ${site.name}`}
                >
                  {isEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
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
  return (
    <div className={styles.tabContent}>
      {/* Sensitivity */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Sensitivity</div>
        <div className={styles.sensitivityOptions}>
          {(['balanced', 'strict'] as const).map((mode) => (
            <button
              key={mode}
              className={`${styles.sensitivityBtn} ${settings.detection.sensitivity === mode ? styles.sensitivityActive : ''}`}
              onClick={() => onSaveSettings({
                detection: { ...settings.detection, sensitivity: mode },
              })}
            >
              <span className={styles.sensitivityLabel}>{mode === 'balanced' ? '⚖️ Balanced' : '🔒 Strict'}</span>
              <span className={styles.sensitivityDesc}>
                {mode === 'balanced' ? 'Stable patterns + conservative heuristics' : 'More heuristics, may have false positives'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Detection Categories */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Detection Categories</div>
        <div className={styles.categoryList}>
          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
            const enabled = settings.detection.categories[cat as keyof typeof settings.detection.categories];
            const sev = CATEGORY_SEVERITY[cat] ?? 'low';
            return (
              <div key={cat} className={styles.categoryItem}>
                <div className={styles.categoryLeft}>
                  <div className={styles.categoryLabel}>{label}</div>
                  <div className={`${styles.categoryBadge} ${styles[`badge_${sev}`]}`}>
                    {sev}
                  </div>
                </div>
                <button
                  className={styles.toggle}
                  onClick={() => onToggleCategory(cat)}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} detection for ${label}`}
                  aria-pressed={enabled}
                >
                  {enabled
                    ? <ToggleRight size={24} color="#6366f1" />
                    : <ToggleLeft size={24} color="#475569" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Warning Behavior */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Warning Behavior</div>
        <div className={styles.categoryList}>
          <div className={styles.categoryItem}>
            <div className={styles.categoryLeft}>
              <div className={styles.categoryLabel}>Auto-select all findings for redaction</div>
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
                : <ToggleLeft size={24} color="#475569" />
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
    { icon: '🔒', title: 'Local-only scanning', desc: 'All detection runs inside your browser. Your prompt text is never sent to PromptGuard servers.' },
    { icon: '🚫', title: 'No prompt storage', desc: 'PromptGuard does not write your prompts to browser storage, cookies, or any database.' },
    { icon: '🧹', title: 'No telemetry', desc: 'No analytics, tracking, or telemetry. Session counters contain only numbers, not content.' },
    { icon: '🌐', title: 'AI provider independence', desc: 'Whatever you submit through an AI website is governed by that provider\'s privacy policy. PromptGuard cannot control their data handling.' },
    { icon: '📋', title: 'Limited permissions', desc: 'PromptGuard requests only the minimum permissions needed. Generic site access requires your explicit consent.' },
    { icon: '⚠️', title: 'Honest limitations', desc: 'PromptGuard cannot detect every possible secret or guarantee zero false positives. Pattern matching is not proof of real credential validity.' },
  ];

  return (
    <div className={styles.tabContent}>
      <div className={styles.privacyHeader}>
        <Lock size={20} color="#6366f1" />
        <h3 className={styles.privacyTitle}>Privacy Statement</h3>
      </div>
      <p className={styles.privacyIntro}>
        PromptGuard is designed as a local, privacy-first tool. Here's exactly what it does and doesn't do:
      </p>
      <div className={styles.privacyList}>
        {items.map((item, i) => (
          <div key={i} className={styles.privacyItem}>
            <span className={styles.privacyItemIcon}>{item.icon}</span>
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
