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

Het volledige stappenplan (server en Cloudflare Tunnel, met HTTPS en zonder open poort) staat in **[DEPLOY.md](DEPLOY.md)**. Kort samengevat:

```bash
cp .env.example .env                        # APP_PIN en TUNNEL_TOKEN invullen
docker compose --profile tunnel up -d --build
```

Zonder tunnel (met je eigen reverse proxy op poort 8080): `docker compose up -d --build`.

### Omgevingsvariabelen

| Variabele | Standaard | Betekenis |
|---|---|---|
| `APP_PIN` | leeg | Als deze gezet is, is de PIN nodig om op te slaan. Meekijken kan altijd. |
| `TUNNEL_TOKEN` | leeg | Token van de Cloudflare Tunnel (alleen bij `--profile tunnel`). |
| `PORT` | `8080` | Poort binnen de container. |
| `DATA_DIR` | `/data` | Map voor de SQLite-database. |

## Ontwikkelen

```bash
cd server && npm start                 # API op :8080 (Node >= 22.13, geen dependencies)
cd web && npm install && npm run dev   # Vite dev-server, /api wordt doorgestuurd naar :8080
cd web && npm test                     # unit-tests voor de puntentelling
cd server && npm test                  # API-tests (start de server met een tijdelijke database)
```

Wijzigingen lopen via issue → branch → pull request, volgens de [werkwijze](https://github.com/flyingwing1994/.github/blob/main/WORKFLOW.md). Elke PR krijgt automatisch checks (geheimen, Semgrep, dependencies, build, tests) en een Claude-review; zonder risicovlag wordt hij daarna automatisch gemerged. Dependabot houdt packages wekelijks bij.

## Structuur

```
web/      React + TypeScript + Tailwind (Vite), PWA
  src/lib/scoring.ts   puntentelling en ronde-validatie (getest)
  src/lib/store.ts     lokale opslag, migratie en sync-wachtrij
  src/lib/live.ts      live volgen via SSE
server/   Node HTTP-server: REST-API, SSE, statische bestanden, SQLite (node:sqlite)
  test/                API-tests (node --test, black-box)
legacy/   de oorspronkelijke versie in één HTML-bestand
```

## Hoe het samenwerkt

- **Bewerken**: het toestel dat een potje start krijgt een geheime bewerk-sleutel. Alleen toestellen met die sleutel kunnen het potje wijzigen, dus het startende toestel of wie de bewerk-link krijgt.
- **Sync**: wijzigingen krijgen een versienummer. Als twee toestellen met dezelfde bewerk-link tegelijk offline wijzigen, wint de eerste die synchroniseert; de andere neemt die versie over.
- **Spelers en regelsets** worden per item samengevoegd: de laatste wijziging wint.
