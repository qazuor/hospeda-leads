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
});
