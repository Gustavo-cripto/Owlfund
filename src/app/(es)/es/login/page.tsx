import type { Metadata } from "next";
import LoginPage from "@/app/(pt)/login/page";
import { pageMetadata } from "@/lib/i18n/pageMeta";

// O layout de /es ja fixa a lingua; aqui so falta a metadata, para o separador
// do browser nao aparecer em portugues antes de a pagina hidratar.
export const metadata: Metadata = pageMetadata("login", "es");

export default LoginPage;
