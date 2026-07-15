const SIDEBAR_COLLAPSED_KEY = "lush:sidebar-collapsed";

type SidebarPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readSidebarCollapsed(
  storage: SidebarPreferenceStorage = window.localStorage
) {
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage: SidebarPreferenceStorage = window.localStorage
) {
  try {
    storage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}
