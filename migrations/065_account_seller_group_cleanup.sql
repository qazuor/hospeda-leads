-- Spec 107: a seller group left with zero or one member (unlink, merge, hard delete cascade) is removed.
CREATE FUNCTION cleanup_small_account_seller_groups() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM crm_account_seller_groups g
  WHERE (SELECT count(*) FROM crm_account_seller_group_members m WHERE m.group_id=g.id) <= 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER crm_account_seller_group_cleanup
AFTER DELETE ON crm_account_seller_group_members
FOR EACH STATEMENT EXECUTE FUNCTION cleanup_small_account_seller_groups();
