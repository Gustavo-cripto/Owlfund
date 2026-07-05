import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (code: string) => createHash("sha256").update(normalize(code)).digest("hex");

async function getUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

export async function POST(request: Request) {
  const user = await getUser(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!serviceKey) return NextResponse.json({ error: "Service role key não configurada." }, { status: 503 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Regenerar: apaga os códigos antigos deste utilizador.
  await admin.from("mfa_recovery_codes").delete().eq("user_id", user.id);

  const codes = Array.from({ length: 10 }, () => genCode());
  const rows = codes.map((c) => ({ user_id: user.id, code_hash: hash(c) }));
  const { error } = await admin.from("mfa_recovery_codes").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Devolve os códigos em texto UMA vez (só aqui são visíveis).
  return NextResponse.json({ codes });
}
