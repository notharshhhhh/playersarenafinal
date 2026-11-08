import React, { Component, ReactNode, ErrorInfo } from 'react';
import { ShieldAlert, RefreshCw, Home as HomeIcon } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application Error Boundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/home';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 select-none">
          <div className="w-full max-w-sm rounded-[30px] p-6 bg-[#111111] border border-purple-500/30 shadow-[0_24px_60px_rgba(243,122,32,0.28)] text-center space-y-4">
            <div className="w-16 h-16 rounded-[22px] bg-rose-500/15 border border-rose-500/35 text-rose-500 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 stroke-[2.2]" />
            </div>

            <span className="inline-block px-3.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.18em] bg-rose-500/15 text-rose-400 border border-rose-500/30">
              RECOVERABLE UI NOTICE
            </span>

            <h2 className="text-lg font-black italic uppercase tracking-tight text-white">
              Something went wrong on this screen
            </h2>

            <div className="bg-[#111111] rounded-2xl p-3.5 border border-purple-500/20 text-left">
              <p className="text-[11px] font-bold text-purple-200/80 break-words leading-relaxed">
                {this.state.error?.message || 'An unexpected interface error occurred.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleGoHome}
                className="py-3.5 px-4 rounded-2xl bg-[#111111] hover:bg-neutral-800 text-slate-300 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all"
              >
                <HomeIcon size={14} />
                <span>Home</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="py-3.5 px-4 rounded-2xl bg-[#F37A1F] hover:bg-[#D9660F] text-black text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(243,122,32,0.38)] active:scale-[0.97] transition-all"
              >
                <RefreshCw size={14} />
                <span>Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
