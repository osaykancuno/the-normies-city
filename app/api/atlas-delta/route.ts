import { NextResponse } from "next/server";

// Returns a list of Normie ids whose Canvas bitmap has changed since the last atlas
// build. The client uses this to patch the in-memory atlas texture without re-fetching
// the whole image.
//
// MVP stub: returns an empty list. A scheduled job will populate this once we add the
// nightly delta builder (see plan: "Vercel Cron giornaliero").

export const revalidate = 300;

export async function GET() {
  return NextResponse.json({ updatedAt: new Date().toISOString(), ids: [] });
}
