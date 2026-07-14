import { useTranslations } from "next-intl";

/** Placeholder for ARCH §3.1 routes until their phase lands. */
export function RouteStub({ stubKey }: { stubKey: string }) {
  const t = useTranslations("stubs");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-8">
      <p className="border-l-2 border-secondary pl-4 text-ink-muted">{t(stubKey)}</p>
    </main>
  );
}
