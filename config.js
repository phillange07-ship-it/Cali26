// Supabase aktivieren:
// 1. SQL aus supabase/schema.sql im Supabase SQL Editor ausfuehren
// 2. Bucket "receipts" anlegen oder den Namen unten anpassen
// 3. URL und anon key hier eintragen
// 4. SUPABASE_ENABLED auf true setzen
window.APP_CONFIG = {
  SUPABASE_ENABLED: false,
  SUPABASE_URL: "https://balqhkyahzjhsbwtefce.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "sb_publishable_ihL-JpK4En5TcdozX0xqJg_c1Uea7mV",
  SUPABASE_RECEIPT_BUCKET: "receipts",
  SUPABASE_EXPENSES_TABLE: "expenses",
  SUPABASE_SPOTS_TABLE: "spots",
  SUPABASE_EXPENSE_SPLITS_TABLE: "expense_splits"
};
