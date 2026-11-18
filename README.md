# Yaniv Scorekeeper

Mobiele scorekeeper voor Yaniv. Hij is installeerbaar als app (PWA), werkt offline en meerdere telefoons kunnen een potje live volgen.

## Functies

- **Onbeperkt spelers**: spelers toevoegen, hernoemen, een kleur geven en verwijderen. De lijst wordt via de server gedeeld met alle telefoons.
- **Alle regels instelbaar**:
  - afvalgrens (vrij getal), "af boven" of "af vanaf" de grens
  - einde bij de eerste afvaller of bij de laatste overlevende
  - Yaniv-limiet (niet controleren, waarschuwen of blokkeren)
  - bonus bij een veelvoud: aan/uit, ÷2 of −50, veelvoud van 50, 100 of een vrij getal
  - assaf-strafpunten, en of de assaf-roeper 0 punten of zijn eigen hand krijgt
  - maximum aantal punten per hand, om tikfouten te vangen
- **Regelsets**: de standaardsets *Thuisregels* en *Officieel*, plus je eigen benoemde sets.
- **Regels per potje vastgelegd**: tijdens een potje aanpasbaar, waarna de stand opnieuw wordt berekend.
- **Ronde-invoer in drie stappen**: wie riep Yaniv, was het een Assaf, en de handpunten. Met een live preview van de punten en controles op de regels.
- **Stijl**: strak scorebord-ontwerp zonder emoji; volgt automatisch de dag/nachtstand van je telefoon (of vast via Instellingen).
- **Correcties**: de laatste ronde ongedaan maken, elke ronde achteraf aanpassen of verwijderen, en een potje handmatig beëindigen.
- **Live meekijken**: deel de 6-letter spelcode of de link. Andere telefoons zien elke ronde direct, inclusief de animaties.
- **Bewerk-link**: hiermee draag je het scorebijhouden over aan een andere telefoon.
- **Offline-first**: alles wordt eerst lokaal bewaard en gesynchroniseerd zodra er weer verbinding is.
- **Historie en klassement**: overwinningen, win%, gewonnen rondes en geleden assafs per speler.
- **Migratie**: spelers, regels en een lopend potje uit de eerste versie worden automatisch overgenomen.

## Draaien op je server

```bash
git clone <repo> && cd yaniv-scorekeeper
APP_PIN=1234 docker compose up -d --build   # APP_PIN is optioneel
```

De container luistert op poort **8080**. Data staat in het volume `yaniv-data` (SQLite, `/data/yaniv.sqlite`).

Zet je HTTPS-reverse-proxy (Caddy, Traefik, Nginx Proxy Manager, …) voor die poort. HTTPS is nodig om de app te installeren en offline te gebruiken. Live-updates gebruiken Server-Sent Events. Caddy en Traefik werken zonder extra instellingen. Bij Nginx zet je `proxy_buffering off;` op `/api/`.

Caddy-voorbeeld:

```
yaniv.example.nl {
  reverse_proxy 127.0.0.1:8080
}
```

### Omgevingsvariabelen

| Variabele | Standaard | Betekenis |
|---|---|---|
| `PORT` | `8080` | Poort binnen de container |
| `DATA_DIR` | `/data` | Map voor de SQLite-database |
| `APP_PIN` | leeg | Als deze gezet is, is de PIN nodig om op te slaan. Meekijken kan altijd. De PIN stel je in de app in via *Instellingen*. |

### Back-up

```bash
docker run --rm -v yaniv-data:/data -v "$PWD":/backup alpine cp /data/yaniv.sqlite /backup/
```

## Ontwikkelen

```bash
cd server && npm start                 # API op :8080 (Node >= 22.13, geen dependencies)
cd web && npm install && npm run dev   # Vite dev-server, /api wordt doorgestuurd naar :8080
cd web && npm test                     # unit-tests voor de puntentelling
```

## Structuur

```
web/      React + TypeScript + Tailwind (Vite), PWA
  src/lib/scoring.ts   puntentelling en ronde-validatie (getest)
  src/lib/store.ts     lokale opslag, migratie en sync-wachtrij
  src/lib/live.ts      live volgen via SSE
server/   Node HTTP-server: REST-API, SSE, statische bestanden, SQLite (node:sqlite)
legacy/   de oorspronkelijke versie in één HTML-bestand
```

## Hoe het samenwerkt

- **Bewerken**: het toestel dat een potje start krijgt een geheime bewerk-sleutel. Alleen toestellen met die sleutel kunnen het potje wijzigen, dus het startende toestel of wie de bewerk-link krijgt.
- **Sync**: wijzigingen krijgen een versienummer. Als twee toestellen met dezelfde bewerk-link tegelijk offline wijzigen, wint de eerste die synchroniseert; de andere neemt die versie over.
- **Spelers en regelsets** worden per item samengevoegd: de laatste wijziging wint.
