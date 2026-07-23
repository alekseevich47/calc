import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  LOCATION_KEYWORDS,
  MARKING_NUM_ALIASES,
  MARKING_NUMBER_VARIANT_ALIASES,
  MARKING_TYPE_SIZE_ALIASES,
  MATERIAL_KEYWORDS,
  QUANTITY_UNIT_WORDS,
  TARIFF_KEYWORD,
  TARIFF_UNIT_WORDS,
} from "../lib/quickInputKeywords";

type HelpSection = {
  title: string;
  hint: string;
  chips: string[];
};

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Контент справки — из справочника ключевых слов (без дублирования списков). */
export function buildQuickInputHelpSections(): HelpSection[] {
  const markingNumChips = [
    ...Object.keys(MARKING_NUM_ALIASES),
    ...Object.entries(MARKING_NUMBER_VARIANT_ALIASES).flatMap(([num, variants]) =>
      variants.flatMap((v) => v.keywords.map((kw) => `${num} ${kw}`)),
    ),
  ];

  return [
    {
      title: "Место",
      hint: "Синонимы «Населённый пункт» и «Трасса» — регистр не важен.",
      chips: uniq([...LOCATION_KEYWORDS.np, ...LOCATION_KEYWORDS.road]),
    },
    {
      title: "№ разметки",
      hint: "Числовой код (1.1, 1.18…) или алиас. Для 1.18 / 1.24.1 / 1.24.2 после номера — уточняющее слово.",
      chips: uniq(markingNumChips),
    },
    {
      title: "Тип разметки",
      hint: "Только если у номера есть типы в справочнике (напр. 1.1, 1.14.1).",
      chips: uniq(MARKING_TYPE_SIZE_ALIASES),
    },
    {
      title: "Количество",
      hint: "Число; единица опциональна — слитно или через пробел.",
      chips: uniq(QUANTITY_UNIT_WORDS),
    },
    {
      title: "Материал",
      hint: "Последняя строка ввода. Алиасы сопоставляются с названием в справочнике.",
      chips: uniq(Object.keys(MATERIAL_KEYWORDS)),
    },
    {
      title: "Тариф",
      hint: "В последней строке: ключевое слово «тариф» + число (или просто число).",
      chips: uniq([TARIFF_KEYWORD, ...TARIFF_UNIT_WORDS]),
    },
  ];
}

function Chip({ children }: { children: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
        fontWeight: 500,
        color: "#374151",
        background: "rgba(0,0,0,0.05)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 8,
        padding: "3px 8px",
        lineHeight: 1.35,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function HelpBody() {
  const sections = buildQuickInputHelpSections();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0 8px" }}>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
        Порядок полей в строке не важен. Последняя строка — всегда материал и тариф.
      </p>
      {sections.map((sec) => (
        <div key={sec.title}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em", marginBottom: 4 }}>
            {sec.title}
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9ca3af", lineHeight: 1.4 }}>
            {sec.hint}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sec.chips.map((c) => (
              <Chip key={`${sec.title}:${c}`}>{c}</Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HelpChrome({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>
          Ключевые слова
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "#9ca3af",
            outline: "none",
            display: "flex",
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", minHeight: 0 }}>
        {children}
      </div>
    </>
  );
}

/** Mobile: поверх QuickInputSheet в #app-portal. */
export function QuickInputHelpSheet({ onClose }: { onClose: () => void }) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 220,
        pointerEvents: "auto",
        background: "rgba(0,0,0,0.38)",
        display: "flex",
        alignItems: "flex-end",
        animation: "fadeInBd 0.2s ease forwards",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "78%",
          maxHeight: "85dvh",
          background: "rgba(248,249,252,0.98)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          animation: "sheetUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
          fontFamily: "Inter, sans-serif",
          overflow: "hidden",
        }}
      >
        <HelpChrome onClose={onClose}>
          <HelpBody />
        </HelpChrome>
      </div>
    </div>,
    portal,
  );
}

/** Desktop: поверх QuickInputModal на document.body. */
export function QuickInputHelpModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          width: 460,
          maxHeight: "80vh",
          background: "rgba(248,249,252,0.99)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 24,
          boxShadow: "0 24px 80px rgba(0,0,0,0.20)",
          display: "flex",
          flexDirection: "column",
          animation: "fadeUp 0.22s ease forwards",
          overflow: "hidden",
        }}
      >
        <HelpChrome onClose={onClose}>
          <HelpBody />
        </HelpChrome>
      </div>
    </div>,
    document.body,
  );
}
