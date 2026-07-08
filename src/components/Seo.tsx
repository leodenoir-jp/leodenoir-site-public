import { useEffect } from "react";
import { siteConfig } from "../data/site";

type SeoProps = {
  title: string;
  description: string;
};

export function Seo({ title, description }: SeoProps) {
  useEffect(() => {
    const pageTitle = `${title}｜${siteConfig.brandName}`;
    const canonicalUrl = `${siteConfig.url}${window.location.pathname === "/" ? "/" : window.location.pathname}`;
    const ogImage = `${siteConfig.url}/assets/images/ogp-placeholder.svg`;

    document.title = pageTitle;
    setMeta("description", description);
    setProperty("og:title", pageTitle);
    setProperty("og:description", description);
    setProperty("og:url", canonicalUrl);
    setProperty("og:image", ogImage);
    setMeta("twitter:title", pageTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", ogImage);
    setLink("canonical", canonicalUrl);
  }, [title, description]);

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
