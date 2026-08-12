-- v46: הוספת cat/budget_type ל-bank_transactions + סיווג אוטומטי דרך ingest_bank_transactions.
--
-- bank_transactions (v39) הוקמה בלי עמודות סיווג בכלל — כל תנועה חדשה ממקס הייתה נשארת
-- לא מסווגת לצמיתות, כי שום קוד לא היה קורא ממנה עדיין. עכשיו שמחברים אותה למסכי הלקוח/אדמין,
-- צריך את אותו דפוס שכבר קיים ב-imported_transactions: תנועה מגיעה עם cat=null, מסתווגת
-- אוטומטית אם יש remembered_mapping/חוק תואם (בפונקציה הזו, לא ב-edge function — כך שכל נתיב
-- כתיבה עתידי ל-bank_transactions מקבל את אותו סיווג בלי לשכפל קוד JS), ואם לא — המשתמש מסווג
-- ידנית ב-UI, בדיוק כמו כל תנועה לא מסווגת אחרת.
--
-- שימור סיווג ידני: בכל עדכון (התאמת ARN, התאמת uid, "קליטה" של pending→completed) —
-- cat/budget_type הקיימים בשורה נשמרים (COALESCE) ולא נדרסים בערך חדש/ריק שמגיע מהסנכרון.
-- זה קריטי: בלי זה, כל "קליטה" מחדש של תנועה הייתה מוחקת סיווג ידני שהמשתמש כבר עשה.

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS cat text;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS budget_type text;

