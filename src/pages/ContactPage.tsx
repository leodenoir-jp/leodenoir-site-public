import { type FormEvent, useState } from "react";
import { Seo } from "../components/Seo";
import { services } from "../data/services";
import { siteConfig } from "../data/site";

export function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const topics = formData.getAll("topics");

    if (topics.length === 0) {
      form.reportValidity();
      setStatus("error");
      return;
    }

    setStatus("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          clientType: formData.get("clientType"),
          inquiryType: topics.join("、"),
          message: formData.get("message")
        })
      });

      if (!response.ok) {
        throw new Error("Failed to submit contact form.");
      }

      form.reset();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <Seo title="Contact" description="Leo de Noir / Workaholic Owl への相談・依頼はこちらからお問い合わせください。" />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Contact</p>
          <h1>お問い合わせ</h1>
          <p>お問い合わせについては、下記フォームより承っております。必要事項を入力・選択の上、送信ボタンを押してください。</p>
        </div>
      </section>
      <section className="section">
        <div className="container contact-layout">
          <form
            className="contact-form"
            name="contact"
            method="POST"
            onSubmit={handleSubmit}
          >
            {status === "sent" ? <p className="form-success">送信しました。</p> : null}
            {status === "error" ? <p className="form-success">送信できませんでした。必須項目を確認するか、送信先メールアドレスへ直接ご連絡ください。</p> : null}
            <input type="hidden" name="form-name" value="contact" />
            <label>
              名前 <span>必須</span>
              <input type="text" name="name" required autoComplete="name" />
            </label>
            <label>
              メールアドレス <span>必須</span>
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <fieldset>
              <legend>法人／個人 <span>必須</span></legend>
              <label className="inline-choice"><input type="radio" name="clientType" value="法人" required /> 法人</label>
              <label className="inline-choice"><input type="radio" name="clientType" value="個人" /> 個人</label>
            </fieldset>
            <fieldset>
              <legend>お問い合わせいただく項目 <span>必須</span></legend>
              <div className="checkbox-grid">
                {services.map((service) => (
                  <label className="inline-choice" key={service.slug}>
                    <input type="checkbox" name="topics" value={service.title} /> {service.title}
                  </label>
                ))}
                <label className="inline-choice"><input type="checkbox" name="topics" value="その他" /> その他</label>
              </div>
            </fieldset>
            <label>
              メッセージ <span>必須</span>
              <textarea name="message" rows={8} required />
            </label>
            <button className="button primary" type="submit" disabled={status === "sending"}>{status === "sending" ? "送信中" : "送信する"}</button>
          </form>
          <aside className="contact-aside">
            <h2>送信先</h2>
            <p>{siteConfig.contactEmail}</p>
          </aside>
        </div>
      </section>
    </>
  );
}
