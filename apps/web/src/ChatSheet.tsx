import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, CHANGED, type State } from './api';
import { AskBox } from './AskBox';

/** Floating chat button + bottom sheet, available on every screen except Ask (which is the box itself). */
export function ChatSheet() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!open) return;
    api.state().then(setState);
    const h = () => api.state().then(setState);
    window.addEventListener(CHANGED, h);
    return () => window.removeEventListener(CHANGED, h);
  }, [open]);

  useEffect(() => { setOpen(false); }, [loc.pathname]);

  if (loc.pathname === '/') return null;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Chat: say what you need" className="fixed right-4 bottom-[9.5rem] w-14 h-14 rounded-full bg-green text-white shadow-lg flex items-center justify-center z-20">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.2A8 8 0 1 1 21 12z" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div role="dialog" aria-label="Chat" onClick={e => e.stopPropagation()} className="relative w-full max-w-[480px] mx-auto bg-ground rounded-t-3xl p-4 pb-6 max-h-[80vh] overflow-y-auto flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="font-extrabold">Say what you need</div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full text-muted text-xl">×</button>
            </div>
            <div className="text-xs font-semibold text-muted">"we need medium freezer bags", "we're out of milk", "pancakes for breakfast sunday just me and alex"</div>
            {state && <AskBox state={state} autoFocus compact placeholder="we need medium freezer bags" />}
          </div>
        </div>
      )}
    </>
  );
}
