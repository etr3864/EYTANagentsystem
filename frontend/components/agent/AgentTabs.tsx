export interface AgentTabItem {
  id: string;
  label: string;
}

interface AgentTabsProps<T extends string> {
  tabs: AgentTabItem[];
  current: T;
  onChange: (id: T) => void;
}

export function AgentTabs<T extends string>({ tabs, current, onChange }: AgentTabsProps<T>) {
  return (
    <nav className="flex flex-wrap gap-1 py-2">
      {tabs.map((item) => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id as T)}
            className={`
              px-2.5 py-1.5 text-xs md:text-sm font-medium rounded-md
              transition-colors
              ${active
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'}
            `}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
