import DashboardClientLoader from "@/components/DashboardClientLoader";
import { loadFixturePayload } from "@/lib/loadFixture";
import { fetchStatementById } from "@/lib/apiClient";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; fixture?: string }>;
};

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token, fixture } = await searchParams;

  const forceFixture = fixture === "1";

  if (forceFixture) {
    const payload = await loadFixturePayload(id);
    if (!payload?.data?.statement) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">No fixture data</h1>
          <p className="mt-2 text-sm text-slate-600">No fixture found for ID {id}.</p>
        </div>
      );
    }
    return (
      <DashboardClientLoader
        statementId={id}
        initialPayload={payload}
        usingFixture
        fixtureReason="Loaded via ?fixture=1"
      />
    );
  }

  try {
    const payload = await fetchStatementById(id, token);
    if (!payload?.data?.statement) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">No statement data</h1>
          <p className="mt-2 text-sm text-slate-600">
            The API response did not include statement analysis for ID {id}.
          </p>
        </div>
      );
    }
    return (
      <DashboardClientLoader
        statementId={id}
        initialPayload={payload}
        serverToken={token}
      />
    );
  } catch {
    return (
      <DashboardClientLoader
        statementId={id}
        serverToken={token}
      />
    );
  }
}
