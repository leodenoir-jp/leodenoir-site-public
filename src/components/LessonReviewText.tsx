import { useId, useState } from "react";
import type { PlatformLanguage } from "../data/platform";
import { lessonReviewTranslations } from "../data/lessonReviewTranslations";
import "./LessonReviewText.css";

const labels = {
  ja: { language: "レビューの言語", original: "原文", translated: "翻訳", showOriginal: "原文を読む" },
  en: { language: "Review language", original: "Original", translated: "Translation", showOriginal: "Read original" },
  "zh-Hant": { language: "評論語言", original: "原文", translated: "翻譯", showOriginal: "閱讀原文" }
};

export function LessonReviewText({ id, comment, language }: {
  id: string;
  comment: string;
  language: PlatformLanguage;
}) {
  const selectId = useId();
  const [selection, setSelection] = useState<string | null>(null);
  const translations = lessonReviewTranslations[id];
  const text = labels[language];
  const defaultLanguage = language !== "zh-Hant" && translations?.[language] ? language : "original";
  const selected = selection ?? defaultLanguage;
  const translated = selected === "ja" || selected === "en" ? translations?.[selected] : undefined;

  if (!translations) return <p className="lesson-review-body">{comment}</p>;

  return (
    <div className="lesson-review-text">
      <div className="lesson-review-language">
        <label htmlFor={selectId}>{text.language}</label>
        <select id={selectId} value={selected} onChange={(event) => setSelection(event.target.value)}>
          <option value="original">{text.original}</option>
          {translations.ja && <option value="ja">日本語 · {text.translated}</option>}
          <option value="en">English · {text.translated}</option>
        </select>
      </div>
      {translated && <span className="lesson-review-translation-label">{text.translated}</span>}
      <p className="lesson-review-body" lang={translated ? selected : undefined}>{translated ?? comment}</p>
      {translated && (
        <details className="lesson-review-original">
          <summary>{text.showOriginal}</summary>
          <p className="lesson-review-body">{comment}</p>
        </details>
      )}
    </div>
  );
}
