import { NextRequest, NextResponse } from "next/server";
import { promoteToBank } from "../../../../modules/intake/staging-review";

// POST /api/staging/promote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, userId } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const defaultUserId = "00000000-0000-0000-0000-000000000000";
    const promotedId = await promoteToBank(id, userId || defaultUserId);

    return NextResponse.json({ success: true, id: promotedId }, { status: 200 });
  } catch (err: any) {
    const isZod = err?.name === "ZodError" || err?.issues;
    return NextResponse.json(
      {
        error: err.message || "Failed to promote question to bank",
        details: isZod ? err.issues : undefined,
      },
      { status: isZod ? 422 : 500 }
    );
  }
}
