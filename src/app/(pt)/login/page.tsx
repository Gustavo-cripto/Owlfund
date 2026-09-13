import LoginForm from "./login-form";

type Params = { next?: string; mode?: string; email?: string; error?: string };
type PageProps = { searchParams: Promise<Params> | Params };

export default async function LoginPage(props: PageProps) {
  const searchParams = await Promise.resolve(props.searchParams);
  return (
    <LoginForm
      nextParam={searchParams?.next ?? null}
      modeParam={searchParams?.mode ?? null}
      emailParam={searchParams?.email ?? null}
      errorParam={searchParams?.error ?? null}
    />
  );
}
