import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ConfigRowProps {
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  title: string;
  description: string;
}

export const ConfigRow: React.FC<ConfigRowProps> = ({
  icon: Icon,
  iconBgColor,
  iconColor,
  title,
  description,
}) => {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBgColor} ${iconColor}`}
      >
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="flex flex-col">
        <p className="text-slate-800 text-sm font-bold leading-tight">
          {title}
        </p>
        <p className="text-slate-400 text-[11px] mt-0.5">{description}</p>
      </div>
    </div>
  );
};