import type { Route } from "../App";
import { handleNav } from "../components/Layout";
import { SectionHeader } from "../components/SectionHeader";
import { Seo } from "../components/Seo";
import { siteConfig } from "../data/site";

export function AboutPage({ route }: { route: Route }) {
  return (
    <>
      <Seo title="About Me" description="Leo de Noir / Workaholic Owl の運営者、活動領域、理念を紹介します。" />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">About Me</p>
          <h1>たった一人の変化から、組織や社会に変革をもたらすと信じて。</h1>
          <p>{siteConfig.officialName} の運営者と活動理念を紹介します。</p>
        </div>
      </section>
      <section className="section">
        <div className="container profile-layout">
          <img src="/images/operator-profile.png" alt="請井 悠貴子のプロフィール写真" />
          <div>
            <SectionHeader eyebrow="Profile" title="請井 悠貴子（うけい ゆきこ）" />
            <p>
              2026年1月に独立。
            </p>
            <p>
              Leo de Noir をメインブランドとして、Workaholic Owl の活動を通じ、組織変革・人材開発支援、
              キャリア形成・対話支援、言語・学習支援、専門相談・音声制作などを行っています。
            </p>
            <p>
              10年以上の社会人経験と8年超の経営コンサルティング経験をもとに、「傍を楽にする」ことを活動の軸として、
              法人・個人を問わず、お声がけくださるお一人おひとりと向き合っています。
            </p>
            <p>
              仕事・人生・組織のなかで生まれる違和感や迷いを、対話と実務の両面から整理し、
              その人自身が納得して動き出すための支援を大切にしています。
              一人の変化は、やがてチームや組織へと波紋のように広がっていく。その積み重ねが、日本社会の活性化にもつながると信じています。
            </p>
            <p>
              個人の方には、現職でのさらなる活躍、キャリア形成、独立・起業に向けた思考整理と行動支援を。
            </p>
            <p>
              法人・団体の方には、組織のパフォーマンス向上、人材開発、管理職育成、自律型組織づくりに向けた支援を行っています。
            </p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container narrow">
          <SectionHeader eyebrow="Philosophy" title="活動理念" />
          <p>
            「日本」という国、そしてそこに息づく土地・文化・営みを後世に残すために、自分の命をどう使うか。
          </p>
          <p>
            この問いを礎（いしずえ）にして、Leo de Noir / Workaholic Owl は活動しています。
          </p>
          <p>
            私にできることは、自分の才能を正しく使い、誰かの「傍を楽にする」こと。
            そして、関わってくださるお一人おひとりが、自分の人生における役割や現在地を受け止め、
            自らの意思で人生の舵を取れるよう支援することです。
          </p>
          <p>
            一人の変化は、周囲に静かに波紋のように広がっていきます。
          </p>
          <p>
            個人が変われば、成果が変わる。
            成果が変われば、チームが変わる。
            チームが変われば、組織が変わる。
            そして、自律した個人と組織が増えていけば、社会にも確かな変化が生まれていく。
          </p>
          <p>
            Leo de Noir / Workaholic Owl が目指すのは、自分の人生や役割を受け止め、自ら成長し、変化していく人を増やすこと。
            その積み重ねを通じて、日本社会の活性化と、土地・文化・営みの継承に寄与していくことです。
          </p>
          <a className="button primary" href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
            相談・依頼する
          </a>
        </div>
      </section>
      <section className="section">
        <div className="container narrow">
          <SectionHeader eyebrow="Background" title="主な経歴" />
          <div className="background-block">
            <h3>組織変革・人的資本経営支援</h3>
            <p>
              8年超の経営コンサルティング経験を通じて、大手企業・中小企業・ベンチャー企業まで、幅広い規模の企業支援に従事。
              人的資本経営、組織変革、DE&I、女性リーダー育成、全社コミュニケーション設計、グローバル人材活用構想など、人と組織の変化に関わるプロジェクトを支援。
            </p>
          </div>
          <div className="background-block">
            <h3>人材開発・研修設計／研修講師</h3>
            <p>
              職位別キャリアパス、昇格キャリアパス、女性経営幹部候補育成、オンボーディング、パーパス浸透など、組織の成長段階に応じた人材開発・研修設計に携わる。
              経営層・管理職・リーダー層向けのワークショップや、受講者が現場で行動に移せる研修設計・ファシリテーションを経験。
            </p>
          </div>
          <div className="background-block">
            <h3>事業推進・業務改善・プロジェクトマネジメント</h3>
            <p>
              EC事業部門にて、営業・マネジメント・業務改善・データ整備・大手企業との営業基盤構築などを担当。
              コンサルティング領域では、BPO、IFRS移行、基幹システム刷新、ナレッジ基盤構築、デジタルツイン導入など、複数の横断プロジェクトにPMOとして関与。
            </p>
          </div>
          <div className="background-block">
            <h3>国際経験・コミュニケーション領域</h3>
            <p>
              関西学院大学 総合政策学部卒業。在学中はハワイ大学マノア校への交換留学、国連タンザニア事務所でのインターンシップを経験。
              日本語を母語とし、英語でのビジネスコミュニケーションにも対応。
            </p>
          </div>

          <SectionHeader eyebrow="Achievements" title="主な実績" />
          <div className="background-block">
            <h3>組織変革・人的資本経営領域</h3>
            <ul className="check-list">
              <li>DE&I施策設計、全社向けコミュニケーションプラン設計、女性リーダー育成に向けた職位・研修設計などを支援。</li>
              <li>グローバル人材活用プロジェクトにて、経営層インタビュー、組織課題分析、To-Beモデル設計、改善施策提案、実行ロードマップ策定を担当。</li>
              <li>経営幹部候補、管理職、リーダー層向けの研修・ワークショップ設計およびファシリテーションを経験。</li>
            </ul>
          </div>
          <div className="background-block">
            <h3>事業推進・業務改善領域</h3>
            <ul className="check-list">
              <li>EC事業において、営業マネジメント期間中に粗利率5％改善を実現。</li>
              <li>約200万件の商品データクレンジングおよび業務プロセス整備を、3ヶ月で推進。</li>
              <li>大手企業との営業基盤構築プロジェクトを、17名規模のプロジェクトメンバーとともに推進。</li>
              <li>Yahoo!・楽天において、2018年のベストDIYオンラインショップとして評価されたEC事業の運営に携わる。</li>
            </ul>
          </div>
          <div className="background-block">
            <h3>個人支援・自事業領域</h3>
            <ul className="check-list">
              <li>
                ライフ=キャリアコーチングにより、3ヶ月で売上3.3倍、リピート顧客6倍を実現。
                関連記事：https://note.com/leotimez555/n/n1de7ccfa6b47
              </li>
              <li>
                ライフ=キャリアコーチングにより、女性管理職のリーダーシップ醸成を支援。
                関連記事：https://note.com/leotimez555/n/n0242d4c8b90a
              </li>
              <li>独立後3ヶ月間で、自事業における各種サービス200件成約。</li>
              <li>タロットカード鑑定 1,800件実施。（2026年7月7日時点）</li>
              <li>オンライン日本語レッスン 352レッスン完了。（2026年7月7日時点）</li>
            </ul>
          </div>
        </div>
      </section>
      <section className="section muted">
        <div className="container info-grid about-support-grid">
          <article className="info-block">
            <h2>資格</h2>
            <h3>メンタルヘルス・心理支援</h3>
            <ul>
              <li>メンタルヘルス・マネジメント検定 I種</li>
              <li>JADP認定 メンタル心理カウンセラー</li>
            </ul>
            <h3>専門相談・鑑定</h3>
            <ul>
              <li>不動産終活士</li>
              <li>JFTA 日本占い師協会認定 タロットカード士</li>
            </ul>
            <h3>語学</h3>
            <ul>
              <li>TOEIC 950点</li>
              <li>TOEFL iBT 112点</li>
            </ul>
          </article>
          <article className="info-block">
            <h2>SNSでの活動</h2>
            <ul>
              {siteConfig.snsLinks.map((sns) => (
                <li key={sns.label}>
                  <a href={sns.url} target="_blank" rel="noreferrer">
                    {sns.label}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  );
}
