import { create } from "zustand";

type Screen = "dashboard" | "month" | "upload" | "review" | "summary";
type Tab = "data" | "portfolio" | "insights" | "scenarios" | "debts" | "questionnaire";
type PortfolioTab = "control" | "review" | "history";
type UploadSource = "dashboard" | "month";

interface UIState {
  // Navigation
  screen: Screen;
  activeTab: Tab;
  portfolioTab: PortfolioTab;
  showConnectCard: boolean;

  // Upload flow
  uploadSource: UploadSource;
  showMonthPicker: boolean;
  selectedMonthKey: string | null;
  selectedMonthLabel: string;
  sourceLabel: string;
  filter: string;
  search: string;
  catPanelOpen: boolean;
  activeTxId: string | number | null;
  catSearch: string;

  // Toast
  toast: string;

  // Actions
  setScreen: (s: Screen) => void;
  setActiveTab: (t: Tab) => void;
  setPortfolioTab: (t: PortfolioTab) => void;
  setShowConnectCard: (v: boolean) => void;
  setUploadSource: (s: UploadSource) => void;
  setShowMonthPicker: (v: boolean) => void;
  setSelectedMonth: (key: string | null, label: string) => void;
  setSourceLabel: (s: string) => void;
  setFilter: (f: string) => void;
  setSearch: (s: string) => void;
  setCatPanelOpen: (v: boolean) => void;
  setActiveTxId: (id: string | number | null) => void;
  setCatSearch: (s: string) => void;
  showToast: (msg: string) => void;
  resetUploadFlow: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state — restore activeTab from sessionStorage
  screen: "dashboard",
  activeTab: (sessionStorage.getItem("mazan_activeTab") as Tab) || "data",
  portfolioTab: "control",
  showConnectCard: false,

  uploadSource: "dashboard",
  showMonthPicker: false,
  selectedMonthKey: null,
  selectedMonthLabel: "",
  sourceLabel: "",
  filter: "all",
  search: "",
  catPanelOpen: false,
  activeTxId: null,
  catSearch: "",

  toast: "",

  // Actions
  setScreen: (screen) => set({ screen }),
  setActiveTab: (activeTab) => {
    sessionStorage.setItem("mazan_activeTab", activeTab);
    set({ activeTab });
  },
  setPortfolioTab: (portfolioTab) => set({ portfolioTab }),
  setShowConnectCard: (showConnectCard) => set({ showConnectCard }),
  setUploadSource: (uploadSource) => set({ uploadSource }),
  setShowMonthPicker: (showMonthPicker) => set({ showMonthPicker }),
  setSelectedMonth: (selectedMonthKey, selectedMonthLabel) => set({ selectedMonthKey, selectedMonthLabel }),
  setSourceLabel: (sourceLabel) => set({ sourceLabel }),
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  setCatPanelOpen: (catPanelOpen) => set({ catPanelOpen }),
  setActiveTxId: (activeTxId) => set({ activeTxId }),
  setCatSearch: (catSearch) => set({ catSearch }),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: "" }), 3000);
  },
  resetUploadFlow: () => set({
    uploadSource: "dashboard",
    showMonthPicker: false,
    selectedMonthKey: null,
    selectedMonthLabel: "",
    sourceLabel: "",
    filter: "all",
    search: "",
    catPanelOpen: false,
    activeTxId: null,
    catSearch: "",
  }),
}));
