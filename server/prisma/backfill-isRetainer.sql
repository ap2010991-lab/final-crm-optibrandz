-- Invoices raised by the monthly retainer run before the isRetainer flag existed.
-- The run has always written a single line item worded "Monthly retainer — <Month Year>",
-- so that is the evidence available. Nothing else is touched, and the flag defaults to
-- false, so a mis-detection can only ever under-claim (the client is offered a retainer
-- invoice they may already have) — never silently skip billing them.
UPDATE "Invoice"
SET "isRetainer" = true
WHERE "isRetainer" = false
  AND jsonb_array_length("lineItems"::jsonb) = 1
  AND ("lineItems"::jsonb -> 0 ->> 'description') LIKE 'Monthly retainer%';
