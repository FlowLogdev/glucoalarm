-- Manual status from the admin console. NULL means billing decides. Stripe and
-- RevenueCat webhooks recompute subscription_status, so without this a manual
-- change would silently revert on the customer's next billing event.
ALTER TABLE customers ADD COLUMN admin_status_override TEXT
  CHECK (admin_status_override IN ('active', 'inactive'));
