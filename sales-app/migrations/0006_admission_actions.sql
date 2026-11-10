CREATE TABLE IF NOT EXISTS admission_actions (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 6),
 operator_id TEXT NOT NULL,
 created INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS apply_admission_action AFTER INSERT ON admission_actions
BEGIN
 INSERT INTO admissions(order_id,admitted,updated,operator_id)
 SELECT NEW.order_id,NEW.qty,NEW.created,NEW.operator_id
 WHERE NEW.qty <= (SELECT qty FROM orders WHERE id=NEW.order_id)
 ON CONFLICT(order_id) DO UPDATE SET admitted=admitted+excluded.admitted,updated=excluded.updated,operator_id=excluded.operator_id
 WHERE admitted+excluded.admitted <= (SELECT qty FROM orders WHERE id=NEW.order_id);
 SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'admission quantity exceeded') END;
END;
