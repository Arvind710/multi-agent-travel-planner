import { useTranslations } from "next-intl";

export default function Landing() {
  const t = useTranslations("landing");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-4xl)] text-accent">
        {t("title")}
      </h1>
      <p className="text-[length:var(--text-lg)] text-ink-muted">{t("tagline")}</p>
      <p className="text-[length:var(--text-sm)] text-ink-muted">{t("stub")}</p>
    </main>
  );
}
