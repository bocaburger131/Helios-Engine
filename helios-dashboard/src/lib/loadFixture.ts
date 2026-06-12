import { readFile } from "fs/promises";
import path from "path";
import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

const FIXTURE_FILE = "maas-treats.fixture.json";

export async function loadFixturePayload(
  statementId?: string
): Promise<HeliosStatementPayload> {
  const filePath = path.join(process.cwd(), "fixtures", FIXTURE_FILE);
  const raw = await readFile(filePath, "utf8");
  const payload = JSON.parse(raw) as HeliosStatementPayload;

  if (statementId && payload.data?.statement) {
    payload.data.statement._id = statementId;
    payload.data.statement.id = statementId;
  }

  return payload;
}
