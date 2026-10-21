import { tarotContactTerms, tarotEmailTerms, tarotExcludedTopics } from "../data/tarotTerms";

export function TarotTerms({ email = false }: { email?: boolean }) {
  return <div className="tarot-terms">
    {email ? <section className="tarot-email-section" aria-labelledby="booking-email-terms"><h2 id="booking-email-terms">メール鑑定について</h2>
      <p className="tarot-email-scope">以下はメール鑑定のみのご案内です。</p>
      {tarotEmailTerms.map(section => <div className="tarot-email-topic" key={section.title}><h3>{section.title}</h3>{section.paragraphs.map(p => <p key={p}>{p}</p>)}</div>)}
    </section> : <section><h2>ご予約にあたって</h2><p>{tarotExcludedTopics}</p><p>オンライン・対面鑑定は50分です。冒頭20分程度でご相談内容を伺います。お支払い方法はPayPayです。ご入金確認後に予約が確定します。Zoomリンクは入金確認後のメールでご案内します。</p></section>}
    <section><h2>ご連絡・キャンセルについて</h2>{tarotContactTerms.map(p => <p key={p}>{p}</p>)}</section>
  </div>;
}
