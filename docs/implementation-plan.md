# Ieviešanas plāns

## Fāze 1. Foundations

- sakārtot Vite, Tailwind, shadcn/ui un maršrutēšanas bāzi
- pieslēgt Supabase klientu
- sagatavot `.env` un deployment konfigurāciju
- ielikt privātuma iestatījumus (`robots.txt`, meta robots)

## Fāze 2. Supabase domēns

- ieviest sākotnējo migrāciju
- izveidot Supabase klienta helperi
- pieslēgt autentifikācijas plūsmu
- uztaisīt profila inicializāciju pēc pirmās reģistrācijas

## Fāze 3. Lietotnes karkass

- aizsargāts layout
- sidebar navigācija
- dashboard bāzes kartītes
- formatēšanas utilītas datumam un valūtai

## Fāze 4. Biznesa moduļi

- klienti
- rēķini
- izdevumi
- PDF ģenerēšana

## Fāze 5. Atskaites

- ceturkšņa aprēķini
- gada kopsavilkumi
- Excel eksports
- drukai piemēroti skati

## Fāze 6. Produkcija

- Vercel deploy
- subdomēna piesaiste
- Supabase produkcijas vides pārbaude
- smoke tests
