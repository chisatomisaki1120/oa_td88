"use client";

import { useState, type ReactNode } from "react";

type Tab = { key: string; label: string; icon: string; children: ReactNode };

export default function AdminSettingsTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`settings-nav__item${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            <span className="settings-nav__icon">{t.icon}</span>
            <span className="settings-nav__label">{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {tabs.find((t) => t.key === active)?.children}
      </div>
    </div>
  );
}
