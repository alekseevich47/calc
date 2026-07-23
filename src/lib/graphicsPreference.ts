import { useSyncExternalStore } from "react";

export type GraphicsQuality = "high" | "low";

export const GRAPHICS_STORAGE_KEY = "calc_graphics_quality";

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStored(): GraphicsQuality {
  try {
    const raw = localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (raw === "low" || raw === "high") return raw;
  } catch {
    /* ignore */
  }
  return "high";
}

function applyToDom(q: GraphicsQuality) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.graphics = q;
}

let current: GraphicsQuality = "high";

/** Читает localStorage и выставляет data-graphics на <html> до первого рендера. */
export function applyStoredGraphicsQuality() {
  current = readStored();
  applyToDom(current);
}

export function getGraphicsQuality(): GraphicsQuality {
  return current;
}

export function setGraphicsQuality(q: GraphicsQuality) {
  if (q !== "high" && q !== "low") return;
  current = q;
  try {
    localStorage.setItem(GRAPHICS_STORAGE_KEY, q);
  } catch {
    /* ignore */
  }
  applyToDom(q);
  emit();
}

export function useGraphicsQuality(): GraphicsQuality {
  return useSyncExternalStore(subscribe, getGraphicsQuality, getGraphicsQuality);
}
