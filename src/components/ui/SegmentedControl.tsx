import React from 'react';

export type SegmentedOption<T extends string> = {
  key: T;
  label: string;
};

export function SegmentedControl<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  className?: string;
}) {
  const { value, onChange, options, className } = props;

  return (
    <div className={"w-full rounded-xl bg-gray-100 p-1 flex " + (className ?? '')} role="group">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            className={
              'flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ' +
              (active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
