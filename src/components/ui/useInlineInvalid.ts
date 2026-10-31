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
  const limit = readableLimit(input.type, v.rangeUnderflow ? input.min : input.max);
  if (v.rangeUnderflow) return limit ? `No puede ser anterior a ${limit}.` : `El valor mínimo es ${input.min}.`;
  if (v.rangeOverflow) return limit ? `No puede ser posterior a ${limit}.` : `El valor máximo es ${input.max}.`;
  if (v.patternMismatch && input.title) return input.title;
  if (v.customError && field.validationMessage) return field.validationMessage;
  return 'Revisá este dato.';
}

/** A date/time limit as the seller reads it (Argentine dd/mm/aaaa, 24 h); null for non-date fields. The value is already an Argentina wall time. */
function readableLimit(type: string, value: string): string | null {
  const day = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  if (type === 'datetime-local' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return `${day(value)} ${value.slice(11, 16)}`;
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return day(value);
  if (type === 'time' && /^\d{2}:\d{2}/.test(value)) return `las ${value.slice(0, 5)}`;
  return null;
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
    /** Clears the message when the value changes outside the field's own events (value-based controls such as pickers). */
    reset: (field?: Field | null) => { setMessage(null); if (field) releaseLabelName(field); },
    /** Re-reads a shown message after a constraint changed outside the field (e.g. a new `max`): cleared when valid, rewritten otherwise. Never moves focus. */
    refresh: (field?: Field | null) => {
      if (!message || !field) return;
      if (field.validity.valid) { setMessage(null); releaseLabelName(field); return; }
      const text = invalidMessage(field); setMessage(text); releaseLabelName(field); pinLabelName(field, text);
    },
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
