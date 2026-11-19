import { getAdminAuth } from "@/lib/firebase/server-admin";
import { ChaosActionError, performChaosAction } from "@/lib/chaos/server-action";

const STATUS_BY_CODE: Record<ChaosActionError["code"], number> = {
  unauthenticated: 401,
  "invalid-argument": 400,
  "permission-denied": 403,
  "not-found": 404,
  "failed-precondition": 409,
  "already-exists": 409,
  "deadline-exceeded": 409,
};

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return errorResponse("unauthenticated", "Sign in required", 401);

  try {
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return errorResponse("unauthenticated", "Sign in required", 401);
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return errorResponse("invalid-argument", "Invalid JSON request", 400);
    }

    const result = await performChaosAction(data, decodedToken.uid, decodedToken);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChaosActionError) {
      return errorResponse(error.code, error.message, STATUS_BY_CODE[error.code]);
    }
    console.error("Chaos action failed", error);
    return errorResponse("internal", "Action failed", 500);
  }
}
