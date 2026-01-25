import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange }) => {
  return (
    <label className="relative flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className={`w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer 
        transition-colors duration-200 ease-in-out
        peer-checked:bg-primary
        after:content-[''] after:absolute after:top-[2px] after:start-[2px] 
        after:bg-white after:border-gray-200 after:border after:rounded-full 
        after:h-5 after:w-5 after:transition-all 
        peer-checked:after:translate-x-full peer-checked:after:border-white`}
      ></div>
    </label>
  );
};