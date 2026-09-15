-- Keep Stripe and native-store purchase states independently. The effective
-- subscription_status remains the single switch used by the polling service.
ALTER TABLE customers ADD COLUMN stripe_subscription_status TEXT;
ALTER TABLE customers ADD COLUMN revenuecat_subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE customers ADD COLUMN revenuecat_expires_at INTEGER;

-- Existing web subscribers keep exactly their current access after this
-- additive migration. Future Stripe/RevenueCat webhooks recompute the value.
UPDATE customers SET stripe_subscription_status = subscription_status
WHERE stripe_subscription_status IS NULL;
