ALTER TABLE message_templates
  ADD COLUMN purpose text CHECK (purpose IN ('verification','first_contact','resume','relationship','care','operations','other'));
