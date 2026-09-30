UPDATE leads AS l
SET assigned_user_email = u.email
FROM users AS u
WHERE l.assigned_user_email IS NULL
  AND l.asignado_a IS NOT NULL
  AND (
    lower(trim(l.asignado_a)) = lower(trim(u.display_name))
    OR lower(trim(l.asignado_a)) = lower(trim(u.email))
  );

UPDATE leads
SET asignado_a = NULL
WHERE assigned_user_email IS NOT NULL;
