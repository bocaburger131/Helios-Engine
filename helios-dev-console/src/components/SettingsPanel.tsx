"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AddCustomModelPayload,
  AiModelCatalogEntry,
  AiModelKey,
  AiModelTag,
  AiModels,
  SimToggles,
} from "../helios-api";

const TAG_PILL_CLASS: Record<AiModelTag, string> = {
  vision: "bg-blue-600 text-white",
  thinking: "bg-violet-600 text-white",
  code: "bg-emerald-600 text-white",
  general: "bg-zinc-700 text-zinc-100",
};

const TAG_LEGEND: Array<{ tag: AiModelTag; label: string; icon: string }> = [
  { tag: "vision", label: "Vision", icon: "◉" },
  { tag: "thinking", label: "Thinking", icon: "◈" },
  { tag: "code", label: "Code", icon: "⚒" },
  { tag: "general", label: "General", icon: "–" },
];

type AgentTask = {
  /** Env flag that is true when the task is disabled */
  disableKey: keyof SimToggles;
  label: string;
  /** If true, checked means the env key is true (not inverted) */
  enabledWhenTrue?: boolean;
};

const AI_MODEL_STAGE_META: Array<{
  key: AiModelKey;
  label: string;
  shortLabel: string;
  description: string;
  capability: AiModelTag;
  tasks: AgentTask[];
}> = [
  {
    key: "LAYOUT_AI_MODEL",
    label: "AI Layout Generator",
    shortLabel: "Layout",
    description: "Template / layout extraction (requires vision)",
    capability: "vision",
    tasks: [
      { disableKey: "DISABLE_LAYOUT_STITCHER", label: "Stitch orphaned rows" },
      { disableKey: "DISABLE_LAYOUT_LEARNING", label: "Learn template layout" },
    ],
  },
  {
    key: "RESCUER_AI_MODEL",
    label: "AI Rescuer",
    shortLabel: "Rescuer",
    description: "Diagnostic rescue / auto-correct (requires vision)",
    capability: "vision",
    tasks: [
      { disableKey: "DISABLE_AI_RESCUER", label: "Diagnostic auto-correct" },
      {
        disableKey: "AI_DIAGNOSTIC_RESCUE_ENABLED",
        label: "AI diagnostic rescue master",
        enabledWhenTrue: true,
      },
    ],
  },
  {
    key: "CATEGORIZER_AI_MODEL",
    label: "AI Transaction Categorizer",
    shortLabel: "Categorizer",
    description: "Transaction categorization (code / pattern models)",
    capability: "code",
    tasks: [
      { disableKey: "DISABLE_LLM_CATEGORIZER", label: "LLM categorization" },
    ],
  },
  {
    key: "ANALYSIS_AI_MODEL",
    label: "AI Analysis / Vera AI Engine",
    shortLabel: "Analysis",
    description: "Analysis and Vera briefing (thinking models)",
    capability: "thinking",
    tasks: [
      { disableKey: "DISABLE_VERA_BRIEFING", label: "Vera briefing" },
    ],
  },
];

const DEFAULT_MODEL_CATALOG: AiModelCatalogEntry[] = [
  { id: "gpt-4o", tags: ["vision", "general"] },
  { id: "gpt-4o-mini", tags: ["vision", "general"] },
  { id: "claude-3-5-sonnet", tags: ["vision", "thinking"] },
  { id: "gemini-1.5-pro", tags: ["vision", "thinking"] },
  { id: "gemini-1.5-flash", tags: ["vision"] },
  { id: "deepseek-chat", tags: ["thinking", "code"] },
  { id: "deepseek-coder", tags: ["code"] },
  { id: "o1-mini", tags: ["thinking"] },
  { id: "ollama-local", tags: ["general", "code"] },
];

function optionsForStage(
  catalog: AiModelCatalogEntry[],
  capability: AiModelTag,
  selectedId: string
): AiModelCatalogEntry[] {
  const filtered = catalog.filter((m) => m.tags.includes(capability));
  if (selectedId && !filtered.some((m) => m.id === selectedId)) {
    const legacy =
      catalog.find((m) => m.id === selectedId) ||
      ({ id: selectedId, tags: [] as AiModelTag[] });
    return [legacy, ...filtered];
  }
  return filtered;
}

