import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return <LoginForm next={next} initialError={error} />;
}
