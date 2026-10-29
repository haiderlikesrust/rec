import { ArrowLeft, BookOpen } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="relative mx-auto flex max-w-xl flex-col items-center py-16 text-center sm:py-24">
      <div className="spectrum absolute top-10 h-48 w-48 rounded-full opacity-20 blur-3xl" aria-hidden />
      <LogoMark size={72} live className="relative animate-spin-slow text-fg" />
      <p className="eyebrow mt-10">Error 404</p>
      <h1 className="font-display mt-3 text-5xl font-semibold sm:text-6xl">
        Nothing <span className="text-spectrum">cooking</span> here
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
        That page doesn&apos;t exist, or the coin you&apos;re looking for hasn&apos;t launched yet.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" size="lg">
          <ArrowLeft size={16} /> Back to coins
        </ButtonLink>
        <ButtonLink href="/docs" size="lg" variant="secondary">
          <BookOpen size={16} /> How it works
        </ButtonLink>
      </div>
    </div>
  );
}
