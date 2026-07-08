import type { Route } from "../App";
import { SectionHeader } from "../components/SectionHeader";
import { Seo } from "../components/Seo";
import { ServiceCard } from "../components/ServiceCard";
import { services } from "../data/services";
import { siteConfig } from "../data/site";
import { handleNav } from "../components/Layout";

export function HomePage({ route }: { route: Route }) {
  const featured = services.filter((service) =>
    ["human-capital-consulting", "life-career-coaching", "online-japanese-lesson", "voice-production-narration"].includes(service.slug)
  );

  return (
    <>
      <Seo title="TOP" description="Leo de Noir / Workaholic Owl は、対話・教育・実務支援・表現活動を通じて、個人と組織が自分の役割を見つめ、自ら次の一歩を選び取るための公式窓口です。" />
      <section className="hero-section">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Official Site</p>
            <h1>自ら成長し、変化する個人と、自律型組織へ。</h1>
            <p>
              Leo de Noir / Workaholic Owl は、対話・教育・実務支援・表現活動を通じて、個人と組織が自分の役割を見つめ、
              自ら次の一歩を選び取るための公式窓口です。
            </p>
            <p>
              仕事、キャリア、人間関係、組織づくり、教育、表現活動に関するご相談を承ります。
            </p>
            <div className="button-row">
              <a className="button primary" href="/services" onClick={(event) => handleNav(event, "/services", route.navigate)}>
                Servicesを見る
              </a>
              <a className="button secondary" href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
                相談する
              </a>
            </div>
          </div>
          <div className="hero-panel" aria-label="サイト概要">
            <p>Leo de Noir</p>
            <ul>
              <li>対話</li>
              <li>教育</li>
              <li>表現活動</li>
              <li>実務支援</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column">
          <SectionHeader
            eyebrow="About"
            title="あなたの言葉にならない想いを整理し、自律的な成長と変化に伴走します。"
            description="Leo de Noir / Workaholic Owl は、組織変革・人材開発支援、キャリア形成・対話支援、教育、専門相談・制作依頼を行っています。"
          />
          <p className="lead-text">
            個人の変化は、やがてチームや組織に波紋のように広がっていきます。
            一人ひとりの可能性を信じ、その人が持つ力を最大限に引き出すことを、Leo de Noir / Workaholic Owl の活動の軸としています。
          </p>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <SectionHeader eyebrow="Entrances" title="主要事業および活動" description="法人向け支援から個人向け相談まで、個人の成長と組織変革を一気通貫で支えるサービスを展開しています。" />
          <div className="entrance-grid">
            {[
              ["組織変革・人財開発支援", "人材育成、組織変革、リーダーシップ開発、人的資本経営の支援。"],
              ["キャリア形成・対話支援", "仕事、キャリア、人間関係、人生の選択に関する対話と整理。"],
              ["教育", "日本語レッスン、英語発音コーチングなど、言葉に関する教育。"],
              ["専門相談・制作依頼", "不動産終活相談、音声制作、ナレーションなどの専門相談・案件依頼。"]
            ].map(([title, text]) => (
              <article className="entrance-item" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeader eyebrow="Featured Services" title="代表サービス" description="まず確認していただきたいサービスを抜粋しています。" />
          <div className="service-grid">
            {featured.map((service) => (
              <ServiceCard key={service.slug} service={service} route={route} />
            ))}
          </div>
          <div className="center-action">
            <a className="button secondary" href="/services" onClick={(event) => handleNav(event, "/services", route.navigate)}>
              すべてのサービスを見る
            </a>
          </div>
        </div>
      </section>

      <section className="section dark-band">
        <div className="container cta-band">
          <div>
            <p className="eyebrow">Contact</p>
            <h2>まだ言葉になっていない相談も、まずはフォームから。</h2>
          </div>
          <a className="button light" href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
            お問い合わせへ
          </a>
        </div>
      </section>

      <section className="section">
        <div className="container sitemap-list">
          <SectionHeader eyebrow="Site Guide" title="サイト案内" />
          <a href="/about" onClick={(event) => handleNav(event, "/about", route.navigate)}>About Me：運営者と活動理念について</a>
          <a href="/services" onClick={(event) => handleNav(event, "/services", route.navigate)}>Services：サービス一覧</a>
          <a href="/terms" onClick={(event) => handleNav(event, "/terms", route.navigate)}>利用規約</a>
          <a href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>Contact：問い合わせ</a>
        </div>
      </section>
    </>
  );
}
