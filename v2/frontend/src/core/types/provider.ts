// PhantomOS v2 — Provider types matching Go models
// Author: Subash Karki

export interface ProviderInfo {
  name: string;
  display_name: string;
  icon: string;
  enabled: boolean;
  installed: boolean;
  version: string;
  health: HealthStatus;
  is_active: boolean;
  is_builtin: boolean;
  has_override: boolean;
  config: ProviderConfigView | null;
}

export interface HealthStatus {
  installed: boolean;
  reachable: boolean;
  has_auth: boolean;
  version: string;
  error: string;
}

export interface ProviderConfigView {
  commands: {
    resume: string;
    new_session: string;
    ai_generate: string;
    prompt_transport: string;
  };
  pricing: {
    default_tier: string;
    tiers: Record<string, PriceTier>;
  };
  paths: {
    sessions: string;
    conversations: string;
  };
}

export interface PriceTier {
  match: string;
  input_per_m: number;
  output_per_m: number;
}
