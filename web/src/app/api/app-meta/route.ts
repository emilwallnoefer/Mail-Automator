import { NextResponse } from "next/server";

function resolveDeployKey() {
  const candidates = [
    process.env.VERCEL_DEPLOYMENT_ID,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_URL,
  ].filter(Boolean) as string[];

  if (candidates.length > 0) return candidates[0];
  return "local-dev";
}

export async function GET() {
  return NextResponse.json({ deploy_key: resolveDeployKey() });
}
