import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircleIcon } from 'lucide-react';
import { api, CHANGED, type State } from './api';
import { AskBox } from './AskBox';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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

  if (loc.pathname === '/' || loc.pathname.startsWith('/welcome')) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} aria-label="Chat: say what you need" size="icon" className="fixed right-4 bottom-[9.5rem] size-14 rounded-full shadow-lg z-20 [&_svg]:size-6">
        <MessageCircleIcon />
      </Button>
      <SheetContent side="bottom" aria-describedby="chat-desc">
        <SheetHeader>
          <SheetTitle>Say what you need</SheetTitle>
          <SheetDescription id="chat-desc">"we need medium freezer bags" · "we're out of milk" · "pancakes for breakfast sunday just me and alex"</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {state && <AskBox state={state} autoFocus compact placeholder="we need medium freezer bags" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
