// src/components/company-logo.tsx
"use client";

import { useState } from "react";
import { companyDomain, logoUrl, monogram, monogramColor } from "@/lib/companies/logo";

export function CompanyLogo({
  company,
  size = 40,
}: {
  company: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const domain = companyDomain(company);
  const showImg = domain && !failed;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl(domain)}
        alt={`${company} logo`}
        width={size}
        height={size}
        className="rounded-md object-contain bg-white border border-border"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="rounded-md flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: monogramColor(company) }}
    >
      {monogram(company)}
    </div>
  );
}
