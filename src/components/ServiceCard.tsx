import type { Route } from "../App";
import type { Service } from "../data/services";
import { handleNav } from "./Layout";

type ServiceCardProps = {
  service: Service;
  route: Route;
};

export function ServiceCard({ service, route }: ServiceCardProps) {
  const href = `/services/${service.slug}`;
  const audienceLabels = getAudienceLabels(service);

  return (
    <a className="service-card" href={href} onClick={(event) => handleNav(event, href, route.navigate)}>
      <img src={service.image} alt="" loading="lazy" />
      <span className="label-row">
        {audienceLabels.map((label) => (
          <span className="category-label" key={label}>
            {label}
          </span>
        ))}
      </span>
      <h3>{service.title}</h3>
      <p className="price">{service.price}</p>
      <p>{service.summary}</p>
      <span className="text-link">詳細を見る</span>
    </a>
  );
}

function getAudienceLabels(service: Service) {
  if (service.slug === "voice-production-narration") return ["法人向け", "個人向け"];
  if (service.category === "組織変革・人材開発支援") return ["法人向け"];
  return ["個人向け"];
}
