# Tehniskā specifikācija v1

## 1. Produkta mērķis

`Pašnodarbinātais / Self Employed` ir privāta web lietotne viena lietotāja vajadzībām ar iespēju nākotnē atbalstīt vairākus lietotājus. Sistēmas mērķis ir vienkāršot ieņēmumu, izdevumu, klientu un rēķinu uzskaiti, kā arī sagatavot ceturkšņa un gada nodokļu kopsavilkumus Latvijas pašnodarbinātajam.

## 2. Produkta robežas v1

Iekļauts:

- e-pasta/paroles autentifikācija ar Supabase
- lietotāja profila dati rēķiniem un atskaitēm
- klientu saraksts un rediģēšana
- rēķinu izveide, PDF ģenerēšana un manuāla izsūtīšana
- izdevumu reģistrēšana ar failu glabāšanu Supabase Storage
- dashboard ar mēneša kopsavilkumiem
- ceturkšņa un gada atskaites
- Excel eksports atlasītiem datiem
- kavēto rēķinu atgādinājumu mehānisms lietotnē

Nav iekļauts pirmajā versijā:

- vairāku valūtu atbalsts
- automātiska e-pastu sūtīšana no sistēmas
- mobilā aplikācija vai PWA
- publiska piekļuve bez autentifikācijas

## 3. Izvietošana un piekļuve

- Produkcijas adrese: `pasnodarbinats.virtualamaksla.lv`
- Lietotne ir privāta un nav paredzēta indeksēšanai
- Aizsardzības slāņi:
  - Supabase Auth visām darba lapām
  - `robots.txt` ar `Disallow: /`
  - `meta robots="noindex,nofollow,noarchive"`
- Hostings: ieteicams `Vercel`
- Datu glabāšana: `Supabase`

## 4. Lietotāju lomas

### Primārā loma

- `owner`
- viens lietotājs ar pilnu piekļuvi saviem datiem

### Nākotnes paplašinājums

- vairāki neatkarīgi lietotāji ar saviem datiem, izmantojot RLS

## 5. Tehniskais stack

- Frontend: `React 19`, `TypeScript`, `Vite`
- Stils: `Tailwind CSS v4`, `shadcn/ui`
- Navigācija: `react-router-dom`
- Formas/validācija: `zod`
- Datumi: `date-fns`
- Grafiki: `Recharts`
- PDF: `@react-pdf/renderer`
- Backend: `Supabase`
- DB: `PostgreSQL`
- Auth: `Supabase Auth`
- Faili: `Supabase Storage`

## 6. Arhitektūras princips

### Frontend slāņi

- `app/` vai `routes/`: lapas un layout
- `components/`: atkārtoti UI komponenti
- `features/`: domēna loģika pa moduļiem
- `lib/`: utilītas, formatēšana, Supabase klients
- `types/`: TypeScript tipi un enum kartējumi

### Datu princips

- visi lietotāja dati glabājas Supabase
- localStorage netiek izmantots biznesa datiem
- autentificēts lietotājs redz tikai savus ierakstus
- čeki un pielikumi glabājas Storage bucket mapēs pēc lietotāja ID

## 7. Galvenie moduļi

### 7.1 Auth

- reģistrācija ar e-pastu/paroli
- ielogošanās un izlogošanās
- paroles atjaunošana
- pirmās ielogošanās brīdī profila aizpildīšana

### 7.2 Dashboard

- ieņēmumi mēnesī
- izdevumi mēnesī
- apliekamais ienākums
- prognozētie nodokļi
- ieņēmumu/izdevumu grafiks pa mēnešiem
- pēdējie 5 rēķini un 5 izdevumi

### 7.3 Klienti

- klientu saraksts
- pievienošana un rediģēšana
- meklēšana un filtrēšana

### 7.4 Rēķini

- jauna rēķina forma
- automātiska numerācija formātā `R-2026-001`
- rēķina rindas
- PVN aprēķins
- PDF priekšskatījums
- PDF lejupielāde
- manuālas izsūtīšanas plūsma
- statusi: `izrakstits`, `apmaksats`, `kavejas`, `atcelts`
- atgādinājumi kavētiem rēķiniem

### 7.5 Izdevumi

- izdevumu saraksts
- kategorijas filtrs
- datuma filtrs
- čeka/rēķina augšupielāde
- piegādātāja un apraksta lauki

### 7.6 Atskaites

- ceturkšņa atskaite
- gada atskaite
- PVN kopsavilkums, ja lietotājs ir PVN maksātājs
- drukai piemērots skats
- Excel eksports

### 7.7 Profils

- personas un saimnieciskās darbības dati
- bankas rekvizīti
- PVN maksātāja statuss
- nodokļu režīms
- rēķinu numerācijas iestatījumi

## 8. Datubāzes modelis

Galvenās tabulas:

- `profiles`
- `clients`
- `invoices`
- `invoice_items`
- `expenses`

Palīgstruktūras:

- enum tips `tax_regime`
- enum tips `invoice_status`
- enum tips `expense_category`

Papildu lauki, kas pievienoti v1 specifikācijā:

- `profiles.invoice_prefix`
- `profiles.invoice_sequence`
- `invoices.paid_at`
- `invoices.sent_at`
- `invoices.currency` ar noklusējumu `EUR`
- `expenses.receipt_path` tehniskai Storage atsaucei

## 9. Drošība

- RLS ieslēgts visām tabulām
- `profiles` politika balstīta uz `auth.uid() = id`
- pārējās tabulas piesaistītas `user_id`
- `invoice_items` politika piesaistīta caur rēķina īpašnieku
- Storage bucket politika atļauj lietotājam piekļūt tikai savai mapei

## 10. Formātu prasības

- UI valoda: latviešu
- Datums: `DD.MM.YYYY`
- Summa: `1 234,56 €`
- Valūta: tikai `EUR`
- Rēķina dizains: moderns, bet lietišķs

## 11. Nodokļu aprēķinu pieeja

- nodokļu formulas glabājas atsevišķā modulī
- 2026. gada konstantes tiek versētas kodā
- pirms produkcijas lietošanas formulas jāpārbauda pret aktuālajām VID prasībām
- sistēma skaidri atdala:
  - ieņēmumus no apmaksātiem rēķiniem
  - izdevumus no `expenses`
  - ceturkšņa VSAOI
  - IIN
  - PVN kopsavilkumu

## 12. Rēķina izsūtīšanas pieeja v1

Izvēlētais modelis ir manuāla izsūtīšana:

1. lietotājs izveido rēķinu
2. sistēma ģenerē PDF
3. lietotājs lejupielādē PDF vai atver sagatavotu e-pasta plūsmu
4. rēķina ierakstā var saglabāt `sent_at`

## 13. MVP secība

1. Supabase migrācijas un autentifikācija
2. profila forma un layout
3. klientu modulis
4. rēķinu modulis un PDF
5. izdevumi un Storage
6. dashboard un atskaites
7. Excel eksports un polish
