import { useState } from 'react';

import { ActiveTab } from '../types';

export function useAppNavigation() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const openSidebar = () => {
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const changeTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const openAuditTab = () => {
    changeTab('audit');
  };

  const openGeneratorTab = () => {
    changeTab('generator');
  };

  return {
    activeTab,
    setActiveTab,
    isSidebarOpen,
    openSidebar,
    closeSidebar,
    changeTab,
    openAuditTab,
    openGeneratorTab,
  };
}
