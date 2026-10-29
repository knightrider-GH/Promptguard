/**
 * PromptGuard Warning UI
 *
 * Injected into the page using Shadow DOM to isolate styles.
 * Renders the security warning with detection findings and user actions.
 */

import type { Detection, ExtensionSettings } from '../types';

export interface WarningUIOptions {
  detections: Detection[];
  promptText: string;
  onRedactAndSend: (selectedIds: string[], detections: Detection[]) => Promise<void>;
  onSendAnyway: () => Promise<void>;
  onCancel: () => void;
  settings: ExtensionSettings;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6b7280',
};

const CATEGORY_ICONS: Record<string, string> = {
  api_key: '🔑',
  private_key: '🗝️',
  ssh_key: '💻',
  auth_header: '🛡️',
  database_credentials: '🗄️',
  password: '🔒',
  access_token: '⚡',
  jwt: '🪙',
  crypto_wallet: '💰',
  ssn: '🪪',
  credit_card: '💳',
  national_id: '🪪',
  iban: '🏦',
  email: '📧',
  phone: '📱',
  date_of_birth: '📅',
  physical_address: '📍',
  ip_address: '🌐',
  high_entropy: '🔬',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export class WarningUI {
  private options: WarningUIOptions;
  private hostEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private selectedIds: Set<string>;
  private showSendAnywayConfirm = false;

  constructor(options: WarningUIOptions) {
    this.options = options;
    this.selectedIds = new Set(
      options.settings.warningBehavior.autoSelectAllForRedaction
        ? options.detections.map((d) => d.id)
        : [],
    );
  }

  mount(): void {
    this.hostEl = document.createElement('div');
    this.hostEl.id = 'promptguard-warning-host';
    this.hostEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    this.shadowRoot = this.hostEl.attachShadow({ mode: 'closed' });
    document.body.appendChild(this.hostEl);
    this.render();
  }

  destroy(): void {
    if (this.hostEl) {
      this.hostEl.remove();
      this.hostEl = null;
      this.shadowRoot = null;
    }
  }

  private render(): void {
    if (!this.shadowRoot) return;

    const { detections } = this.options;
    const criticalCount = detections.filter((d) => d.severity === 'critical').length;
    const highCount = detections.filter((d) => d.severity === 'high').length;
    const categories = [...new Set(detections.map((d) => d.label))];

    const html = `
      <style>${this.getStyles()}</style>
      <div class="overlay" id="pg-overlay" role="dialog" aria-modal="true" aria-labelledby="pg-title">
        <div class="modal" role="document">
          <div class="modal-header">
            <div class="header-left">
              <div class="shield-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div>
                <h2 id="pg-title" class="modal-title">Sensitive Information Detected</h2>
                <p class="modal-subtitle">Your message has <strong>not been sent</strong>. Review the findings below.</p>
              </div>
            </div>
            <button type="button" class="close-btn" id="pg-close" aria-label="Cancel and close">✕</button>
          </div>

          <div class="summary-bar">
            <div class="summary-chip ${criticalCount > 0 ? 'chip-critical' : 'chip-dim'}">
              <span class="chip-num">${detections.length}</span>
              <span class="chip-label">${detections.length === 1 ? 'Finding' : 'Findings'}</span>
            </div>
            ${criticalCount > 0 ? `<div class="summary-chip chip-critical"><span class="chip-num">${criticalCount}</span><span class="chip-label">Critical</span></div>` : ''}
            ${highCount > 0 ? `<div class="summary-chip chip-high"><span class="chip-num">${highCount}</span><span class="chip-label">High</span></div>` : ''}
            <div class="summary-categories">${categories.slice(0, 3).map((c) => `<span class="category-tag">${c}</span>`).join('')}${categories.length > 3 ? `<span class="category-tag">+${categories.length - 3} more</span>` : ''}</div>
          </div>

          <div class="findings-section">
            <div class="findings-controls">
              <span class="findings-title">Detected Findings</span>
              <div class="findings-actions">
                <button type="button" class="text-btn" id="pg-select-all">Select All</button>
                <span class="divider">|</span>
                <button type="button" class="text-btn" id="pg-deselect-all">Deselect All</button>
              </div>
            </div>
            <div class="findings-list" id="pg-findings-list">
              ${detections.map((d) => this.renderFinding(d)).join('')}
            </div>
          </div>

          ${this.showSendAnywayConfirm ? this.renderSendAnywayConfirm() : ''}

          <div class="modal-actions">
            <button type="button" class="btn btn-cancel" id="pg-cancel">Cancel</button>
            <button type="button" class="btn btn-send-anyway" id="pg-send-anyway">Send Anyway</button>
            <button type="button" class="btn btn-redact" id="pg-redact-send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
              Redact &amp; Send (${this.selectedIds.size} selected)
            </button>
          </div>

          <div class="privacy-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            All scanning happens locally in your browser. No prompt text is sent to PromptGuard servers.
          </div>
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = html;
    this.bindEvents();
  }

  private renderFinding(det: Detection): string {
    const isSelected = this.selectedIds.has(det.id);
    const color = SEVERITY_COLORS[det.severity] ?? '#6b7280';
    const label = SEVERITY_LABELS[det.severity] ?? det.severity.toUpperCase();
    const catIcon = CATEGORY_ICONS[det.category] ?? '⚠️';

    return `
      <div class="finding-item ${isSelected ? 'finding-selected' : ''}" data-id="${det.id}">
        <label class="finding-label">
          <input type="checkbox" class="finding-checkbox" data-id="${det.id}" ${isSelected ? 'checked' : ''} aria-label="Select ${det.label} for redaction" />
          <div class="finding-info">
            <div class="finding-header">
              <span class="finding-cat-icon">${catIcon}</span>
              <span class="finding-name">${escapeHtml(det.label)}</span>
              <span class="severity-badge" style="background: ${color}18; color: ${color}; border: 1px solid ${color}30;">${label}</span>
            </div>
            <div class="finding-excerpt">${escapeHtml(det.maskedExcerpt)}</div>
            <div class="finding-explanation">${escapeHtml(det.explanation)}</div>
          </div>
        </label>
      </div>
    `;
  }

  private renderSendAnywayConfirm(): string {
    return `
      <div class="confirm-panel" id="pg-confirm-panel" role="alertdialog" aria-labelledby="pg-confirm-title">
        <div class="confirm-icon">⚠️</div>
        <h3 id="pg-confirm-title" class="confirm-title">Are you sure?</h3>
        <p class="confirm-text">Your original message — including any sensitive information detected above — will be sent to the AI provider. This override applies to this message only. Future messages will still be checked.</p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-cancel-sm" id="pg-confirm-cancel">Go Back</button>
          <button type="button" class="btn btn-confirm-send" id="pg-confirm-send">Send Original Message</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.shadowRoot) return;

    // Close / Cancel
    this.shadowRoot.getElementById('pg-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.options.onCancel();
    });
    this.shadowRoot.getElementById('pg-cancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.options.onCancel();
    });

    // Select All / Deselect All
    this.shadowRoot.getElementById('pg-select-all')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIds = new Set(this.options.detections.map((d) => d.id));
      this.render();
    });
    this.shadowRoot.getElementById('pg-deselect-all')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIds = new Set();
      this.render();
    });

    // Individual checkboxes
    this.shadowRoot.querySelectorAll<HTMLInputElement>('.finding-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = cb.getAttribute('data-id')!;
        if (cb.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        this.render();
      });
    });

    // Redact and Send
    this.shadowRoot.getElementById('pg-redact-send')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.options.onRedactAndSend(
        [...this.selectedIds],
        this.options.detections,
      );
    });

    // Send Anyway — show confirm panel
    this.shadowRoot.getElementById('pg-send-anyway')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showSendAnywayConfirm = true;
      this.render();
    });

    // Confirm send anyway
    this.shadowRoot.getElementById('pg-confirm-send')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.options.onSendAnyway();
    });

    // Cancel confirm
    this.shadowRoot.getElementById('pg-confirm-cancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showSendAnywayConfirm = false;
      this.render();
    });

    // Overlay backdrop click — close on outside click
    this.shadowRoot.getElementById('pg-overlay')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).id === 'pg-overlay') {
        e.preventDefault();
        this.options.onCancel();
      }
    });

    // Keyboard: Escape to cancel
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.options.onCancel();
        document.removeEventListener('keydown', handleKey);
      }
    };
    document.addEventListener('keydown', handleKey);

    // Focus the first action button
    setTimeout(() => {
      const btn = this.shadowRoot?.getElementById('pg-cancel');
      btn?.focus();
    }, 50);
  }

  private getStyles(): string {
    return `
      :host { all: initial; }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        padding: 16px;
        pointer-events: all;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
        animation: fadeIn 0.15s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .modal {
        background: #0f172a;
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-radius: 16px;
        width: 100%;
        max-width: 560px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(239, 68, 68, 0.15);
        animation: slideUp 0.2s ease;
        scrollbar-width: thin;
        scrollbar-color: rgba(148,163,184,0.2) transparent;
      }

      @keyframes slideUp {
        from { transform: translateY(12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 20px 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .shield-icon {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      }

      .modal-title {
        font-size: 16px;
        font-weight: 700;
        color: #f1f5f9;
        letter-spacing: -0.01em;
        line-height: 1.3;
      }

      .modal-subtitle {
        font-size: 13px;
        color: #94a3b8;
        margin-top: 2px;
        line-height: 1.4;
      }

      .modal-subtitle strong {
        color: #fbbf24;
        font-weight: 600;
      }

      .close-btn {
        background: rgba(148, 163, 184, 0.1);
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 14px;
        border-radius: 8px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s, color 0.15s;
      }

      .close-btn:hover { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      .close-btn:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }

      .summary-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        background: rgba(239, 68, 68, 0.05);
        border-bottom: 1px solid rgba(239, 68, 68, 0.1);
        flex-wrap: wrap;
      }

      .summary-chip {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
      }

      .chip-critical { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
      .chip-high { background: rgba(249, 115, 22, 0.15); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3); }
      .chip-dim { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }

      .chip-num { font-size: 14px; font-weight: 700; }
      .chip-label { font-size: 11px; }

      .summary-categories {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-left: auto;
      }

      .category-tag {
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        border: 1px solid rgba(99, 102, 241, 0.2);
        padding: 2px 8px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 500;
      }

      .findings-section {
        padding: 16px 20px;
      }

      .findings-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .findings-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748b;
      }

      .findings-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .text-btn {
        background: none;
        border: none;
        color: #60a5fa;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.15s;
      }

      .text-btn:hover { color: #93c5fd; text-decoration: underline; }
      .text-btn:focus-visible { outline: 2px solid #60a5fa; }

      .divider { color: #334155; font-size: 12px; }

      .findings-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 280px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(148,163,184,0.2) transparent;
      }

      .finding-item {
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 10px;
        padding: 12px;
        background: rgba(30, 41, 59, 0.5);
        transition: border-color 0.15s, background 0.15s;
        cursor: pointer;
      }

      .finding-item:hover { border-color: rgba(99, 102, 241, 0.3); background: rgba(30, 41, 59, 0.8); }
      .finding-selected { border-color: rgba(99, 102, 241, 0.5) !important; background: rgba(99, 102, 241, 0.08) !important; }

      .finding-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        cursor: pointer;
        width: 100%;
      }

      .finding-checkbox {
        width: 16px;
        height: 16px;
        margin-top: 2px;
        accent-color: #6366f1;
        cursor: pointer;
        flex-shrink: 0;
      }

      .finding-info { flex: 1; min-width: 0; }

      .finding-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
        flex-wrap: wrap;
      }

      .finding-cat-icon {
        font-size: 14px;
        flex-shrink: 0;
      }

      .finding-name {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
      }

      .severity-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.05em;
      }

      .finding-excerpt {
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 12px;
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.08);
        border: 1px solid rgba(251, 191, 36, 0.15);
        padding: 4px 8px;
        border-radius: 6px;
        margin-bottom: 6px;
        word-break: break-all;
      }

      .finding-explanation {
        font-size: 12px;
        color: #64748b;
        line-height: 1.5;
      }

      .confirm-panel {
        margin: 0 20px;
        padding: 16px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 12px;
        text-align: center;
      }

      .confirm-icon { font-size: 28px; margin-bottom: 8px; }

      .confirm-title {
        font-size: 15px;
        font-weight: 700;
        color: #f87171;
        margin-bottom: 8px;
      }

      .confirm-text {
        font-size: 13px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 16px;
      }

      .confirm-actions {
        display: flex;
        gap: 8px;
        justify-content: center;
      }

      .modal-actions {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid rgba(148, 163, 184, 0.1);
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 9px 16px;
        border-radius: 9px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.15s;
        white-space: nowrap;
      }

      .btn:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }

      .btn-cancel {
        background: rgba(148, 163, 184, 0.1);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      .btn-cancel:hover { background: rgba(148, 163, 184, 0.15); color: #e2e8f0; }

      .btn-cancel-sm {
        background: rgba(148, 163, 184, 0.1);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.2);
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .btn-cancel-sm:hover { background: rgba(148,163,184,0.2); }

      .btn-send-anyway {
        background: rgba(249, 115, 22, 0.1);
        color: #f97316;
        border: 1px solid rgba(249, 115, 22, 0.3);
      }
      .btn-send-anyway:hover { background: rgba(249, 115, 22, 0.2); }

      .btn-redact {
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
      }
      .btn-redact:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4); }
      .btn-redact:active { transform: translateY(0); }

      .btn-confirm-send {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        transition: all 0.15s;
      }
      .btn-confirm-send:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239,68,68,0.4); }

      .privacy-note {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 20px 16px;
        font-size: 11px;
        color: #475569;
        line-height: 1.4;
      }

      .privacy-note svg { flex-shrink: 0; color: #334155; }
    `;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
