**Supabase Setup**
Diese App kann komplett statisch auf GitHub Pages laufen. Supabase wird nur als Daten- und Datei-Backend genutzt.

**Einrichtung**
1. In Supabase ein neues Projekt anlegen.
2. In `Storage` einen Bucket `receipts` anlegen.
3. Den Inhalt aus [supabase/schema.sql](/home/phil/Downloads/la-travel-companion-fix-map-route/la-travel-companion/supabase/schema.sql:1) im SQL Editor ausführen.
4. In [config.js](/home/phil/Downloads/la-travel-companion-fix-map-route/la-travel-companion/config.js:1) `SUPABASE_ENABLED`, `SUPABASE_URL` und `SUPABASE_ANON_KEY` setzen.

**Falls `permission denied for table expenses` auftaucht**
Fuehrt [supabase/schema.sql](/home/phil/Downloads/la-travel-companion-fix-map-route/la-travel-companion/supabase/schema.sql:1) noch einmal komplett aus. Die aktuelle Version enthaelt jetzt auch die noetigen `grant`-Befehle fuer `anon` und `authenticated`.

**Storage Policies**
Für einen einfachen gemeinsamen Urlaubsbetrieb ohne Login:

```sql
create policy "anon receipts read"
on storage.objects
for select
to anon
using (bucket_id = 'receipts');

create policy "anon receipts insert"
on storage.objects
for insert
to anon
with check (bucket_id = 'receipts');
```

Optional koennt ihr auch `update` und `delete` fuer `anon` erlauben, wenn ihr Bons direkt austauschen oder loeschen wollt.

**Empfohlenes Kostenmodell**
Das sauberste System fuer Restaurant, Einkaeufe und geteilte Rechnungen ist:

1. Ein `expense` ist immer der komplette Beleg.
2. `person` bzw. `paid_by` ist die Person, die wirklich bezahlt hat.
3. `subtotal_amount` ist der eigentliche Rechnungsbetrag ohne Tip.
4. `tip_amount` ist separat.
5. `participants` speichert, wer an diesem Beleg beteiligt war.
6. In `expense_splits` bekommt jede Person ihren exakten Anteil.

Beispiel Restaurant:
- Essen und Getraenke gesamt: `70`
- Tip gesamt: `10`
- Gezahlt von: `Paetti`
- `expense.amount = 80`
- `expense.subtotal_amount = 70`
- `expense.tip_amount = 10`

Wenn jeder unterschiedlich viel gegessen hat:
- Phil: Food `18.50`
- Paetti: Food `21.00`
- Person 3: Food `12.00`
- Person 4: Food `18.50`
- Tip pro Person bei 4 Leuten: `2.50`

Dann bekommt `expense_splits` vier Zeilen:
- Phil: `food_amount = 18.50`, `tip_amount = 2.50`, `total_amount = 21.00`
- Paetti: `food_amount = 21.00`, `tip_amount = 2.50`, `total_amount = 23.50`
- Person 3: `food_amount = 12.00`, `tip_amount = 2.50`, `total_amount = 14.50`
- Person 4: `food_amount = 18.50`, `tip_amount = 2.50`, `total_amount = 21.00`

So ist am Ende eindeutig:
- Wer hat bezahlt?
- Wie hoch war der ganze Beleg?
- Wer war beteiligt?
- Wie viel schuldet jede Person fuer genau diesen Beleg?

**Hinweis**
Die aktuellen UI-Felder speichern schon Zahler, Betrag, Beschreibung und optional den Bon. Die neue `expense_splits`-Tabelle ist die Grundlage fuer die naechste Ausbaustufe, damit die App auch individuelle Anteile pro Person direkt erfassen kann.

**Spots**
Neue Versionen der App speichern fuer Spots optional auch `address`. Wenn euer Supabase-Projekt schon laeuft, fuehrt [schema.sql](/home/phil/Downloads/la-travel-companion-fix-map-route/la-travel-companion/supabase/schema.sql:1) einfach noch einmal aus. Durch `add column if not exists` ist das migrationssicher.

**Tagesplanung**
Die App kann jetzt auch gemeinsame Tagesplanung aus `itinerary_days` laden und speichern. Dort koennen Titel, Kurzbeschreibung, Notizen und freie Planungspunkte pro Datum gemeinsam gepflegt werden. Wenn euer Supabase-Projekt schon besteht, fuehrt [schema.sql](/home/phil/Downloads/la-travel-companion-fix-map-route/la-travel-companion/supabase/schema.sql:1) einfach erneut aus.
