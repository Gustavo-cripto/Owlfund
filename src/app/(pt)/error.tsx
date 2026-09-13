"use client";
// Fronteira de erro deste layout raiz. O conteudo e partilhado pelos 4 idiomas.
import ErrorPage from "@/components/pages/ErrorPage";
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) { return <ErrorPage {...props} />; }
