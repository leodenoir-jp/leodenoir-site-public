import type { Route } from "../App";
import { handleNav } from "../components/Layout";
import { Seo } from "../components/Seo";
import { legalPages, type LegalBlock, type LegalListItem } from "../data/legal";

export function LegalPageView({ route }: { route: Route }) {
  const slug = route.path.replace("/", "");
  const page = legalPages.find((item) => item.slug === slug);

  if (!page) {
    return null;
  }

  return (
    <>
      <Seo title={page.title} description={page.description} />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Legal</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
      </section>
      <section className="section">
        <article className="container narrow legal-body">
          {page.body.map((block, index) => renderLegalBlock(block, index))}
          {page.slug === "terms" ? (
            <div className="legal-links">
              <a href="/privacy" onClick={(event) => handleNav(event, "/privacy", route.navigate)}>
                プライバシーポリシー
              </a>
              <a href="/specified-commercial-transactions" onClick={(event) => handleNav(event, "/specified-commercial-transactions", route.navigate)}>
                特定商取引法に基づく表記
              </a>
            </div>
          ) : null}
        </article>
      </section>
    </>
  );
}

function renderLegalBlock(block: LegalBlock, index: number) {
  if (block.type === "heading") {
    return (
      <h2 className="legal-section-heading" key={`${block.text}-${index}`}>
        {block.text}
      </h2>
    );
  }

  if (block.type === "orderedList") {
    return (
      <ol className="legal-list" key={`ordered-${index}`}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  if (block.type === "unorderedList") {
    return (
      <ul className="legal-list" key={`unordered-${index}`}>
        {block.items.map((item) => renderListItem(item))}
      </ul>
    );
  }

  return <p key={`${block.text}-${index}`}>{block.text}</p>;
}

function renderListItem(item: LegalListItem) {
  if (typeof item === "string") {
    return <li key={item}>{item}</li>;
  }

  return (
    <li key={item.text}>
      {item.text}
      <ul>
        {item.children.map((child) => (
          <li key={child}>{child}</li>
        ))}
      </ul>
    </li>
  );
}
