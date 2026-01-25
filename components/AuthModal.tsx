import React, { useState } from 'react';
import { X, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      setIsLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        alert('注册成功，请查收邮件确认账号（如果启用了邮件确认）');
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || '操作失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 模态框内容 */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        
        {/* 顶部装饰背景 */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-primary to-orange-500" />
        <div className="absolute top-0 left-0 w-full h-32 overflow-hidden pointer-events-none">
            <div className="absolute -top-[50%] -left-[20%] w-[150%] h-[200%] bg-white/10 blur-[40px] rotate-12" />
        </div>

        {/* 关闭按钮 */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors"
        >
          <X size={18} />
        </button>

        {/* 增加顶部 padding (pt-24) 让图标骑在交界线上，文字下移到白色区域 */}
        <div className="relative pt-24 px-8 pb-8">
          {/* 标题区域 */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center text-primary mb-4 transform -rotate-3 border-2 border-white">
              <User size={32} strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
              {isLogin ? '欢迎回来' : '创建账号'}
            </h2>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">
              {isLogin ? '登录以享受无限格式转换权限' : '注册即刻解锁所有高级功能'}
            </p>
          </div>

          {/* 表单区域 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-medium">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">邮箱</label>
              <div className="relative group">
                <div className="absolute left-4 top-3 text-slate-400 group-focus-within:text-primary transition-colors">
                  <Mail size={18} />
                </div>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 pl-11 pr-4 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-slate-700 text-sm placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">密码</label>
              <div className="relative group">
                <div className="absolute left-4 top-3 text-slate-400 group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </div>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 pl-11 pr-4 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-slate-700 text-sm placeholder:text-slate-300"
                />
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-wider">确认密码</label>
                <div className="relative group">
                  <div className="absolute left-4 top-3 text-slate-400 group-focus-within:text-primary transition-colors">
                    <Lock size={18} />
                  </div>
                  <input 
                    type="password" 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 pl-11 pr-4 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-slate-700 text-sm placeholder:text-slate-300"
                  />
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary to-orange-500 text-white rounded-xl py-3 font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span className="text-sm">{isLogin ? '立即登录' : '注册账号'}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* 底部切换 */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400 font-medium">
              {isLogin ? '还没有账号？' : '已有账号？'}
              <button 
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary font-bold ml-1 hover:text-orange-600 outline-none transition-colors"
              >
                {isLogin ? '去注册' : '去登录'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};