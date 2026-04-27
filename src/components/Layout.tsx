import React from "react";
import { Outlet } from "react-router-dom";

import AppSidebar from "./AppSidebar";

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[var(--pc-bg)] text-[var(--pc-text)] lg:flex">
      <AppSidebar />
      <div className="min-w-0 flex-1 overflow-auto bg-[var(--pc-bg)]">
        <div className="min-h-screen p-4 lg:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
