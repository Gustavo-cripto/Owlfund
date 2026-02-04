import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shouldCheckOpenAi = url.searchParams.get("check") === "1";
  const shouldCheckGroq = url.searchParams.get("checkGroq") === "1";
  const shouldCheckOllama = url.searchParams.get("checkOllama") === "1";
  const shouldCheckXai = url.searchParams.get("checkXai") === "1";

  const rawKey = process.env.OPENAI_API_KEY ?? "";
  const apiKey = rawKey.trim();
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "").trim();
  const xaiKey = (process.env.XAI_API_KEY ?? "").trim();

  const base = {
    ok: true,
    hasOpenAiKey: Boolean(apiKey),
    hasGroqKey: Boolean(groqKey),
    hasOllamaBaseUrl: Boolean(ollamaBaseUrl),
    hasXaiKey: Boolean(xaiKey),
  };

  if (!shouldCheckOpenAi && !shouldCheckGroq && !shouldCheckOllama && !shouldCheckXai) {
    return NextResponse.json({
      ...base,
      message: "OK",
    });
  }

  try {
    const result: Record<string, unknown> = { ...base };

    if (shouldCheckOpenAi) {
      if (!apiKey) {
        result.openaiOk = false;
        result.openaiMessage = "OPENAI_API_KEY não configurada.";
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (response.ok) {
          result.openaiOk = true;
          result.openaiMessage = "OK (OpenAI acessível)";
        } else {
          const payload = await response.json().catch(() => null);
          const msg = payload?.error?.message;
          result.openaiOk = false;
          result.openaiStatus = response.status;
          result.openaiMessage =
            typeof msg === "string" && msg.length
              ? msg
              : `OpenAI respondeu com status ${response.status}.`;
        }
      }
    }

    if (shouldCheckGroq) {
      if (!groqKey) {
        result.groqOk = false;
        result.groqMessage = "GROQ_API_KEY não configurada.";
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch("https://api.groq.com/openai/v1/models", {
          method: "GET",
          headers: { Authorization: `Bearer ${groqKey}` },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (response.ok) {
          result.groqOk = true;
          result.groqMessage = "OK (Groq acessível)";
        } else {
          const payload = await response.json().catch(() => null);
          const msg = payload?.error?.message;
          result.groqOk = false;
          result.groqStatus = response.status;
          result.groqMessage =
            typeof msg === "string" && msg.length
              ? msg
              : `Groq respondeu com status ${response.status}.`;
        }
      }
    }

    if (shouldCheckOllama) {
      const baseUrl = ollamaBaseUrl || "http://127.0.0.1:11434";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      result.ollamaOk = response.ok;
      result.ollamaMessage = response.ok
        ? "OK (Ollama acessível)"
        : `Ollama respondeu com status ${response.status}.`;
    }

    if (shouldCheckXai) {
      if (!xaiKey) {
        result.xaiOk = false;
        result.xaiMessage = "XAI_API_KEY não configurada.";
      } else {
        const baseUrl = (process.env.XAI_BASE_URL ?? "").trim() || "https://api.x.ai/v1";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
          method: "GET",
          headers: { Authorization: `Bearer ${xaiKey}` },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (response.ok) {
          result.xaiOk = true;
          result.xaiMessage = "OK (xAI acessível)";
        } else {
          const payload = await response.json().catch(() => null);
          const msg = payload?.error?.message;
          result.xaiOk = false;
          result.xaiStatus = response.status;
          result.xaiMessage =
            typeof msg === "string" && msg.length
              ? msg
              : `xAI respondeu com status ${response.status}.`;
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          message: "Timeout a contactar provider.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado.",
      },
      { status: 500 }
    );
  }
}

