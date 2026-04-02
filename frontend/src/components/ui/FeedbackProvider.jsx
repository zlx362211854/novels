import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircleIcon, CheckCircleIcon, AlertTriangleIcon, InfoIcon } from 'lucide-react';

const FeedbackContext = createContext(null);

function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;

  return (
    <Dialog open={!!dialog} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dialog.variant === 'danger' && (
              <AlertCircleIcon className="h-5 w-5 text-destructive" />
            )}
            {dialog.title}
          </DialogTitle>
          <DialogDescription className="pt-2">{dialog.message}</DialogDescription>
        </DialogHeader>
        {dialog.note && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {dialog.note}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onClose(false)}>
            {dialog.cancelText || '取消'}
          </Button>
          <Button
            variant={dialog.variant === 'danger' ? 'destructive' : 'default'}
            onClick={() => onClose(true)}
          >
            {dialog.confirmText || '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const toast = useCallback((message, options = {}) => {
    const { type, title, duration = 3200 } = options;

    const toastOptions = {
      duration,
    };

    if (type === 'success') {
      sonnerToast.success(title || '成功', { description: message, ...toastOptions });
    } else if (type === 'error') {
      sonnerToast.error(title || '错误', { description: message, duration: 4800 });
    } else if (type === 'warning') {
      sonnerToast.warning(title || '警告', { description: message, ...toastOptions });
    } else {
      sonnerToast.info(title || '提示', { description: message, ...toastOptions });
    }
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setDialog(options);
    });
  }, []);

  const closeDialog = useCallback((result) => {
    setDialog(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({
      toast,
      success: (message, options = {}) => toast(message, { ...options, type: 'success' }),
      error: (message, options = {}) => toast(message, { ...options, type: 'error' }),
      warning: (message, options = {}) => toast(message, { ...options, type: 'warning' }),
      confirm,
    }),
    [confirm, toast]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ConfirmDialog dialog={dialog} onClose={closeDialog} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }

  return context;
}