CREATE OR REPLACE FUNCTION ingest_bank_transactions(
  p_client_id       bigint,
  p_provider        text,
  p_source_channel  text,
  p_card_last4      text,
  p_import_batch_id bigint,
  p_rows            jsonb
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row                     jsonb;
  v_ref                     text;
  v_uid                     text;
  v_date                    date;
  v_billing                 text;
  v_name                    text;
  v_name_norm               text;
  v_amount                  numeric;
  v_card                    text;
  v_cat                     text;
  v_budget_type             text;
  v_was_insert              boolean;
  v_inserted_arn            int := 0;
  v_updated_arn             int := 0;
  v_inserted_uid            int := 0;
  v_updated_uid             int := 0;
  v_reconciled              int := 0;
  v_fallback_existing_count int;
  v_fallback_to_insert      int;
  v_fallback_inserted       int := 0;
  v_fallback_groups         int := 0;
  rec                       RECORD;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_ref       := NULLIF(v_row->>'bank_reference', '');
    v_uid       := NULLIF(v_row->>'bank_uid', '');
    IF v_ref IS NULL AND v_uid IS NULL THEN
      CONTINUE;
    END IF;

    v_date        := (v_row->>'date')::date;
    v_billing     := v_row->>'billing_month';
    v_name        := v_row->>'merchant_name';
    v_name_norm   := lower(regexp_replace(trim(v_name), '\s+', ' ', 'g'));
    v_amount      := (v_row->>'amount')::numeric;
    v_card        := coalesce(NULLIF(v_row->>'card_last4', ''), p_card_last4);
    v_cat         := NULLIF(v_row->>'cat', '');
    v_budget_type := NULLIF(v_row->>'budget_type', '');

    IF v_ref IS NOT NULL THEN
      IF v_uid IS NOT NULL THEN
        UPDATE bank_transactions SET
          bank_reference = v_ref, card_last4 = v_card,
          date = v_date, billing_month = v_billing,
          merchant_name = v_name, merchant_name_normalized = v_name_norm,
          amount = v_amount,
          original_amount = (v_row->>'original_amount')::numeric,
          original_currency = v_row->>'original_currency',
          status = coalesce(v_row->>'status', 'completed'),
          installment_number = (v_row->>'installment_number')::int,
          installment_total = (v_row->>'installment_total')::int,
          category_raw = v_row->>'category_raw',
          raw_payload = v_row->'raw_payload',
          cat = coalesce(cat, v_cat),
          budget_type = coalesce(budget_type, v_budget_type),
          import_batch_id = p_import_batch_id,
          updated_at = now()
        WHERE client_id = p_client_id AND provider = p_provider
          AND bank_uid = v_uid AND bank_reference IS NULL;
        IF FOUND THEN
          v_reconciled := v_reconciled + 1;
          CONTINUE;
        END IF;
      END IF;

      INSERT INTO bank_transactions (
        client_id, provider, source_channel, card_last4,
        bank_reference, bank_uid, date, billing_month,
        merchant_name, merchant_name_normalized, amount,
        original_amount, original_currency, status,
        installment_number, installment_total, category_raw,
        raw_payload, cat, budget_type, import_batch_id
      ) VALUES (
        p_client_id, p_provider, p_source_channel, v_card,
        v_ref, v_uid, v_date, v_billing,
        v_name, v_name_norm, v_amount,
        (v_row->>'original_amount')::numeric, v_row->>'original_currency',
        coalesce(v_row->>'status', 'completed'),
        (v_row->>'installment_number')::int, (v_row->>'installment_total')::int,
        v_row->>'category_raw', v_row->'raw_payload', v_cat, v_budget_type, p_import_batch_id
      )
      ON CONFLICT (client_id, provider, bank_reference) WHERE bank_reference IS NOT NULL
      DO UPDATE SET
        bank_uid = coalesce(EXCLUDED.bank_uid, bank_transactions.bank_uid),
        card_last4 = EXCLUDED.card_last4,
        date = EXCLUDED.date, billing_month = EXCLUDED.billing_month,
        merchant_name = EXCLUDED.merchant_name, merchant_name_normalized = EXCLUDED.merchant_name_normalized,
        amount = EXCLUDED.amount, original_amount = EXCLUDED.original_amount,
        original_currency = EXCLUDED.original_currency, status = EXCLUDED.status,
        installment_number = EXCLUDED.installment_number, installment_total = EXCLUDED.installment_total,
        category_raw = EXCLUDED.category_raw, raw_payload = EXCLUDED.raw_payload,
        cat = coalesce(bank_transactions.cat, EXCLUDED.cat),
        budget_type = coalesce(bank_transactions.budget_type, EXCLUDED.budget_type),
        import_batch_id = EXCLUDED.import_batch_id, updated_at = now()
      RETURNING (xmax = 0) INTO v_was_insert;
      IF v_was_insert THEN v_inserted_arn := v_inserted_arn + 1; ELSE v_updated_arn := v_updated_arn + 1; END IF;

    ELSE -- v_uid IS NOT NULL, v_ref IS NULL
      INSERT INTO bank_transactions (
        client_id, provider, source_channel, card_last4,
        bank_reference, bank_uid, date, billing_month,
        merchant_name, merchant_name_normalized, amount,
        original_amount, original_currency, status,
        installment_number, installment_total, category_raw,
        raw_payload, cat, budget_type, import_batch_id
      ) VALUES (
        p_client_id, p_provider, p_source_channel, v_card,
        NULL, v_uid, v_date, v_billing,
        v_name, v_name_norm, v_amount,
        (v_row->>'original_amount')::numeric, v_row->>'original_currency',
        coalesce(v_row->>'status', 'pending'),
        (v_row->>'installment_number')::int, (v_row->>'installment_total')::int,
        v_row->>'category_raw', v_row->'raw_payload', v_cat, v_budget_type, p_import_batch_id
      )
      ON CONFLICT (client_id, provider, bank_uid) WHERE bank_uid IS NOT NULL AND bank_uid <> ''
      DO UPDATE SET
        card_last4 = EXCLUDED.card_last4,
        date = EXCLUDED.date, billing_month = EXCLUDED.billing_month,
        merchant_name = EXCLUDED.merchant_name, merchant_name_normalized = EXCLUDED.merchant_name_normalized,
        amount = EXCLUDED.amount, original_amount = EXCLUDED.original_amount,
        original_currency = EXCLUDED.original_currency, status = EXCLUDED.status,
        installment_number = EXCLUDED.installment_number, installment_total = EXCLUDED.installment_total,
        category_raw = EXCLUDED.category_raw, raw_payload = EXCLUDED.raw_payload,
        cat = coalesce(bank_transactions.cat, EXCLUDED.cat),
        budget_type = coalesce(bank_transactions.budget_type, EXCLUDED.budget_type),
        import_batch_id = EXCLUDED.import_batch_id, updated_at = now()
      RETURNING (xmax = 0) INTO v_was_insert;
      IF v_was_insert THEN v_inserted_uid := v_inserted_uid + 1; ELSE v_updated_uid := v_updated_uid + 1; END IF;
    END IF;
  END LOOP;

  CREATE TEMP TABLE _fallback_batch (
    date date, merchant_name text, merchant_name_normalized text, amount numeric, billing_month text,
    original_amount numeric, original_currency text, status text, card_last4 text,
    installment_number int, installment_total int, category_raw text, raw_payload jsonb,
    cat text, budget_type text
  ) ON COMMIT DROP;

  INSERT INTO _fallback_batch
  SELECT
    (r->>'date')::date, r->>'merchant_name',
    lower(regexp_replace(trim(r->>'merchant_name'), '\s+', ' ', 'g')),
    (r->>'amount')::numeric, r->>'billing_month',
    (r->>'original_amount')::numeric, r->>'original_currency',
    coalesce(r->>'status', 'completed'),
    coalesce(NULLIF(r->>'card_last4', ''), p_card_last4),
    (r->>'installment_number')::int, (r->>'installment_total')::int,
    r->>'category_raw', r->'raw_payload',
    NULLIF(r->>'cat', ''), NULLIF(r->>'budget_type', '')
  FROM jsonb_array_elements(p_rows) r
  WHERE NULLIF(r->>'bank_reference', '') IS NULL AND NULLIF(r->>'bank_uid', '') IS NULL;

  FOR rec IN
    SELECT date, merchant_name_normalized, amount, billing_month, count(*) AS batch_count
    FROM _fallback_batch
    GROUP BY date, merchant_name_normalized, amount, billing_month
  LOOP
    v_fallback_groups := v_fallback_groups + 1;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_client_id::text || '|' || p_provider || '|' || rec.date::text || '|' ||
      rec.merchant_name_normalized || '|' || rec.amount::text || '|' || rec.billing_month, 0));

    SELECT count(*) INTO v_fallback_existing_count
    FROM bank_transactions
    WHERE client_id = p_client_id AND provider = p_provider
      AND bank_reference IS NULL AND bank_uid IS NULL
      AND date = rec.date AND merchant_name_normalized = rec.merchant_name_normalized
      AND amount = rec.amount AND billing_month = rec.billing_month;

    v_fallback_to_insert := greatest(0, rec.batch_count - v_fallback_existing_count);

    IF v_fallback_to_insert > 0 THEN
      INSERT INTO bank_transactions (
        client_id, provider, source_channel, card_last4,
        date, billing_month, merchant_name, merchant_name_normalized, amount,
        original_amount, original_currency, status,
        installment_number, installment_total, category_raw, raw_payload,
        cat, budget_type, import_batch_id
      )
      SELECT
        p_client_id, p_provider, p_source_channel, card_last4,
        date, billing_month, merchant_name, merchant_name_normalized, amount,
        original_amount, original_currency, status,
        installment_number, installment_total, category_raw, raw_payload,
        cat, budget_type, p_import_batch_id
      FROM _fallback_batch
      WHERE date = rec.date AND merchant_name_normalized = rec.merchant_name_normalized
        AND amount = rec.amount AND billing_month = rec.billing_month
      LIMIT v_fallback_to_insert;

      v_fallback_inserted := v_fallback_inserted + v_fallback_to_insert;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_by_arn', v_inserted_arn,
    'updated_by_arn', v_updated_arn,
    'inserted_by_uid', v_inserted_uid,
    'updated_by_uid', v_updated_uid,
    'reconciled_uid_to_arn', v_reconciled,
    'fallback_inserted', v_fallback_inserted,
    'fallback_groups_seen', v_fallback_groups
  );
END;
$$;

REVOKE ALL ON FUNCTION ingest_bank_transactions(bigint, text, text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_bank_transactions(bigint, text, text, text, bigint, jsonb) TO service_role;
