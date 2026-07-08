import type { Route } from "../App";
import { SectionHeader } from "../components/SectionHeader";
import { Seo } from "../components/Seo";
import { ServiceCard } from "../components/ServiceCard";
import { serviceCategories, services } from "../data/services";

export function ServicesPage({ route }: { route: Route }) {
  return (
    <>
      <Seo title="Services" description="法人向け、個人向け、教育、制作依頼の各サービスを一覧で紹介します。" />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Services</p>
          <h1>相談・依頼できること</h1>
          <p>目的別にサービスを整理しています。カードを選択すると詳細ページへ移動します。</p>
        </div>
      </section>
      {serviceCategories.map((category) => (
        <section className="section" key={category}>
          <div className="container">
            <SectionHeader title={category} />
            <div className="service-grid">
              {services
                .filter((service) => service.category === category)
                .map((service) => (
                  <ServiceCard key={service.slug} service={service} route={route} />
                ))}
            </div>
          </div>
        </section>
      ))}
      <section className="section muted">
        <div className="container narrow">
          <h2>お支払いについて</h2>
          <p>各種サービス先で支払い方法を指定しております。その際に、キャンセルポリシーおよび予約方法についてもご確認ください。</p>
        </div>
      </section>
    </>
  );
}
