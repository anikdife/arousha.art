import React from 'react';

export type HorizontalPillItem<T extends string> = {
  key: T;
  label: string;
  badge?: string | number;
};

export function HorizontalPills<T extends string>(props: {
  items: Array<HorizontalPillItem<T>>;
  selectedKey: T;
  onSelect: (key: T) => void;
  className?: string;
}) {
  const { items, selectedKey, onSelect, className } = props;

  return (
    <div className={"overflow-x-auto no-scrollbar " + (className ?? '')}>
      <div className="flex items-center gap-2 whitespace-nowrap px-4">
        {items.map((it) => {
          const active = it.key === selectedKey;
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(it.key)}
              className={
                'inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ' +
                (active
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50')
              }
            >
              <span>{it.label}</span>
              {typeof it.badge !== 'undefined' ? (
                <span
                  className={
                    'text-xs px-2 py-0.5 rounded-full ' +
                    (active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700')
                  }
                >
                  {it.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
