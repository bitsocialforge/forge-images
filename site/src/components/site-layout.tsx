import { Analytics } from "@vercel/analytics/react";
import type { ReactNode } from "react";
import lockupUrl from "../assets/lockup.svg";

export type NavPage = "upload" | "faq" | "legal" | "report";

const navLinks: Array<{ page: NavPage; href: string; label: string }> = [
  { page: "upload", href: "/", label: "Upload" },
  { page: "faq", href: "/faq", label: "FAQ" },
  { page: "legal", href: "/legal", label: "Legal" },
  { page: "report", href: "/report", label: "Report" },
];

/** Rising embers; their positions and timings live in site.css (nth-child rules), not inline styles, because the
    CSP has no 'unsafe-inline' for style attributes. */
const EMBER_COUNT = 12;

/** The furnace glow, scanlines, and embers from bitsocialforge.com, behind the page. */
function Atmosphere() {
  return (
    <>
      <div className="furnace-glow" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="embers" aria-hidden="true">
        {Array.from({ length: EMBER_COUNT }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </>
  );
}

export function SiteLayout({ current, children }: { current: NavPage; children: ReactNode }) {
  return (
    <>
      <Atmosphere />
      <div className="page">
        <header className="site-header">
          <a href="/">
            <img src={lockupUrl} alt="Forge Images" width={341} height={57} />
          </a>
          <nav className="site-nav" aria-label="Site">
            {navLinks.map(({ page, href, label }) => (
              <a key={page} href={href} aria-current={page === current ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
        </header>

        <main>{children}</main>

        <footer className="site-footer">
          <p>
            Forge Images is operated by <a href="https://bitsocialforge.com">Bitsocial Forge Inc.</a>
          </p>
          <p>
            Abuse: <a href="mailto:abuse@bitsocialforge.com">abuse@bitsocialforge.com</a> · Copyright:{" "}
            <a href="mailto:dmca@bitsocialforge.com">dmca@bitsocialforge.com</a> · Privacy:{" "}
            <a href="mailto:privacy@bitsocialforge.com">privacy@bitsocialforge.com</a>
          </p>
        </footer>

        {/* Vercel Web Analytics (cookieless, disclosed in the Privacy Policy). Production only: in development
          the package loads a debug script from another origin, which the CSP blocks. */}
        {import.meta.env.PROD && <Analytics />}
      </div>
    </>
  );
}
