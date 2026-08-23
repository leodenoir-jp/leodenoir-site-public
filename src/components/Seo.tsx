import { useEffect } from "react";
import { siteConfig } from "../data/site";

type SeoProps = {
  title: string;
  description: string;
  noIndex?: boolean;
};

export function Seo({ title, description, noIndex = false }: SeoProps) {
  useEffect(() => {
    const pageTitle = `${title}｜${siteConfig.brandName}`;
    const canonicalUrl = `${siteConfig.url}${window.location.pathname === "/" ? "/" : window.location.pathname}`;
    const ogImage = `${siteConfig.url}/images/ogp-placeholder.svg`;

    document.title = pageTitle;
    setMeta("description", description);
    setProperty("og:title", pageTitle);
    setProperty("og:description", description);
    setProperty("og:url", canonicalUrl);
    setProperty("og:image", ogImage);
    setMeta("twitter:title", pageTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", ogImage);
    setMeta("robots", noIndex ? "noindex, nofollow" : "index, follow");
    setLink("canonical", canonicalUrl);
  }, [title, description, noIndex]);

  return null;
}

function setMeta(name: string, content: string) {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
}

function setProperty(property: string, content: string) {
  const meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (meta) meta.content = content;
}

function setLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}
