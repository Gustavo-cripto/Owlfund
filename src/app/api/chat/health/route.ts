import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shouldCheckOpenAi = url.searchParams.get("check") === "1";

  const rawKey = process.env.OPENAI_API_KEY ?? "";
  const apiKey = rawKey.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        hasKey: false,
        message: "OPENAI_API_KEY não configurada.",
      },
      { status: 500 }
    );
  }

  if (!shouldCheckOpenAi) {
    return NextResponse.json({
      ok: true,
      hasKey: true,
      message: "OK",
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (response.ok) {
      return NextResponse.json({
        ok: true,
        hasKey: true,
        openaiOk: true,
        message: "OK (OpenAI acessível)",
      });
    }

    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message;
    const message =
      typeof msg === "string" && msg.length
        ? msg
        : `OpenAI respondeu com status ${response.status}.`;

    return NextResponse.json(
      {
        ok: false,
        hasKey: true,
        openaiOk: false,
        status: response.status,
        message,
      },
      { status: 502 }
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          hasKey: true,
          openaiOk: false,
          message: "Timeout a contactar a OpenAI.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        hasKey: true,
        openaiOk: false,
        message: error instanceof Error ? error.message : "Erro inesperado.",
      },
      { status: 500 }
    );
  }
}

