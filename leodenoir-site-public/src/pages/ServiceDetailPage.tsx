import type { Route } from "../App";
import type { ReactNode } from "react";
import { handleNav } from "../components/Layout";
import { Seo } from "../components/Seo";
import { getServiceBySlug } from "../data/services";

export function ServiceDetailPage({ route }: { route: Route }) {
  const slug = route.path.replace("/services/", "");
  const service = getServiceBySlug(slug);

  if (!service) {
    return (
      <>
        <Seo title="サービスが見つかりません" description="指定されたサービスページは見つかりませんでした。" />
        <section className="page-hero">
          <div className="container">
            <h1>サービスが見つかりません</h1>
            <a className="button primary" href="/services" onClick={(event) => handleNav(event, "/services", route.navigate)}>
              Servicesへ戻る
            </a>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo title={service.title} description={service.summary} />
      <section className="page-hero service-detail-hero">
        <div className="container two-column">
          <div>
            <p className="eyebrow">{service.category}</p>
            <h1>{service.title}</h1>
            <p>{service.catchCopy}</p>
          </div>
          <img src={service.image} alt="" />
        </div>
      </section>
      <section className="section">
        <div className="container detail-layout">
          <article className="detail-main">
            <DetailSection title="サービス概要">
              {service.overview.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </DetailSection>
            <DetailSection title="このサービスで相談・依頼できること">
              <CheckList items={service.availableFor} />
            </DetailSection>
            <DetailSection title="対象となる方">
              {service.audienceIntro?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {service.audience.length > 0 ? <CheckList items={service.audience} /> : null}
            </DetailSection>
            <DetailSection title="料金">
              {service.price ? <p className="detail-price">{service.price}</p> : null}
              {service.priceDetails?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {service.priceItems && service.priceItems.length > 0 ? <CheckList items={service.priceItems} /> : null}
            </DetailSection>
            <DetailSection title="実施方法">
              {service.methodIntro?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {service.methodItems && service.methodItems.length > 0 ? <CheckList items={service.methodItems} /> : null}
              {service.method.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </DetailSection>
            <DetailSection title="注意事項">
              {service.notes.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </DetailSection>
          </article>
          <aside className="detail-side" aria-label="問い合わせ導線">
            <p className="category-label">{service.category}</p>
            <h2>問い合わせ</h2>
            <p>内容が固まっていない段階でも、まずはお問い合わせフォームからご相談ください。</p>
            <a className="button primary" href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
              問い合わせる
            </a>
            {service.externalUrl ? (
              <a className="button secondary" href={service.externalUrl}>
                外部サイトで確認する
              </a>
            ) : null}
          </aside>
        </div>
      </section>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="check-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
