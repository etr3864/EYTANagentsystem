export type AgentTabGroup = 'ops' | 'content' | 'auto' | 'system';

export interface AgentTabItem {
  id: string;
  label: string;
  group: AgentTabGroup;
}

const GROUP_ORDER: AgentTabGroup[] = ['ops', 'content', 'auto', 'system'];
const GROUP_LABELS: Record<AgentTabGroup, string> = {
  ops: 'שיחה',
  content: 'תוכן',
  auto: 'אוטומציה',
  system: 'מערכת',
};

interface AgentTabsProps<T extends string> {
  tabs: AgentTabItem[];
  current: T;
  onChange: (id: T) => void;
}

export function AgentTabs<T extends string>({ tabs, current, onChange }: AgentTabsProps<T>) {
  const groups = GROUP_ORDER
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      items: tabs.filter((tab) => tab.group === id),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
      {groups.map((group, index) => (
        <div
          key={group.id}
          className={`
            flex flex-col gap-1.5 min-w-0
            ${index > 0 ? 'md:ps-4 md:ms-4 md:border-s md:border-white/10' : ''}
          `}
        >
          <span className="text-[10px] font-medium tracking-wide text-slate-500">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1">
            {group.items.map((item) => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id as T)}
                  className={`
                    px-2.5 py-1 text-xs md:text-sm font-medium rounded-md
                    ${active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'}
                  `}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
