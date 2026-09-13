import LoginForm from "./login-form";

type Params = { next?: string; mode?: string; email?: string; error?: string };
// Next 15: searchParams e sempre uma Promise. A uniao com o objeto direto
// fazia os wrappers /en, /es e /fr (que reexportam esta pagina) falhar no tsc.
type PageProps = { searchParams: Promise<Params> };

export default async function LoginPage(props: PageProps) {
  const searchParams = await props.searchParams;
  return (
    <LoginForm
      nextParam={searchParams?.next ?? null}
      modeParam={searchParams?.mode ?? null}
      emailParam={searchParams?.email ?? null}
      errorParam={searchParams?.error ?? null}
    />
  );
}
