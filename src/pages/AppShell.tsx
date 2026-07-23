import { useRef, useState, useEffect, useMemo } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { createPortal } from "react-dom";
import { X, Check, Home, List, User, Plus, Calculator, Wifi, WifiOff, RefreshCw, CloudOff, HelpCircle } from "lucide-react";
import { QuickInputHelpModal, QuickInputHelpSheet } from "./QuickInputHelp";
import {
  BottomNav, DropdownCard, DesktopDropdown,
  type SyncStatus, type MarkingNumMeta,
} from "../components/shared";
import { markingTypesByNumberId, sortedMarkingNumbers } from "../lib/db";
import { markingNumberImageUrl } from "../lib/pocketbase";
import { MARKING_NUMBER_VARIANT_ALIASES } from "../lib/quickInputKeywords";
import {
  parseMaterialTariffLine,
  parseQuickInput,
  parseWorkLine,
} from "../lib/quickInputParser";
import { peekSyncSnapshot, syncNow, useDictionaries, useSyncStatus } from "../lib/sync";

// ─── Types shared with pages ──────────────────────────────────────────────────

export interface QuickRow {
  location: string;
  markingNum: string;
  markingNumberId?: string;
  markingType: string;
  volume: number;
  material: string;
  tariff: number;
}

export interface ShellContext {
  phoneRef: React.RefObject<HTMLDivElement | null>;
  registerAddRow: (fn: (rows: QuickRow[]) => void) => void;
  isDesktop: boolean;
}

type WorkCard = {
  location: string;
  markingNum: string;
  markingNumberId: string;
  markingType: string;
  volume: number;
};

type MaterialCard = {
  material: string;
  tariff: number;
};

type EditTarget =
  | { kind: "work"; index: number; field: "location" | "markingNum" | "markingType" }
  | { kind: "material"; field: "material" }
  | { kind: "text"; key: string; field: "volume" | "tariff"; workIndex?: number };

// ─── Responsive hook ──────────────────────────────────────────────────────────

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isDesktop;
}

function workCardFromParsed(row: ReturnType<typeof parseWorkLine>): WorkCard {
  return {
    location: row.location.value,
    markingNum: row.markingNum.value,
    markingNumberId: row.markingNumberId.value,
    markingType: row.markingType.value,
    volume: row.volume.value,
  };
}

function materialCardFromParsed(mt: ReturnType<typeof parseMaterialTariffLine>): MaterialCard {
  return { material: mt.material.value, tariff: mt.tariff.value };
}

/** Собрать строку работы из карточки — для повторного прогона «Проверить». */
function workCardToLine(card: WorkCard): string {
  const parts: string[] = [];
  if (card.location.trim()) parts.push(card.location.trim());
  if (card.markingNum.trim()) parts.push(card.markingNum.trim());
  // Вариант с одинаковым number — вернуть ключевое слово, иначе парсер снова потеряет id.
  if (card.markingNumberId) {
    for (const variants of Object.values(MARKING_NUMBER_VARIANT_ALIASES)) {
      const v = variants.find((x) => x.id === card.markingNumberId);
      if (v?.keywords[0]) {
        parts.push(v.keywords[0]);
        break;
      }
    }
  }
  if (card.markingType.trim()) parts.push(card.markingType.trim());
  if (card.volume > 0) parts.push(String(card.volume));
  return parts.join(", ");
}

function materialCardToLine(card: MaterialCard): string {
  const parts: string[] = [];
  if (card.material.trim()) parts.push(card.material.trim());
  if (card.tariff > 0) parts.push(`тариф ${card.tariff}`);
  return parts.join(", ");
}

// ─── Quick Input (mobile = bottom sheet, desktop = centered modal) ────────────

