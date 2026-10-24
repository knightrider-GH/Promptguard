// Core shared types for PromptGuard

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type DetectionCategory =
  | 'email'
  | 'phone'
  | 'api_key'
  | 'password'
  | 'access_token'
  | 'auth_header'
  | 'database_credentials'
  | 'private_key'
  | 'jwt'
  | 'high_entropy';

export interface Detection {
  id: string;
  category: DetectionCategory;
  label: string;
  severity: Severity;
  confidence: number; // 0–1
  start: number;
  end: number;
  maskedExcerpt: string;
  explanation: string;
  recommendation: string;
  ruleId: string;
}

export interface ScanResult {
  detections: Detection[];
  scannedAt: number;
  inputLength: number;
  scanId: string;
}

export interface RedactionResult {
  sanitizedText: string;
  redactedIds: string[];
  placeholderMap: Map<string, { category: string; placeholder: string }>;
}

export type SubmissionState =
  | 'idle'
  | 'scanning'
  | 'no_findings'
  | 'warning_required'
  | 'waiting_for_user_decision'
  | 'redacting'
  | 'ready_to_submit'
  | 'submitting'
  | 'cancelled'
  | 'blocked'
  | 'unsupported';

export type SiteProtectionStatus =
  | 'active'
  | 'enabled_unverified'
  | 'unsupported'
  | 'disabled'
  | 'permission_required'
  | 'generic_adapter';

export interface SiteInfo {
  siteId: string;
  siteName: string;
  url: string;
  status: SiteProtectionStatus;
  isCurrentSite: boolean;
}

export interface DetectionSettings {
  enabled: boolean;
  categories: Record<DetectionCategory, boolean>;
  sensitivity: 'balanced' | 'strict' | 'custom';
  entropyThreshold: number;
  entropyMinLength: number;
}

export interface SessionStats {
  scans: number;
  warnings: number;
  redactions: number;
  allowedOverrides: number;
  cancellations: number;
}

export interface ExtensionSettings {
  protectionEnabled: boolean;
  detection: DetectionSettings;
  warningBehavior: {
    autoSelectAllForRedaction: boolean;
    showFindingCount: boolean;
  };
  enabledSites: Record<string, boolean>;
  genericAdapterSites: string[];
}

export interface Message {
  type: string;
  payload?: unknown;
}

// Messages between content script and background
export type BackgroundMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; payload: Partial<ExtensionSettings> }
  | { type: 'GET_SESSION_STATS' }
  | { type: 'INCREMENT_STAT'; payload: keyof SessionStats }
  | { type: 'RESET_SESSION' }
  | { type: 'REQUEST_HOST_PERMISSION'; payload: { origin: string } }
  | { type: 'CHECK_HOST_PERMISSION'; payload: { origin: string } }
  | { type: 'GET_SITE_STATUS'; payload: { url: string } };

export const DEFAULT_SETTINGS: ExtensionSettings = {
  protectionEnabled: true,
  detection: {
    enabled: true,
    categories: {
      email: true,
      phone: true,
      api_key: true,
      password: true,
      access_token: true,
      auth_header: true,
      database_credentials: true,
      private_key: true,
      jwt: true,
      high_entropy: false,
    },
    sensitivity: 'balanced',
    entropyThreshold: 4.2,
    entropyMinLength: 20,
  },
  warningBehavior: {
    autoSelectAllForRedaction: true,
    showFindingCount: true,
  },
  enabledSites: {
    'chatgpt.com': true,
    'chat.openai.com': true,
    'claude.ai': true,
    'gemini.google.com': true,
    'copilot.microsoft.com': true,
  },
  genericAdapterSites: [],
};
