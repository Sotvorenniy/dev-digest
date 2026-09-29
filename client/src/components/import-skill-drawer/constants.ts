import type { IconName } from "@devdigest/ui";

export type ImportTab = "file" | "url" | "community";

export interface DrawerTabDef {
  key: ImportTab;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly DrawerTabDef[] = [
  { key: "file", labelKey: "drawer.tabs.file", icon: "Upload" },
  { key: "url", labelKey: "drawer.tabs.url", icon: "Globe" },
  { key: "community", labelKey: "drawer.tabs.community", icon: "Users" },
];
