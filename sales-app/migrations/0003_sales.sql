CREATE TABLE IF NOT EXISTS checkout_details(order_id TEXT PRIMARY KEY REFERENCES orders(id),buyer_name TEXT NOT NULL,buyer_email TEXT NOT NULL,phone TEXT NOT NULL,accepted_at INTEGER NOT NULL,policy_version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checkout_sessions(order_id TEXT PRIMARY KEY REFERENCES orders(id),expires INTEGER NOT NULL,payment_mode TEXT NOT NULL);
