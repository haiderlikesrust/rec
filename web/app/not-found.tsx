import { ArrowLeft } from "lucide-react";
import { brand } from "@gantry/shared";
import { ButtonLink, PageHeader } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="We couldn't find that page" sub="The link may be wrong, or the coin you're looking for hasn't launched yet." />
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/" size="lg">
          <ArrowLeft size={16} aria-hidden /> Back to coins
        </ButtonLink>
        <ButtonLink href={brand.docsPath} size="lg" variant="secondary">
          How it works
        </ButtonLink>
      </div>
    </div>
  );
}
