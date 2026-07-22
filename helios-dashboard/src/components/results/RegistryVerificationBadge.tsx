"use client";

type SosVerification = {
  found?: boolean;
  skipped?: boolean;
  isActive?: boolean;
  state?: string;
  reason?: string;
  alertCode?: string;
  matchedBusinessName?: string;
  portalSignupUrl?: string;
};

type Props = {
  sos?: SosVerification | null;
};

const STYLE: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800",
  notFound: "bg-rose-100 text-rose-800",
  onboarding: "bg-blue-100 text-blue-800",
  credentials: "bg-amber-100 text-amber-900",
  unavailable: "bg-orange-100 text-orange-800",
  skipped: "bg-slate-200 text-slate-700",
};

export default function RegistryVerificationBadge({ sos }: Props) {
  if (!sos) return null;

  let label = "Registry";
  let style = STYLE.skipped;

  if (sos.skipped) {
    if (sos.reason === "SOS_DISABLED") return null;
    if (sos.alertCode === "SOS_CREDENTIALS_REQUIRED" || sos.reason === "SOS_CREDENTIALS_REQUIRED") {
      label = "Credentials needed";
      style = STYLE.credentials;
    } else if (sos.onboarding || sos.alertCode === "SOS_ONBOARDING") {
      label = "Onboarding";
      style = STYLE.onboarding;
    } else if (sos.alertCode === "SOS_STATE_MISSING") {
      label = "State missing";
      style = STYLE.credentials;
    } else if (
      sos.alertCode === "SOS_VERIFICATION_ERROR" ||
      sos.reason === "SOS_VERIFICATION_ERROR"
    ) {
      label = "Verification unavailable";
      style = STYLE.unavailable;
    } else {
      label = "Skipped";
    }
  } else if (sos.found && sos.isActive) {
    label = `Verified (${sos.state || "?"})`;
    style = STYLE.verified;
  } else if (sos.found === false) {
    label = "Not found";
    style = STYLE.notFound;
  }

  return (
    <div className="helios-card p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">Secretary of State</p>
      {sos.matchedBusinessName && (
        <p className="mt-1 text-sm font-medium text-slate-800">{sos.matchedBusinessName}</p>
      )}
      <span className={`helios-chip mt-2 ${style}`}>{label}</span>
      {sos.portalSignupUrl && (
        <a
          href={sos.portalSignupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-xs text-blue-700 underline"
        >
          Open state portal
        </a>
      )}
    </div>
  );
}
