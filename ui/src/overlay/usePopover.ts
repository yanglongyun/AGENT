import { useEffect, useRef, useState } from 'react';

export function usePopover() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        const close = () => setOpen(false);
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        window.addEventListener('blur', close);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape);
            window.removeEventListener('blur', close);
        };
    }, [open]);
    return { open, setOpen, ref };
}
