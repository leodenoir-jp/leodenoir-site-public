import type { MouseEvent, ReactNode } from "react";
import type { Route } from "../App";
import { siteConfig } from "../data/site";

type LayoutProps = {
  children: ReactNode;
  route: Route;
};

export function Layout({ children, route }: LayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand-mark" href="/" onClick={(event) => handleNav(event, "/", route.navigate)} aria-label="TOPへ移動">
            <img className="brand-logo" src={siteConfig.logoPath} alt="" />
            <span>
              <strong>{siteConfig.brandName}</strong>
              <small>{siteConfig.organization}</small>
            </span>
          </a>
          <nav className="main-nav" aria-label="メインナビゲーション">
            {siteConfig.navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={isActive(route.path, item.href) ? "active" : ""}
                onClick={(event) => handleNav(event, item.href, route.navigate)}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <Footer route={route} />
    </>
  );
}

function Footer({ route }: { route: Route }) {
  const menu = [
    ...siteConfig.navItems.filter((item) => item.href !== "/contact"),
    { label: "プライバシーポリシー", href: "/privacy" },
    { label: "特定商取引法に基づく表記", href: "/specified-commercial-transactions" }
  ];

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <section>
          <div className="footer-brand-lockup">
            <img src={siteConfig.logoPath} alt="" />
            <p className="footer-brand">{siteConfig.officialName}</p>
          </div>
          <p>{siteConfig.description}</p>
          <p className="footer-meta">運営者：{siteConfig.operator}</p>
          <p className="footer-meta">
            <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
          </p>
        </section>
        <section>
          <h2>Site Menu</h2>
          <ul>
            {menu.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={(event) => handleNav(event, item.href, route.navigate)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Contact</h2>
          <p>
            <a href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
              お問い合わせフォーム
            </a>
          </p>
        </section>
        <section>
          <h2>SNS Links</h2>
          <ul>
            {siteConfig.snsLinks.map((sns) => (
              <li key={sns.label}>
                {sns.url ? (
                  <a href={sns.url} target="_blank" rel="noreferrer">
                    {sns.label}
                  </a>
                ) : (
                  <span>{sns.label}（URL未設定）</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="copyright">© {new Date().getFullYear()} {siteConfig.officialName}</p>
    </footer>
  );
}

export function handleNav(event: MouseEvent<HTMLAnchorElement>, href: string, navigate: (href: string) => void) {
  if (href.startsWith("http") || href.startsWith("mailto:")) return;
  event.preventDefault();
  navigate(href);
}

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
