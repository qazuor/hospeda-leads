import { describe, expect, it } from 'vitest';
import { BUSINESS_LINK_FIELDS, businessLinkFacts, businessLinkHref } from './businessLinks';

describe('businessLinkHref', () => {
  it('keeps http and https URLs', () => {
    expect(businessLinkHref({ field: 'sitioWeb', value: 'https://cabanas.com.ar/reservas' })).toBe('https://cabanas.com.ar/reservas');
    expect(businessLinkHref({ field: 'urlGmap', value: ' http://maps.google.com/?q=Colón ' })).toBe('http://maps.google.com/?q=Col%C3%B3n');
  });

  it('completes a domain without scheme with https', () => {
    expect(businessLinkHref({ field: 'sitioWeb', value: 'cabanas.com.ar' })).toBe('https://cabanas.com.ar/');
    expect(businessLinkHref({ field: 'perfilFacebook', value: 'www.facebook.com/cabanas' })).toBe('https://www.facebook.com/cabanas');
  });

  it('rejects any other scheme', () => {
    expect(businessLinkHref({ field: 'sitioWeb', value: 'javascript:alert(1)' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: 'JavaScript:alert(1)' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: 'data:text/html,<b>x</b>' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: 'mailto:hola@cabanas.com.ar' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: 'ftp://cabanas.com.ar' })).toBeNull();
  });

  it('builds the Instagram profile from a username or a profile URL', () => {
    expect(businessLinkHref({ field: 'perfilInstagram', value: '@cabanas.del_rio' })).toBe('https://www.instagram.com/cabanas.del_rio/');
    expect(businessLinkHref({ field: 'perfilInstagram', value: 'instagram.com/CabanasDelRio/' })).toBe('https://www.instagram.com/cabanasdelrio/');
    expect(businessLinkHref({ field: 'perfilInstagram', value: 'javascript:alert(1)' })).toBeNull();
  });

  it('returns null for text that is not a URL', () => {
    expect(businessLinkHref({ field: 'sitioWeb', value: 'no tiene' })).toBeNull();
    expect(businessLinkHref({ field: 'perfilBooking', value: 'ver en booking' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: '' })).toBeNull();
    expect(businessLinkHref({ field: 'sitioWeb', value: null })).toBeNull();
  });

  it('lists the seven link fields of the business record', () => {
    expect(BUSINESS_LINK_FIELDS).toEqual(['sitioWeb', 'urlGmap', 'perfilInstagram', 'perfilFacebook', 'perfilAirbnb', 'perfilBooking', 'perfilTurismoEntreRios']);
  });
});

describe('businessLinkFacts', () => {
  const labels = { sitioWeb: 'Sitio web', urlGmap: 'Google Maps', perfilInstagram: 'Instagram', perfilFacebook: 'Facebook', perfilAirbnb: 'Airbnb', perfilBooking: 'Booking', perfilTurismoEntreRios: 'Turismo Entre Ríos' };
  it('returns the loaded links with their safe href and lists the empty ones under «Sin cargar» (spec 104, finding 23)', () => {
    const account: Record<string, unknown> = { sitioWeb: 'cabanas.com.ar', perfilFacebook: 'ver en facebook', perfilInstagram: '', urlGmap: null };
    const { links, emptyLabels } = businessLinkFacts({ value: field => account[field], labels });
    expect(links).toEqual([
      { field: 'sitioWeb', label: 'Sitio web', value: 'cabanas.com.ar', href: 'https://cabanas.com.ar/' },
      { field: 'perfilFacebook', label: 'Facebook', value: 'ver en facebook', href: null },
    ]);
    expect(emptyLabels).toEqual(['Google Maps', 'Instagram', 'Airbnb', 'Booking', 'Turismo Entre Ríos']);
  });
});
