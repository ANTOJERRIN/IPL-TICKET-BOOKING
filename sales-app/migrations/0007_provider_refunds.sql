CREATE TABLE IF NOT EXISTS provider_refunds(
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 payment_intent TEXT,
 amount INTEGER NOT NULL CHECK(amount>0),
 provider_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'initiating' CHECK(status IN ('initiating','pending','requires_action','succeeded','failed','canceled','needs_review')),
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 locked_until INTEGER NOT NULL DEFAULT 0,
 operator_id TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS refund_admission_guard BEFORE INSERT ON provider_refunds
BEGIN
 SELECT CASE WHEN COALESCE((SELECT admitted FROM admissions WHERE order_id=NEW.order_id),0)>0 THEN RAISE(ABORT,'already admitted') END;
END;
CREATE TRIGGER IF NOT EXISTS admission_refund_insert_guard BEFORE INSERT ON admissions
WHEN EXISTS(SELECT 1 FROM provider_refunds WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'refund blocks admission'); END;
CREATE TRIGGER IF NOT EXISTS admission_refund_update_guard BEFORE UPDATE ON admissions
WHEN EXISTS(SELECT 1 FROM provider_refunds WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'refund blocks admission'); END;
