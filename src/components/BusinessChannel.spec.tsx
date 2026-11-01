import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BusinessChannel } from './BusinessChannel';

afterEach(cleanup);

describe('BusinessChannel', () => {
  it('keeps the channel value visible next to its labelled icon', () => {
    render(<BusinessChannel kind="phone" value="03447 421000" blocked={false}/>);
    expect(screen.getByText('03447 421000')).toBeTruthy();
    expect(screen.getByLabelText('Teléfono')).toBeTruthy();
    expect(screen.queryByText('No contactar')).toBeNull();
  });
  it('marks a restricted business with a visible No contactar label', () => {
    render(<BusinessChannel kind="whatsapp" value="+54 9 3447 111111" blocked/>);
    expect(screen.getByText('No contactar')).toBeTruthy();
    expect(screen.getByText('+54 9 3447 111111')).toBeTruthy();
  });
  it('renders a dash when there is no value', () => {
    const { container } = render(<BusinessChannel kind="email" value={null} blocked={false}/>);
    expect(container.textContent).toBe('—');
  });
  it('links the value to a safe external URL when it gets an href (spec 104)', () => {
    render(<BusinessChannel kind="web" value="cabanas.com.ar" href="https://cabanas.com.ar/" blocked/>);
    const link = screen.getByRole('link', { name: 'cabanas.com.ar' });
    expect(link.getAttribute('href')).toBe('https://cabanas.com.ar/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('No contactar')).toBeTruthy();
  });
  it('keeps plain text without an href', () => {
    render(<BusinessChannel kind="web" value="cabanas.com.ar" blocked={false}/>);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
