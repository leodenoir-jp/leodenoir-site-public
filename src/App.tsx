import { useEffect, useMemo, useState } from "react";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { ContactPage } from "./pages/ContactPage";
import { CounselingBookingPage } from "./pages/CounselingBookingPage";
import { HomePage } from "./pages/HomePage";
import { LearningPlatformPage } from "./pages/LearningPlatformPage";
import { LegalPageView } from "./pages/LegalPageView";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ServiceDetailPage } from "./pages/ServiceDetailPage";
import { ServicesPage } from "./pages/ServicesPage";

export type Route = {
  path: string;
  navigate: (href: string) => void;
};

const hasSupabaseAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has("code") || window.location.hash.includes("access_token") || window.location.hash.includes("error");
};

const normalizePath = () => {
  const counselingAdminCallback = window.location.pathname === "/counseling/admin";
  if (hasSupabaseAuthCallback() && window.location.pathname !== "/learning/student" && !counselingAdminCallback) {
    window.history.replaceState({}, "", `/learning/student${window.location.search}${window.location.hash}`);
  }
  const path = window.location.pathname.replace(/\/$/, "");
  return path === "" ? "/" : path;
};

export function App() {
  const [path, setPath] = useState(normalizePath);

  const navigate = (href: string) => {
    if (href.startsWith("http") || href.startsWith("mailto:")) {
      window.location.href = href;
      return;
    }
    window.history.pushState({}, "", href);
    setPath(normalizePath());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onPopState = () => setPath(normalizePath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const route = useMemo<Route>(() => ({ path, navigate }), [path]);

  return <Layout route={route}>{renderPage(route)}</Layout>;
}

function renderPage(route: Route) {
  if (route.path === "/") return <HomePage route={route} />;
  if (route.path === "/about") return <AboutPage route={route} />;
  if (route.path === "/services") return <ServicesPage route={route} />;
  if (route.path === "/contact") return <ContactPage />;
  if (route.path === "/counseling/booking" || route.path === "/counseling/admin") {
    return <CounselingBookingPage route={route} />;
  }
  if (route.path === "/learning" || route.path.startsWith("/learning/") || route.path === "/platform") {
    return <LearningPlatformPage route={route} />;
  }
  if (route.path === "/terms" || route.path === "/privacy" || route.path === "/specified-commercial-transactions") {
    return <LegalPageView route={route} />;
  }
  if (route.path.startsWith("/services/")) {
    return <ServiceDetailPage route={route} />;
  }
  return <NotFoundPage route={route} />;
}
