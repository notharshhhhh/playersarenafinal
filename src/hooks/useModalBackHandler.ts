import { useEffect, useRef } from 'react';

/**
 * Hook to handle closing modals using the browser back button.
 * Safely pushes a modal state ONLY when a modal transitions from closed to open,
 * and never interferes with React Router page navigation.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      try {
        window.history.pushState({ ...window.history.state, isModalOpen: true }, '');
      } catch {}
    }

    const handlePopState = () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen]);
}
