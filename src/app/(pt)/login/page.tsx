import { Suspense } from "react";
import LoginForm from "./login-form";
import LoginComParametros from "./login-com-parametros";

// Página estática (sai da cache): os parâmetros do endereço são lidos no browser,
// em login-com-parametros.tsx. Enquanto não chegam, mostra-se o formulário sem eles.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginForm nextParam={null} />}>
      <LoginComParametros />
    </Suspense>
  );
}
