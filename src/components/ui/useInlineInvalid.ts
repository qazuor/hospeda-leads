import { useState, type FormEvent } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Handler<T extends Field> = ((event: FormEvent<T>) => void) | undefined;

/**
 * Replaces the browser's native validation bubble with a Spanish message shown under the field.
 * The caller's own onInvalid/onChange still run; the message clears as soon as the user edits the field.
 */
export function useInlineInvalid<T extends Field>({ onInvalid, onChange }: { onInvalid?: Handler<T>; onChange?: ((event: React.ChangeEvent<T>) => void) | undefined }) {
  const [message, setMessage] = useState<string | null>(null);
  return {
    error: message,
    onInvalid: (event: FormEvent<T>) => {
      onInvalid?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const target = event.currentTarget;
      setMessage(target.validity.valueMissing ? (target instanceof HTMLSelectElement ? 'Elegí una opción.' : 'Completá este dato.') : 'Revisá este dato.');
    },
    onChange: (event: React.ChangeEvent<T>) => { setMessage(null); onChange?.(event); },
  };
}
