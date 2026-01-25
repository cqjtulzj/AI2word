import React, { useEffect, useState } from 'react';
import { X, FileText, Calendar, Download, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HistoryItem {
  id: string;
  title: string;
  created_at: string;
  file_size: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversions')
        .select('id, title, created_at, file_size')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoryItems(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 flex flex-col max-h-[60vh]">
        
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-500 rounded-lg">
                <Clock size={16} strokeWidth={2.5} />
            </div>
            <h2 className="text-base font-bold text-slate-800">下载历史</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2.5 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="animate-spin text-primary" size={24} />
              <p className="text-xs text-slate-400">正在加载历史记录...</p>
            </div>
          ) : historyItems.length > 0 ? (
            historyItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-primary/30 hover:bg-white hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 text-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                    <FileText size={18} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-xs font-bold text-slate-700 truncate max-w-[160px]">{item.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar size={10} /> {formatDate(item.created_at)}
                      </span>
                      <span className="text-[10px] text-slate-300">•</span>
                      <span className="text-[10px] text-slate-400">{item.file_size}</span>
                    </div>
                  </div>
                </div>
                <button className="p-2 text-slate-300 hover:text-primary transition-colors hover:bg-orange-50 rounded-lg">
                  <Download size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center gap-2">
              <FileText size={32} strokeWidth={1} className="text-slate-200" />
              暂无记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