function FieldRow({
  label, display, hasVal, editing, onTap, children,
}: {
  label: string;
  display: string;
  hasVal: boolean;
  editing?: boolean;
  onTap?: (el: HTMLElement) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={editing || !onTap ? undefined : (e) => onTap(e.currentTarget)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)",
        cursor: editing || !onTap ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, justifyContent: "flex-end" }}>
        {editing && children ? children : (
          <>
            <span style={{
              fontSize: 13, fontWeight: hasVal ? 600 : 400,
              color: hasVal ? "#111827" : "#c4c9d4",
              textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {hasVal ? display : "не распознано"}
            </span>
            {hasVal
              ? <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(5,150,105,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} strokeWidth={2.5} color="#059669" />
                </div>
              : <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.05)", flexShrink: 0 }} />
            }
          </>
        )}
      </div>
    </div>
  );
}

function QuickInputContent({ onClose, onAdd, isDesktop }: {
  onClose: () => void;
  onAdd: (rows: QuickRow[]) => void;
  isDesktop: boolean;
}) {
  const dicts = useDictionaries();
  const [text, setText] = useState("");
  const [workCards, setWorkCards] = useState<WorkCard[]>([]);
  const [materialCard, setMaterialCard] = useState<MaterialCard | null>(null);
  const [dirty, setDirty] = useState(false);
  const [recognizedOnce, setRecognizedOnce] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>();
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 240 });
  const [textDraft, setTextDraft] = useState("");
  const sheetBodyRef = useRef<HTMLDivElement>(null);

  const markingMeta = useMemo(() => {
    const meta: Record<string, MarkingNumMeta> = {};
    const ids: string[] = [];
    if (!dicts) return { ids, meta, typesById: {} as Record<string, string[]> };
    for (const n of sortedMarkingNumbers(dicts)) {
      ids.push(n.id);
      meta[n.id] = {
        label: n.number,
        description: n.description,
        imageUrls: (n.images ?? []).map((f) => markingNumberImageUrl(n.id, f)).filter(Boolean),
      };
    }
    return { ids, meta, typesById: markingTypesByNumberId(dicts) };
  }, [dicts]);

  const locations = dicts?.locations.map((x) => x.name) ?? [];
  const materials = dicts?.materials.map((x) => x.name) ?? [];
  const hasCards = workCards.length > 0 && materialCard !== null;

  function clearCards() {
    setWorkCards([]);
    setMaterialCard(null);
    setDirty(false);
    setParseError(undefined);
    setEdit(null);
  }

  function handleRecognize() {
    if (!dicts) {
      setParseError("Справочники ещё не загружены");
      return;
    }
    setRecognizedOnce(true);
    const result = parseQuickInput(text, dicts);
    if (result.error) {
      setParseError(result.error);
      setWorkCards([]);
      setMaterialCard(null);
      setDirty(false);
      return;
    }
    setParseError(undefined);
    setWorkCards(result.workRows.map(workCardFromParsed));
    setMaterialCard(result.materialTariff ? materialCardFromParsed(result.materialTariff) : null);
    setDirty(false);
    setEdit(null);
  }

  function handleVerify() {
    if (!dicts || !materialCard || workCards.length === 0) return;
    setWorkCards((prev) =>
      prev.map((c) => workCardFromParsed(parseWorkLine(workCardToLine(c), dicts))),
    );
    setMaterialCard(
      materialCardFromParsed(parseMaterialTariffLine(materialCardToLine(materialCard), dicts)),
    );
    setDirty(false);
    setEdit(null);
  }

  function handleAdd() {
    if (!materialCard || workCards.length === 0) return;
    const rows: QuickRow[] = workCards.map((w) => ({
      location: w.location,
      markingNum: w.markingNum,
      markingNumberId: w.markingNumberId || undefined,
      markingType: w.markingType,
      volume: w.volume,
      material: materialCard.material,
      tariff: materialCard.tariff,
    }));
    onAdd(rows);
    onClose();
  }

  function markDirty() {
    setDirty(true);
  }

  function openDrop(target: EditTarget, el: HTMLElement | null) {
    if (!el) return;
    if (edit && JSON.stringify(edit) === JSON.stringify(target)) {
      setEdit(null);
      return;
    }
    const tb = el.getBoundingClientRect();
    if (isDesktop) {
      const ddW = target.kind === "work" && target.field === "markingNum"
        ? Math.min(300, window.innerWidth - 32)
        : 240;
      setDropPos({ top: tb.bottom + 4, left: tb.left, width: ddW });
    } else {
      const body = sheetBodyRef.current;
      if (!body) return;
      const pb = body.getBoundingClientRect();
      const ddW = target.kind === "work" && target.field === "markingNum"
        ? Math.min(300, pb.width - 16)
        : 240;
      let left = tb.left - pb.left;
      if (left + ddW > pb.width - 8) left = pb.width - ddW - 8;
      if (left < 8) left = 8;
      // + scrollTop: dropdown absolute внутри scroll-контейнера
      setDropPos({ top: tb.bottom - pb.top + body.scrollTop + 4, left, width: ddW });
    }
    setEdit(target);
  }

  function openTextEdit(field: "volume" | "tariff", workIndex?: number, current?: string) {
    setTextDraft(current ?? "");
    setEdit({ kind: "text", key: field === "tariff" ? "tariff" : `vol-${workIndex}`, field, workIndex });
  }

  function commitTextEdit() {
    if (!edit || edit.kind !== "text") return;
    const n = parseFloat(textDraft.replace(",", ".")) || 0;
    if (edit.field === "tariff") {
      setMaterialCard((prev) => prev ? { ...prev, tariff: n } : { material: "", tariff: n });
    } else if (edit.workIndex !== undefined) {
      setWorkCards((prev) => prev.map((c, i) => i === edit.workIndex ? { ...c, volume: n } : c));
    }
    markDirty();
    setEdit(null);
  }

  function selectWorkField(index: number, field: "location" | "markingNum" | "markingType", value: string) {
    setWorkCards((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      if (field === "location") return { ...c, location: value };
      if (field === "markingNum") {
        const meta = markingMeta.meta[value];
        const types = markingMeta.typesById[value] ?? [];
        const nextType = c.markingType && types.includes(c.markingType) ? c.markingType : "";
        return {
          ...c,
          markingNumberId: value,
          markingNum: meta?.label ?? value,
          markingType: nextType,
        };
      }
      return { ...c, markingType: value };
    }));
    markDirty();
    setEdit(null);
  }

  function selectMaterial(value: string) {
    setMaterialCard((prev) => ({ material: value, tariff: prev?.tariff ?? 0 }));
    markDirty();
    setEdit(null);
  }

  const dropOptions = (() => {
    if (!edit || edit.kind === "text") return [] as string[];
    if (edit.kind === "material") return materials;
    const card = workCards[edit.index];
    if (!card) return [];
    if (edit.field === "location") return locations;
    if (edit.field === "markingNum") return markingMeta.ids;
    return markingMeta.typesById[card.markingNumberId] ?? [];
  })();

  const dropValue = (() => {
    if (!edit || edit.kind === "text") return "";
    if (edit.kind === "material") return materialCard?.material ?? "";
    const card = workCards[edit.index];
    if (!card) return "";
    if (edit.field === "location") return card.location;
    if (edit.field === "markingNum") return card.markingNumberId || card.markingNum;
    return card.markingType;
  })();

  const dropMeta = edit?.kind === "work" && edit.field === "markingNum" ? markingMeta.meta : undefined;

  function onDropSelect(v: string) {
    if (!edit || edit.kind === "text") return;
    if (edit.kind === "material") selectMaterial(v);
    else selectWorkField(edit.index, edit.field, v);
  }

  const primaryBtn = !hasCards ? null : dirty ? "verify" : "add";

  return (
    <>
      <style>{`
        .qi-textarea {
          width: 100%; flex: 1; min-height: 100px;
          background: rgba(0,0,0,0.04);
          border: 1.5px solid rgba(0,0,0,0.09); border-radius: 14px;
          padding: 12px 14px; resize: none;
          font-size: 14px; line-height: 1.6; color: #111827;
          font-family: Inter, sans-serif;
          outline: none; box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .qi-textarea:focus {
          border-color: rgba(255,107,0,0.5);
          box-shadow: 0 0 0 3px rgba(255,107,0,0.10);
          background: #fff;
        }
        .qi-textarea::placeholder { color: #b0b7c3; }
        .qi-num-input {
          width: 96px; height: 32px; border-radius: 8px;
          border: 1.5px solid rgba(255,107,0,0.45);
          background: #fff; padding: 0 10px;
          font-size: 13px; font-weight: 600; color: #111827;
          font-family: Inter, sans-serif; outline: none; text-align: right;
          box-sizing: border-box;
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 12px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Быстрый ввод текстом</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="Справка по ключевым словам"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", outline: "none", display: "flex" }}
          >
            <HelpCircle size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", outline: "none", display: "flex" }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div ref={sheetBodyRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
        <textarea
          className="qi-textarea"
          placeholder="Введите данные произвольно..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRecognizedOnce(false);
            clearCards();
          }}
        />
        <div style={{ margin: 0, fontSize: 11, color: "#9ca3af", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0 }}>
            Шаблон:{" "}
            <span style={{ color: "#6b7280", whiteSpace: "pre-line" }}>
              {"Место, № разметки, тип разметки (если имеется), количество\nМатериал, тариф"}
            </span>
          </p>
          <p style={{ margin: 0 }}>
            Пример:{" "}
            <span style={{ color: "#6b7280", whiteSpace: "pre-line" }}>
              {"Трасса, 1.24.2 обгон, 2\nкраска, 150"}
            </span>
          </p>
        </div>
        {!recognizedOnce && (
          <button
            onClick={handleRecognize}
            disabled={!text.trim()}
            style={{
              height: 44, borderRadius: 12, border: "none",
              background: text.trim() ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "rgba(0,0,0,0.07)",
              color: text.trim() ? "#fff" : "#b0b7c3",
              fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif",
              cursor: text.trim() ? "pointer" : "not-allowed", outline: "none",
              boxShadow: text.trim() ? "0 4px 14px rgba(255,107,0,0.26)" : "none",
            }}
          >
            Распознать
          </button>
        )}

        {parseError && (
          <p style={{ margin: 0, fontSize: 12, color: "#ef4444", lineHeight: 1.4 }}>{parseError}</p>
        )}

        {hasCards && (
          <div style={{ animation: "fadeUp 0.2s ease forwards", display: "flex", flexDirection: "column", gap: 10 }}>
            {workCards.map((card, index) => {
              const typeOpts = markingMeta.typesById[card.markingNumberId] ?? [];
              const showType = typeOpts.length > 0;
              const editingVol = edit?.kind === "text" && edit.field === "volume" && edit.workIndex === index;
              return (
                <div key={index} style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      Строка {index + 1}
                    </span>
                  </div>
                  <FieldRow
                    label="Место"
                    display={card.location}
                    hasVal={!!card.location}
                    onTap={(el) => openDrop({ kind: "work", index, field: "location" }, el)}
                  />
                  <FieldRow
                    label="№ разметки"
                    display={card.markingNum}
                    hasVal={!!card.markingNum}
                    onTap={(el) => openDrop({ kind: "work", index, field: "markingNum" }, el)}
                  />
                  {showType && (
                    <FieldRow
                      label="Тип"
                      display={card.markingType}
                      hasVal={!!card.markingType}
                      onTap={(el) => openDrop({ kind: "work", index, field: "markingType" }, el)}
                    />
                  )}
                  <FieldRow
                    label="Кол-во"
                    display={String(card.volume)}
                    hasVal={card.volume > 0}
                    editing={editingVol}
                    onTap={() => openTextEdit("volume", index, card.volume ? String(card.volume) : "")}
                  >
                    <input
                      className="qi-num-input"
                      autoFocus
                      inputMode="decimal"
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      onBlur={commitTextEdit}
                      onKeyDown={(e) => { if (e.key === "Enter") commitTextEdit(); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </FieldRow>
                </div>
              );
            })}

            {materialCard && (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Материал и тариф
                  </span>
                </div>
                <FieldRow
                  label="Материал"
                  display={materialCard.material}
                  hasVal={!!materialCard.material}
                  onTap={(el) => openDrop({ kind: "material", field: "material" }, el)}
                />
                <FieldRow
                  label="Тариф"
                  display={materialCard.tariff ? `${materialCard.tariff} ₽` : ""}
                  hasVal={materialCard.tariff > 0}
                  editing={edit?.kind === "text" && edit.field === "tariff"}
                  onTap={() => openTextEdit("tariff", undefined, materialCard.tariff ? String(materialCard.tariff) : "")}
                >
                  <input
                    className="qi-num-input"
                    autoFocus
                    inputMode="decimal"
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onBlur={commitTextEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTextEdit(); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </FieldRow>
              </div>
            )}

            {primaryBtn && (
              <button
                onClick={primaryBtn === "add" ? handleAdd : handleVerify}
                style={{
                  width: "100%", height: 46, borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  fontFamily: "Inter, sans-serif", cursor: "pointer", outline: "none",
                  boxShadow: "0 4px 14px rgba(255,107,0,0.26)",
                }}
              >
                {primaryBtn === "add" ? "Добавить в таблицу" : "Проверить"}
              </button>
            )}
          </div>
        )}

        {edit && edit.kind !== "text" && dropOptions.length > 0 && (
          isDesktop ? (
            <DesktopDropdown
              options={dropOptions}
              value={dropValue}
              onSelect={onDropSelect}
              onClose={() => setEdit(null)}
              anchor={dropPos}
              optionMeta={dropMeta}
            />
          ) : (
            <DropdownCard
              options={dropOptions}
              value={dropValue}
              onSelect={onDropSelect}
              onClose={() => setEdit(null)}
              withSearch={edit.kind === "work" && (edit.field === "markingNum" || edit.field === "location")}
              top={dropPos.top}
              left={dropPos.left}
              width={dropPos.width}
              step={edit.kind === "material" ? 5 : edit.field === "location" ? 1 : edit.field === "markingNum" ? 2 : 3}
              optionMeta={dropMeta}
            />
          )
        )}
      </div>

      {showHelp && (
        isDesktop
          ? <QuickInputHelpModal onClose={() => setShowHelp(false)} />
          : <QuickInputHelpSheet onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}

// Mobile bottom sheet
function QuickInputSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (rows: QuickRow[]) => void }) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.38)", display: "flex", alignItems: "flex-end",
      animation: "fadeInBd 0.2s ease forwards",
    }}>
      <div style={{
        width: "100%", height: "70%",
        background: "rgba(248,249,252,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        animation: "sheetUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
        fontFamily: "Inter, sans-serif", overflow: "hidden",
        position: "relative",
      }}>
        <QuickInputContent onClose={onClose} onAdd={onAdd} isDesktop={false} />
      </div>
    </div>,
    portal,
  );
}

// Desktop centered modal
function QuickInputModal({ onClose, onAdd }: { onClose: () => void; onAdd: (rows: QuickRow[]) => void }) {
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.40)", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        width: 460, maxHeight: "80vh",
        background: "rgba(248,249,252,0.99)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: 24, boxShadow: "0 24px 80px rgba(0,0,0,0.20)",
        display: "flex", flexDirection: "column",
        animation: "fadeUp 0.22s ease forwards",
        overflow: "hidden",
      }}>
        <QuickInputContent onClose={onClose} onAdd={onAdd} isDesktop={true} />
      </div>
    </div>,
    document.body,
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

const SYNC_CFG: Record<SyncStatus, { label: string; color: string; icon: typeof Wifi }> = {
  offline: { label: "Офлайн",              color: "#9ca3af", icon: WifiOff   },
  syncing: { label: "Синхронизация...",    color: "#f59e0b", icon: RefreshCw },
  pending: { label: "Не синхронизировано", color: "#ef4444", icon: CloudOff  },
  synced:  { label: "Синхронизировано",    color: "#22c55e", icon: Wifi      },
};

const NAV_ITEMS = [
  { path: "/home",    label: "Главная", icon: Home },
  { path: "/history", label: "История", icon: List },
  { path: "/profile", label: "Профиль", icon: User },
];

const COLLAPSED_W = 64;
const EXPANDED_W  = 240;

function DesktopSidebar({ syncStatus, onSyncClick, onQuickInput, collapsed, onToggle }: {
  syncStatus: SyncStatus;
  onSyncClick: () => void;
  onQuickInput: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sync = SYNC_CFG[syncStatus];
  const SyncIcon = sync.icon;

  const w = collapsed ? COLLAPSED_W : EXPANDED_W;

  // Tooltip on hover for collapsed icons
  function IconBtn({ onClick, children, title, active, accent }: {
    onClick: () => void; children: React.ReactNode;
    title?: string; active?: boolean; accent?: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        title={title}
        style={{
          width: collapsed ? 40 : "100%",
          height: 44,
          borderRadius: 12, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          padding: collapsed ? 0 : "0 14px",
          background: active
            ? "rgba(255,107,0,0.09)"
            : accent
            ? "linear-gradient(135deg,#FF6B00,#FF9A00)"
            : "transparent",
          fontFamily: "Inter, sans-serif", outline: "none",
          transition: "background 0.15s",
          flexShrink: 0,
          boxShadow: accent ? "0 4px 14px rgba(255,107,0,0.30)" : "none",
          marginLeft: collapsed ? "auto" : 0,
          marginRight: collapsed ? "auto" : 0,
        }}
        onMouseEnter={e => { if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; }}
        onMouseLeave={e => { if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {children}
      </button>
    );
  }

  return (
    <aside style={{
      width: w, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
      background: "rgba(255,255,255,0.75)",
      backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderRight: "1px solid rgba(0,0,0,0.07)",
      display: "flex", flexDirection: "column",
      boxShadow: "2px 0 24px rgba(0,0,0,0.05)",
      fontFamily: "Inter, sans-serif", zIndex: 10,
      transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>

      {/* Logo row + toggle */}
      <div style={{
        padding: collapsed ? "24px 0 20px" : "24px 12px 20px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        flexShrink: 0,
      }}>
        {/* App icon — always visible */}
        <div
          onClick={collapsed ? onToggle : undefined}
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, boxShadow: "0 4px 12px rgba(255,107,0,0.28)",
            cursor: collapsed ? "pointer" : "default",
          }}
          title={collapsed ? "Развернуть панель" : undefined}
        >
          <Calculator size={18} strokeWidth={1.8} color="#fff" />
        </div>

        {/* Title + collapse button — only when expanded */}
        {!collapsed && (
          <>
            <div style={{ flex: 1, paddingLeft: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.15 }}>Твой</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.15 }}>калькулятор</div>
            </div>
            <button
              onClick={onToggle}
              title="Свернуть панель"
              style={{
                width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(0,0,0,0.09)",
                background: "rgba(0,0,0,0.04)", cursor: "pointer", outline: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", flexShrink: 0, transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
            >
              {/* chevron-left */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        padding: collapsed ? "16px 0" : "16px 12px",
        display: "flex", flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        gap: 4, flex: 1,
      }}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <IconBtn key={path} onClick={() => navigate(path)} title={collapsed ? label : undefined} active={active}>
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} color={active ? "#FF6B00" : "#6b7280"} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ fontSize: 14, fontWeight: active ? 600 : 500, color: active ? "#FF6B00" : "#374151", whiteSpace: "nowrap" }}>{label}</span>
                  {active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#FF6B00", flexShrink: 0 }} />}
                </>
              )}
            </IconBtn>
          );
        })}
      </nav>

      {/* Bottom: sync + quick input */}
      <div style={{
        padding: collapsed ? "16px 0 28px" : "16px 12px 28px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        gap: 10,
      }}>
        {/* Sync button */}
        <button
          onClick={onSyncClick}
          title={collapsed ? sync.label : undefined}
          style={{
            width: collapsed ? 40 : "100%",
            height: 40, borderRadius: 12, border: "none",
            cursor: syncStatus === "synced" ? "default" : "pointer",
            background: "rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10, padding: collapsed ? 0 : "0 14px",
            fontFamily: "Inter, sans-serif", outline: "none",
            marginLeft: collapsed ? "auto" : 0,
            marginRight: collapsed ? "auto" : 0,
          }}
        >
          <SyncIcon
            size={16} strokeWidth={1.8} color={sync.color}
            style={syncStatus === "syncing" ? { animation: "spin 1s linear infinite", flexShrink: 0 } : { flexShrink: 0 }}
          />
          {!collapsed && <span style={{ fontSize: 12, fontWeight: 500, color: sync.color, whiteSpace: "nowrap" }}>{sync.label}</span>}
        </button>

        {/* Quick input */}
        <button
          onClick={onQuickInput}
          title={collapsed ? "Быстрый ввод" : undefined}
          style={{
            width: collapsed ? 40 : "100%",
            height: 44, borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
            display: "flex", alignItems: "center",
            justifyContent: "center",
            gap: collapsed ? 0 : 8,
            color: "#fff", fontSize: 14, fontWeight: 600,
            fontFamily: "Inter, sans-serif", outline: "none",
            boxShadow: "0 4px 16px rgba(255,107,0,0.32)",
            transition: "transform 0.12s",
            marginLeft: collapsed ? "auto" : 0,
            marginRight: collapsed ? "auto" : 0,
          }}
          onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.93)"; }}
          onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
        >
          <Plus size={collapsed ? 20 : 18} strokeWidth={2.5} />
          {!collapsed && "Быстрый ввод"}
        </button>
      </div>
    </aside>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const isDesktop = useIsDesktop();
  const phoneRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<((rows: QuickRow[]) => void) | null>(null);
  const [showQuickInput, setShowQuickInput] = useState(false);
  const syncStatus = useSyncStatus();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function registerAddRow(fn: (rows: QuickRow[]) => void) { addRowRef.current = fn; }
  function handleQuickAdd(rows: QuickRow[]) { addRowRef.current?.(rows); }
  function handleSync() {
    if (syncStatus === "synced") return;
    void (async () => {
      await syncNow();
      const err = peekSyncSnapshot().lastError;
      if (err) window.alert(err);
    })();
  }

  const context: ShellContext = { phoneRef, registerAddRow, isDesktop };

  // ── Desktop layout ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{
        height: "100dvh", maxHeight: "100dvh", overflow: "hidden", display: "flex",
        background: "linear-gradient(160deg,#f0f4ff 0%,#fdf9f5 55%,#fff7ed 100%)",
        fontFamily: "Inter, sans-serif",
        position: "relative",
      }}>
        <DesktopSidebar
          syncStatus={syncStatus}
          onSyncClick={handleSync}
          onQuickInput={() => setShowQuickInput(true)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />

        <main ref={phoneRef} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <Outlet context={context} />
        </main>

        <div id="app-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 90 }} />

        {showQuickInput && (
          <QuickInputModal
            onClose={() => setShowQuickInput(false)}
            onAdd={handleQuickAdd}
          />
        )}
      </div>
    );
  }

  // ── Mobile layout ───────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100dvh", maxHeight: "100dvh", overflow: "hidden",
      background: "linear-gradient(160deg, #f0f4ff 0%, #fdf9f5 55%, #fff7ed 100%)",
      fontFamily: "Inter, sans-serif",
      position: "relative",
      display: "flex", flexDirection: "column",
      overscrollBehavior: "none",
    }}>
      <div style={{ position: "absolute", top: -80, right: -60, width: 260, height: 260, background: "radial-gradient(circle, rgba(255,154,0,0.11) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

      <div
        ref={phoneRef}
        style={{
          flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
          WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
          position: "relative", display: "flex", flexDirection: "column",
        }}
      >
        <Outlet context={context} />
      </div>

      <BottomNav onFabClick={() => setShowQuickInput(true)} />

      {/* Вне скролла и выше BottomNav: иначе на iOS fixed-nav рисуется поверх sheet'ов */}
      <div id="app-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }} />

      {showQuickInput && (
        <QuickInputSheet
          onClose={() => setShowQuickInput(false)}
          onAdd={handleQuickAdd}
        />
      )}
    </div>
  );
}