/** Positive UI ↔ negative DISABLE_* env (or direct for enabledWhenTrue). */
function isTaskEnabled(toggles: SimToggles, task: AgentTask): boolean {
  if (task.enabledWhenTrue) return Boolean(toggles[task.disableKey]);
  return !Boolean(toggles[task.disableKey]);
}

function applyTaskEnabled(
  toggles: SimToggles,
  task: AgentTask,
  enabled: boolean
): SimToggles {
  const next = { ...toggles };
  if (task.enabledWhenTrue) {
    next[task.disableKey] = enabled;
    if (task.disableKey === "AI_DIAGNOSTIC_RESCUE_ENABLED" && enabled) {
      next.DISABLE_AI_RESCUER = false;
    }
  } else {
    next[task.disableKey] = !enabled;
    if (task.disableKey === "DISABLE_AI_RESCUER" && !enabled) {
      next.AI_DIAGNOSTIC_RESCUE_ENABLED = false;
    }
  }
  return next;
}

function AbilityPill({ tag }: { tag: AiModelTag }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TAG_PILL_CLASS[tag]}`}
    >
      {tag}
    </span>
  );
}

function ToggleRow({
  label,
  description,
  envKey,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  envKey: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-slate-900 dark:text-zinc-100">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">
          {description}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-primary">
          {envKey}
        </span>
      </span>
    </label>
  );
}

function ModelPicker({
  stageKey,
  selected,
  options,
  apiReady,
  open,
  onToggleOpen,
  onSelect,
  disabled,
}: {
  stageKey: AiModelKey;
  selected: string;
  options: AiModelCatalogEntry[];
  apiReady: Record<string, boolean>;
  open: boolean;
  onToggleOpen: () => void;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const ready = selected ? Boolean(apiReady[selected]) : true;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <span
          className={
            !selected
              ? "text-zinc-400"
              : ready
                ? "font-mono text-emerald-600 dark:text-emerald-400"
                : "font-mono text-zinc-400 dark:text-zinc-500"
          }
        >
          {selected || "(from .env / unset)"}
        </span>
        <span className="text-xs text-zinc-500">▾</span>
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          <li>
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-sm text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-900"
              onClick={() => onSelect("")}
            >
              (from .env / unset)
            </button>
          </li>
          {options.map((opt) => {
            const ok = Boolean(apiReady[opt.id]);
            return (
              <li key={`${stageKey}-${opt.id}`}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-900"
                  onClick={() => onSelect(opt.id)}
                >
                  <span
                    className={
                      ok
                        ? "font-mono text-sm text-emerald-600 dark:text-emerald-400"
                        : "font-mono text-sm text-zinc-400 dark:text-zinc-500"
                    }
                  >
                    {opt.id}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {opt.tags.map((t) => (
                      <AbilityPill key={t} tag={t} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const defaultToggles = (): SimToggles => ({
  DISABLE_AI_RESCUER: false,
  ZOHO_DEMO_MODE: false,
  SALESFORCE_DEMO_MODE: false,
  DEMO_MODE: false,
  DISABLE_AUTH: false,
  ENABLE_PUBLIC_UPLOAD: false,
  FORCE_HITL_ROUTING: false,
  USE_MOCK_SERVICES: false,
  AI_DIAGNOSTIC_RESCUE_ENABLED: true,
  DISABLE_LAYOUT_STITCHER: false,
  DISABLE_LAYOUT_LEARNING: false,
  DISABLE_LLM_CATEGORIZER: false,
  DISABLE_VERA_BRIEFING: false,
});

const defaultAiModels = (): AiModels => ({
  LAYOUT_AI_MODEL: "",
  RESCUER_AI_MODEL: "",
  CATEGORIZER_AI_MODEL: "",
  ANALYSIS_AI_MODEL: "",
});

const PRESENTATION_KEY = "helios-dev-console-presentation-mode";

type CustomProvider = AddCustomModelPayload["provider"];

function AddCustomModelModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: AddCustomModelPayload) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<CustomProvider>("openai");
  const [tags, setTags] = useState<AiModelTag[]>(["general"]);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setId("");
    setName("");
    setProvider("openai");
    setTags(["general"]);
    setApiKey("");
  }, [open]);

  if (!open) return null;

  const toggleTag = (tag: AiModelTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h3
            id="add-model-title"
            className="text-base font-semibold text-slate-900 dark:text-zinc-100"
          >
            Add Custom Model
          </h3>
          <button
            type="button"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
            Model ID
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="claude-3-opus"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
            Display Name
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude 3 Opus"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
            Provider
            <select
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={provider}
              onChange={(e) => setProvider(e.target.value as CustomProvider)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="deepseek">DeepSeek</option>
              <option value="ollama">Ollama</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-xs font-medium text-slate-600 dark:text-zinc-400">
              Capabilities
            </legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(
                [
                  ["vision", "vision"],
                  ["thinking", "reasoning"],
                  ["code", "code"],
                  ["general", "general"],
                ] as Array<[AiModelTag, string]>
              ).map(([tag, label]) => (
                <label key={tag} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--color-primary)]"
                    checked={tags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
            API Key
            <input
              type="password"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !id.trim() || tags.length === 0}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                id: id.trim(),
                name: name.trim() || id.trim(),
                provider,
                tags,
                apiKey: apiKey.trim() || undefined,
              })
            }
          >
            {busy ? "Saving…" : "Save model"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const [toggles, setToggles] = useState<SimToggles>(defaultToggles);
  const [aiModels, setAiModels] = useState<AiModels>(defaultAiModels);
  const [modelCatalog, setModelCatalog] =
    useState<AiModelCatalogEntry[]>(DEFAULT_MODEL_CATALOG);
  const [apiReady, setApiReady] = useState<Record<string, boolean>>({});
  const [providerEnvLabel, setProviderEnvLabel] = useState<
    Record<string, string>
  >({});
  const [overridePath, setOverridePath] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState<AiModelKey | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [envPreview, setEnvPreview] = useState("");
  const [overridePreview, setOverridePreview] = useState("");
  const [hitlJson, setHitlJson] = useState<string>("(none)");
  const [hitlError, setHitlError] = useState<string | null>(null);
  const [hitlLoading, setHitlLoading] = useState(false);
  const [openPicker, setOpenPicker] = useState<AiModelKey | null>(null);
  const [openDetails, setOpenDetails] = useState<Partial<Record<AiModelKey, boolean>>>(
    {}
  );
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshToggles = useCallback(async () => {
    if (!window.helios?.getSimToggles) return;
    const r = await window.helios.getSimToggles();
    setToggles({ ...defaultToggles(), ...r.toggles });
    setOverridePath(r.path);
  }, []);

  const refreshAiModels = useCallback(async () => {
    if (!window.helios?.getAiModels) return;
    const r = await window.helios.getAiModels();
    setAiModels({ ...defaultAiModels(), ...r.models });
    if (Array.isArray(r.catalog) && r.catalog.length) {
      setModelCatalog(r.catalog);
    } else if (Array.isArray(r.options) && r.options.length) {
      setModelCatalog(
        r.options.map((id) => {
          const known = DEFAULT_MODEL_CATALOG.find((m) => m.id === id);
          return known || { id, tags: [] };
        })
      );
    }
    if (r.apiReady) setApiReady(r.apiReady);
    if (r.providerEnvLabel) setProviderEnvLabel(r.providerEnvLabel);
    if (r.path) setOverridePath(r.path);
  }, []);

  const refreshPreview = useCallback(async (presentation: boolean) => {
    if (!window.helios?.readEnvPreview) return;
    const r = await window.helios.readEnvPreview({ presentationMode: presentation });
    setEnvPreview(r.envPreview || "(no .env)");
    setOverridePreview(r.overridePreview || "(empty override)");
    setOverridePath(r.overridePath);
  }, []);

  const refreshHitl = useCallback(async () => {
    if (!window.helios?.getHitlQueuePayload) return;
    setHitlLoading(true);
    setHitlError(null);
    try {
      const r = await window.helios.getHitlQueuePayload();
      if (!r.ok) {
        setHitlError(r.error || "Failed to load HITL queue");
        setHitlJson("(error)");
        return;
      }
      if (!r.payload) {
        setHitlJson("(no REQUIRES_HUMAN_REVIEW ProcessingRun found)");
        return;
      }
      setHitlJson(JSON.stringify(r.payload, null, 2));
    } catch (e) {
      setHitlError(e instanceof Error ? e.message : "HITL fetch failed");
    } finally {
      setHitlLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(PRESENTATION_KEY) === "true";
    setPresentationMode(stored);
    void refreshToggles();
    void refreshAiModels();
    void refreshPreview(stored);
    void refreshHitl();
  }, [refreshToggles, refreshAiModels, refreshPreview, refreshHitl]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpenPicker(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const persistToggles = async (next: SimToggles, message?: string) => {
    setSaving(true);
    setFlash(null);
    try {
      if (!window.helios?.setSimToggles) {
        setFlash("Toggle IPC unavailable (open in Electron)");
        return;
      }
      const r = await window.helios.setSimToggles(next);
      setToggles({ ...defaultToggles(), ...r.toggles });
      setFlash(
        message ||
          "Wrote .env.dev.override — restart Helios (Stop → Start) so the API process reloads overrides."
      );
      await refreshPreview(presentationMode);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleMasterDemoToggle = async (on: boolean) => {
    const next: SimToggles = {
      ...toggles,
      DEMO_MODE: on,
      DISABLE_AUTH: on,
      ZOHO_DEMO_MODE: on,
      SALESFORCE_DEMO_MODE: on,
    };
    setToggles(next);
    await persistToggles(
      next,
      on
        ? "Demo Mode ON — Auth Override, Zoho, and Salesforce demo forced ON. Restart Helios to apply."
        : "Demo Mode OFF — Auth Override, Zoho, and Salesforce demo cleared. Restart Helios to apply."
    );
  };

  const onLocalToggle = (key: keyof SimToggles, value: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "DISABLE_AI_RESCUER" && value) {
        next.AI_DIAGNOSTIC_RESCUE_ENABLED = false;
      }
      if (key === "AI_DIAGNOSTIC_RESCUE_ENABLED" && value) {
        next.DISABLE_AI_RESCUER = false;
      }
      return next;
    });
  };

  const onAgentTaskToggle = async (task: AgentTask, checked: boolean) => {
    const next = applyTaskEnabled(toggles, task, checked);
    setToggles(next);
    await persistToggles(
      next,
      `Updated ${String(task.disableKey)} — restart Helios to apply.`
    );
  };

  const onAiModelChange = async (key: AiModelKey, value: string) => {
    const prev = aiModels[key];
    setAiModels((m) => ({ ...m, [key]: value }));
    setSavingModel(key);
    setOpenPicker(null);
    setFlash(null);
    try {
      if (!window.helios?.setAiModels) {
        setFlash("AI model IPC unavailable (open in Electron)");
        setAiModels((m) => ({ ...m, [key]: prev }));
        return;
      }
      const r = await window.helios.setAiModels({ [key]: value });
      if (r.ok === false) {
        setFlash(r.error || "Model update failed");
        setAiModels((m) => ({ ...m, [key]: prev }));
        return;
      }
      setAiModels({ ...defaultAiModels(), ...r.models });
      if (Array.isArray(r.catalog) && r.catalog.length) setModelCatalog(r.catalog);
      if (r.apiReady) setApiReady(r.apiReady);
      if (r.providerEnvLabel) setProviderEnvLabel(r.providerEnvLabel);

      if (value && r.apiReady && r.apiReady[value] === false) {
        const envKey =
          (r.providerEnvLabel && r.providerEnvLabel[value]) ||
          providerEnvLabel[value] ||
          "API key";
        setFlash(
          `No API key set for ${value} (${envKey}). Selection saved — add the key to .env before restarting Helios.`
        );
      } else {
        setFlash(
          `Updated ${key}=${value || "(cleared)"} — restart Helios (Stop → Start) so the API process reloads overrides.`
        );
      }
      await refreshPreview(presentationMode);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Model update failed");
      setAiModels((m) => ({ ...m, [key]: prev }));
    } finally {
      setSavingModel(null);
    }
  };

  const onAddCustomModel = async (payload: AddCustomModelPayload) => {
    setAddingModel(true);
    setFlash(null);
    try {
      if (!window.helios?.addCustomModel) {
        setFlash("addCustomModel IPC unavailable (open in Electron)");
        return;
      }
      const r = await window.helios.addCustomModel(payload);
      if (r.ok === false) {
        setFlash(r.error || "Failed to add custom model");
        return;
      }
      if (Array.isArray(r.catalog) && r.catalog.length) {
        setModelCatalog(r.catalog);
      }
      if (r.apiReady) setApiReady(r.apiReady);
      if (r.providerEnvLabel) setProviderEnvLabel(r.providerEnvLabel);
      setAddModelOpen(false);
      const ready = r.apiReady?.[payload.id];
      setFlash(
        ready
          ? `Added ${payload.id} — API key validated (green).`
          : `Added ${payload.id} — key missing or invalid (gray). Check .env / override.`
      );
      await refreshPreview(presentationMode);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Failed to add custom model");
    } finally {
      setAddingModel(false);
    }
  };

  const save = async () => {
    await persistToggles(toggles);
    await refreshAiModels();
  };

  const onPresentation = async (on: boolean) => {
    setPresentationMode(on);
    localStorage.setItem(PRESENTATION_KEY, on ? "true" : "false");
    await refreshPreview(on);
  };

  const maskedHitl =
    presentationMode && hitlJson.startsWith("{")
      ? hitlJson.replace(
          /("(GEMINI_API_KEY|GOOGLE_API_KEY|JWT_SECRET|API_KEY|PERPLEXITY_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|MONGO_URI|MONGODB_URI|password|token)"\s*:\s*")([^"]*)(")/gi,
          "$1********$4"
        )
      : hitlJson;

  const taskChecked = (task: AgentTask): boolean => isTaskEnabled(toggles, task);

  return (
    <div ref={panelRef} className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Settings &amp; Environment
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Chronological pipeline controls write{" "}
            <code className="text-xs">bank-statement-analyzer-api/.env.dev.override</code>.
          </p>
          {overridePath && (
            <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">
              {overridePath}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-zinc-700">
          <input
            type="checkbox"
            className="accent-[var(--color-primary)]"
            checked={presentationMode}
            onChange={(e) => void onPresentation(e.target.checked)}
          />
          Presentation mode
          <span className="text-xs text-slate-500">(mask API keys)</span>
        </label>
      </div>

      {/* 1. Global Ingress */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          1 · Global Ingress
        </h3>
        <ToggleRow
          label="Master Demo Mode"
          description="When ON, forces Auth Override, Zoho, and Salesforce demo ON. When OFF, clears those three as well."
          envKey="DEMO_MODE"
          checked={Boolean(toggles.DEMO_MODE)}
          onChange={(v) => void handleMasterDemoToggle(v)}
        />
      </section>

      {/* 2. Auth & CRM */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          2 · Auth &amp; CRM Mocks
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow
            label="Auth Override"
            description="Skip JWT/API-key gates for local Upload Hub"
            envKey="DISABLE_AUTH"
            checked={Boolean(toggles.DISABLE_AUTH)}
            onChange={(v) => onLocalToggle("DISABLE_AUTH", v)}
          />
          <ToggleRow
            label="Zoho Demo Mode"
            description="Bypass live Zoho CRM side-effects for local demos"
            envKey="ZOHO_DEMO_MODE"
            checked={Boolean(toggles.ZOHO_DEMO_MODE)}
            onChange={(v) => onLocalToggle("ZOHO_DEMO_MODE", v)}
          />
          <ToggleRow
            label="Salesforce Demo Mode"
            description="Placeholder CRM mock flag (console override only)"
            envKey="SALESFORCE_DEMO_MODE"
            checked={Boolean(toggles.SALESFORCE_DEMO_MODE)}
            onChange={(v) => onLocalToggle("SALESFORCE_DEMO_MODE", v)}
          />
          <ToggleRow
            label="Public upload"
            description="Enable /api/statements/batch/public (requires demo)"
            envKey="ENABLE_PUBLIC_UPLOAD"
            checked={Boolean(toggles.ENABLE_PUBLIC_UPLOAD)}
            onChange={(v) => onLocalToggle("ENABLE_PUBLIC_UPLOAD", v)}
          />
          <ToggleRow
            label="Mock services"
            description="Prefer mock external providers where supported"
            envKey="USE_MOCK_SERVICES"
            checked={Boolean(toggles.USE_MOCK_SERVICES)}
            onChange={(v) => onLocalToggle("USE_MOCK_SERVICES", v)}
          />
        </div>
      </section>

      {/* 3. AI Pipeline */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          3 · AI Pipeline Agents
        </h3>
        <div className="rounded-xl border border-slate-200 p-4 dark:border-zinc-800">
          <div className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900 dark:text-zinc-100">
                AI Model Routing Matrix
              </h4>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => setAddModelOpen(true)}
              >
                + Add Custom Model
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Green model names passed live API validation; gray names failed or
              have no key. Still selectable.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAG_LEGEND.map((item) => (
                <span
                  key={item.tag}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TAG_PILL_CLASS[item.tag]}`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AI_MODEL_STAGE_META.map((stage) => {
              const selected = aiModels[stage.key] || "";
              const stageOptions = optionsForStage(
                modelCatalog,
                stage.capability,
                selected
              );
              const selectedEntry =
                modelCatalog.find((m) => m.id === selected) ||
                stageOptions.find((m) => m.id === selected);
              const detailsOpen = Boolean(openDetails[stage.key]);

              return (
                <div
                  key={stage.key}
                  className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-zinc-100">
                      {stage.shortLabel}
                    </span>
                    <AbilityPill tag={stage.capability} />
                  </span>
                  <span className="text-xs text-slate-500 dark:text-zinc-400">
                    {stage.description}
                  </span>
                  <span className="font-mono text-[10px] text-primary">
                    {stage.key}
                  </span>

                  <ModelPicker
                    stageKey={stage.key}
                    selected={selected}
                    options={stageOptions}
                    apiReady={apiReady}
                    open={openPicker === stage.key}
                    onToggleOpen={() =>
                      setOpenPicker((p) => (p === stage.key ? null : stage.key))
                    }
                    onSelect={(id) => void onAiModelChange(stage.key, id)}
                    disabled={savingModel === stage.key}
                  />

                  {selectedEntry && selectedEntry.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {selectedEntry.tags.map((t) => (
                        <AbilityPill key={t} tag={t} />
                      ))}
                    </span>
                  )}

                  <button
                    type="button"
                    className="mt-2 self-start text-xs font-medium text-primary hover:underline"
                    onClick={() =>
                      setOpenDetails((d) => ({
                        ...d,
                        [stage.key]: !d[stage.key],
                      }))
                    }
                  >
                    {detailsOpen ? "Hide Agent Details" : "View Agent Details"}
                  </button>

                  {detailsOpen && (
                    <div className="mt-1 space-y-2 rounded border border-slate-200 p-2 dark:border-zinc-700">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Agent tasks
                      </p>
                      {stage.tasks.map((task) => (
                        <label
                          key={String(task.disableKey)}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                            checked={taskChecked(task)}
                            onChange={(e) =>
                              void onAgentTaskToggle(task, e.target.checked)
                            }
                          />
                          <span className="text-slate-800 dark:text-zinc-200">
                            {task.label}
                          </span>
                          <span className="font-mono text-[9px] text-primary">
                            {String(task.disableKey)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            void refreshToggles();
            void refreshAiModels();
            void refreshPreview(presentationMode);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Reload
        </button>
        {flash && (
          <span className="text-xs text-amber-700 dark:text-amber-300">{flash}</span>
        )}
      </div>

      {/* 4. Egress */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          4 · Egress (HITL)
        </h3>
        <ToggleRow
          label="Force HITL routing"
          description="Always open ProcessingRun REQUIRES_HUMAN_REVIEW for edge-case tests"
          envKey="FORCE_HITL_ROUTING"
          checked={Boolean(toggles.FORCE_HITL_ROUTING)}
          onChange={(v) => onLocalToggle("FORCE_HITL_ROUTING", v)}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">`.env` preview</h4>
            <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-zinc-950 p-3 font-mono text-[10px] text-zinc-300 dark:border-zinc-800">
              {envPreview}
            </pre>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">
              `.env.dev.override` preview
            </h4>
            <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-zinc-950 p-3 font-mono text-[10px] text-zinc-300 dark:border-zinc-800">
              {overridePreview}
            </pre>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-zinc-100">
                Queue Inspector
              </h4>
              <p className="text-xs text-slate-500">
                Latest ProcessingRun with status REQUIRES_HUMAN_REVIEW (local Mongo{" "}
                <code>bank-statement-dev</code>)
              </p>
            </div>
            <button
              type="button"
              disabled={hitlLoading}
              onClick={() => void refreshHitl()}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-zinc-700"
            >
              {hitlLoading ? "Loading…" : "Refresh HITL"}
            </button>
          </div>
          {hitlError && (
            <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">
              {hitlError}
            </p>
          )}
          <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-emerald-300">
            {maskedHitl}
          </pre>
        </div>
      </section>

      <AddCustomModelModal
        open={addModelOpen}
        busy={addingModel}
        onClose={() => setAddModelOpen(false)}
        onSubmit={(p) => void onAddCustomModel(p)}
      />
    </div>
  );
}
