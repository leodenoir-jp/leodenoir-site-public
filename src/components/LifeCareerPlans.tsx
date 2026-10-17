import { useState } from "react";
import type { Route } from "../App";
import { handleNav } from "./Layout";

const plans = [
  {
    tier: "梅",
    name: "初月限定トライアル",
    english: "TRIAL",
    price: "30,000",
    term: "初月",
    direction: "今の自分を知り、まず動き出す",
    sessions: "60分 × 月2回",
    planning: "初期行動計画",
    review: "隔週",
    chat: "週1件まで",
    cta: "まずは試す",
    audience: "新規・初月だけ",
    totalPlanning: "初回90分",
    regularSessions: "月2回",
    additionalSessions: "なし",
    reviewDetail: "2週間に1回",
    horizon: "最初の30〜90日",
    planDetail: "直近の優先行動",
    chatDetail: "週1件",
    strategy: "対象外"
  },
  {
    tier: "竹",
    name: "スタンダード",
    english: "STANDARD",
    price: "50,000",
    term: "月",
    direction: "3ヶ月先の変化を積み重ねる",
    sessions: "60分 × 月4回",
    planning: "3ヶ月・フェーズ単位",
    review: "毎週",
    chat: "平日9〜17時",
    cta: "着実に取り組む",
    audience: "継続伴走",
    totalPlanning: "初回90分",
    regularSessions: "月4回",
    additionalSessions: "なし",
    reviewDetail: "週1回",
    horizon: "おおむね3ヶ月",
    planDetail: "フェーズ・課題管理",
    chatDetail: "平日対応",
    strategy: "対象外"
  },
  {
    tier: "松",
    name: "プレミアム",
    english: "PREMIUM",
    price: "75,000",
    term: "月",
    direction: "1年先の未来から、今を逆算する",
    sessions: "60分 × 月4回 ＋ 30分 × 最大月4回",
    planning: "6〜12ヶ月・月別単位",
    review: "最大週2回",
    chat: "土日祝も対応・優先返信",
    cta: "集中的に取り組む",
    audience: "集中伴走",
    totalPlanning: "初回90分",
    regularSessions: "月4回",
    additionalSessions: "30分 × 最大月4回",
    reviewDetail: "週最大2回",
    horizon: "6〜12ヶ月",
    planDetail: "フェーズ＋月別計画＋週次行動",
    chatDetail: "土日祝対応・優先返信",
    strategy: "+5,000円／月"
  }
] as const;

const cardFacts = [
  ["面談", "sessions"],
  ["計画", "planning"],
  ["レビュー", "review"],
  ["チャット", "chat"]
] as const;

const comparisonFacts = [
  ["対象", "audience"],
  ["トータルプランニング", "totalPlanning"],
  ["60分面談", "regularSessions"],
  ["追加面談", "additionalSessions"],
  ["レビュー頻度", "reviewDetail"],
  ["計画の時間軸", "horizon"],
  ["計画の粒度", "planDetail"],
  ["チャット", "chatDetail"],
  ["専用戦略書オプション", "strategy"]
] as const;

export function LifeCareerPlans({ route }: { route: Route }) {
  const [showComparison, setShowComparison] = useState(false);

  return (
    <section className="career-plans" aria-labelledby="career-plans-title">
      <div className="container career-plans-inner">
        <div className="career-plans-intro">
          <p className="career-plans-eyebrow">LIFE = CAREER COACHING</p>
          <h2 id="career-plans-title">3つのプランから選ぶ</h2>
          <p>今の自分を知る。3ヶ月先へ進む。1年先を見通す。</p>
          <span className="career-plans-ornament" aria-hidden="true">◆</span>
        </div>

        <div className="career-plan-grid">
          {plans.map((plan) => (
            <article className={`career-plan ${plan.tier === "松" ? "career-plan-featured" : ""}`} key={plan.tier}>
              <div className="career-plan-emblem" aria-hidden="true">{plan.tier}</div>
              <p className="career-plan-english">{plan.english}</p>
              <h3>{plan.name}</h3>
              <p className="career-plan-price"><strong>{plan.price}</strong><span>円／{plan.term}</span></p>
              <p className="career-plan-direction">{plan.direction}</p>
              <dl className="career-plan-facts">
                {cardFacts.map(([label, key]) => (
                  <div key={key}><dt>{label}</dt><dd>{plan[key]}</dd></div>
                ))}
              </dl>
              <a className="career-plan-cta" href="/contact" onClick={(event) => handleNav(event, "/contact", route.navigate)}>
                {plan.cta}<span aria-hidden="true">→</span>
              </a>
            </article>
          ))}
        </div>

        <div className="career-plan-comparison-control">
          <button type="button" onClick={() => setShowComparison((current) => !current)} aria-expanded={showComparison} aria-controls="career-plan-comparison">
            {showComparison ? "詳細比較を閉じる" : "プランを詳しく比較する"}<span aria-hidden="true">{showComparison ? "−" : "+"}</span>
          </button>
        </div>

        {showComparison ? (
          <div id="career-plan-comparison" className="career-plan-comparison">
            <h3>プラン詳細比較</h3>
            <div className="career-plan-table-wrap">
              <table>
                <thead><tr><th scope="col">比較項目</th>{plans.map((plan) => <th scope="col" key={plan.tier}>{plan.tier}｜{plan.name}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">料金</th>{plans.map((plan) => <td key={plan.tier}>{plan.price}円／{plan.term}</td>)}</tr>
                  {comparisonFacts.map(([label, key]) => (
                    <tr key={key}><th scope="row">{label}</th>{plans.map((plan) => <td key={plan.tier}>{plan[key]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="career-plan-mobile-comparison">
              {plans.map((plan) => (
                <article key={plan.tier}>
                  <h4>{plan.tier}｜{plan.name}</h4>
                  <p>{plan.price}円／{plan.term}</p>
                  <dl>{comparisonFacts.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{plan[key]}</dd></div>)}</dl>
                </article>
              ))}
            </div>
            <p className="career-plan-comparison-note">チャット対応は無制限・即時返信を意味しません。対応時間と返信目安は別途ご案内します。</p>
          </div>
        ) : null}

        <p className="career-plan-footnote">初回90分トータルプランニング付き（初月のみ）／竹・松は月次更新／松の専用キャリア戦略書は別途有料オプション。結果や昇進を保証するものではありません。</p>
      </div>
    </section>
  );
}
