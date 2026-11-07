import { NextResponse } from "next/server";
import { CODIGO_2FA } from "@/lib/auth/nivelSessao";

/** 403 para uma conta com 2FA numa sessão só com palavra-passe. */
export function resposta2fa(): NextResponse {
  return NextResponse.json({ error: "Requer sessão verificada com 2FA.", code: CODIGO_2FA }, { status: 403 });
}
