import { useId, useState, type ChangeEvent, type FocusEvent, type FormEvent, type InputEvent } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
interface Handlers<T extends Field> {
  onInvalid?: ((event: FormEvent<T>) => void) | undefined; onChange?: ((event: ChangeEvent<T>) => void) | undefined;
  onInput?: ((event: InputEvent<T>) => void) | undefined; onBlur?: ((event: FocusEvent<T>) => void) | undefined;
}

/** Spanish message for the first failing constraint of a field. */
export function invalidMessage(field: Field): string {
  const v = field.validity;
  if (v.valueMissing) return field instanceof HTMLSelectElement ? 'Elegí una opción.' : 'Completá este dato.';
  const input = field as HTMLInputElement;
  if (v.typeMismatch) return input.type === 'email' ? 'Revisá el formato (ej.: nombre@dominio.com).' : input.type === 'url' ? 'Revisá el enlace (ej.: https://sitio.com).' : 'Revisá este dato.';
  if (v.tooShort) return `Escribí al menos ${input.minLength} caracteres.`;
  if (v.tooLong) return `Escribí hasta ${input.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${input.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${input.max}.`;
  if (v.patternMismatch && input.title) return input.title;
  return 'Revisá este dato.';
}

/**
 * Replaces the browser's native validation bubble with a Spanish message shown under the field.
 * The caller's own handlers still run. The message clears on edit, or on blur once the value is valid.
 * Because cancelling `invalid` also cancels the browser's own focus jump, the first invalid control is focused here.
 */
export function useInlineInvalid<T extends Field>({ onInvalid, onChange, onInput, onBlur }: Handlers<T>) {
  const [message, setMessage] = useState<string | null>(null);
  const errorId = useId();
  return {
    error: message, errorId,
    onInvalid: (event: FormEvent<T>) => {
      onInvalid?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const target = event.currentTarget;
      setMessage(invalidMessage(target));
      if (Array.from(target.form?.elements ?? []).find(item => (item as Field).willValidate && !(item as Field).validity.valid) === target) {
        let details = target.closest('details'); while (details) { details.open = true; details = details.parentElement?.closest('details') ?? null; }
        target.focus({ preventScroll: true }); target.scrollIntoView?.({ block: 'center' });
      }
    },
    onChange: (event: ChangeEvent<T>) => { setMessage(null); onChange?.(event); },
    onInput: (event: InputEvent<T>) => { if (event.currentTarget.validity.valid) setMessage(null); onInput?.(event); },
    onBlur: (event: FocusEvent<T>) => { if (event.currentTarget.validity.valid) setMessage(null); onBlur?.(event); },
  };
}
