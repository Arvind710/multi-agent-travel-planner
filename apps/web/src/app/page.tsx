import { useTranslations } from "next-intl";
import Link from "next/link";

export default function Landing() {
  const t = useTranslations("landing");
  return (
    <main className="mx-auto flex flex-col items-center justify-center gap-6 p-8 text-center pt-24">
      <h1 className="font-[family-name:var(--font-google-fraunces)] text-5xl font-bold text-[var(--color-primary)]">
        {t("title")}
      </h1>
      <p className="text-lg text-gray-600 max-w-lg">{t("tagline")}</p>
      <Link
        href="/plan/new"
        className="mt-4 px-8 py-3 bg-[var(--color-primary)] text-white font-semibold rounded-full hover:opacity-90 shadow-lg"
      >
        Start Planning
      </Link>
    </main>
  );
}
