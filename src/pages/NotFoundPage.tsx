import type { Route } from "../App";
import { handleNav } from "../components/Layout";
import { Seo } from "../components/Seo";

export function NotFoundPage({ route }: { route: Route }) {
  return (
    <>
      <Seo title="404 Not Found" description="お探しのページは見つかりませんでした。" />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">404</p>
          <h1>お探しのページは見つかりませんでした。</h1>
          <p>URLをご確認いただくか、TOPページから目的のページをお探しください。</p>
          <a className="button primary" href="/" onClick={(event) => handleNav(event, "/", route.navigate)}>
            TOPへ戻る
          </a>
        </div>
      </section>
    </>
  );
}
