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

const NAMED_BY_US = 'data-crm-label-name';

/**
 * The inline message renders inside the caller's `<label>`, so it would become part of the field's accessible name.
 * Pins the name to the label text without the message (the message stays linked via aria-describedby only).
 */
function pinLabelName(field: Field, message: string) {
  const label = field.closest('label');
  if (!label || field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby')) return;
  const all = Array.from(label.querySelectorAll('*')); const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('*')[all.indexOf(field)]?.remove();
  clone.querySelectorAll('[role="alert"],[data-error],[aria-hidden="true"]').forEach(item => item.remove());
  const name = (clone.textContent ?? '').replace(message, '').replace(/\s+/g, ' ').trim();
  if (name) { field.setAttribute('aria-label', name); field.setAttribute(NAMED_BY_US, ''); }
}
function releaseLabelName(field: Field) {
  if (!field.hasAttribute(NAMED_BY_US)) return;
  field.removeAttribute(NAMED_BY_US); field.removeAttribute('aria-label');
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
      const text = invalidMessage(target); setMessage(text); releaseLabelName(target); pinLabelName(target, text);
      if (Array.from(target.form?.elements ?? []).find(item => (item as Field).willValidate && !(item as Field).validity.valid) === target) {
        let details = target.closest('details'); while (details) { details.open = true; details = details.parentElement?.closest('details') ?? null; }
        target.focus({ preventScroll: true }); target.scrollIntoView?.({ block: 'center' });
      }
    },
    onChange: (event: ChangeEvent<T>) => { setMessage(null); releaseLabelName(event.currentTarget); onChange?.(event); },
    onInput: (event: InputEvent<T>) => { if (event.currentTarget.validity.valid) { setMessage(null); releaseLabelName(event.currentTarget); } onInput?.(event); },
    onBlur: (event: FocusEvent<T>) => { if (event.currentTarget.validity.valid) { setMessage(null); releaseLabelName(event.currentTarget); } onBlur?.(event); },
  };
}
