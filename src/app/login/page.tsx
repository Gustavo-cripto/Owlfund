import LoginForm from "./login-form";

type PageProps = {
  searchParams: Promise<{ next?: string }> | { next?: string };
};

export default async function LoginPage(props: PageProps) {
  const searchParams = await Promise.resolve(props.searchParams);
  const nextParam = searchParams?.next ?? null;
  return <LoginForm nextParam={nextParam} />;
}
