-- Catalogs are stored in DB; existing free-text values remain selectable as historical values.
INSERT INTO app_settings(key,value) VALUES
('crm_contact_positions','["Propietario/a","Socio/a","Gerente","Administrador/a","Encargado/a","Recepción","Ventas / comercial","Marketing","Otro"]'),
('crm_contact_channels','["WhatsApp","Email","Teléfono","Instagram","Facebook","Presencial","Otro"]')
ON CONFLICT(key) DO NOTHING;
