# Live zetten: server + Cloudflare Tunnel

Eindresultaat: de app draait op bijvoorbeeld `https://yaniv.jouwdomein.nl`, met HTTPS via Cloudflare, en er staat geen poort open op je router.

```
telefoon ──HTTPS──> Cloudflare ──tunnel (uitgaand)──> cloudflared ──> yaniv:8080 (Docker, SQLite-volume)
```

## 0. Wat je nodig hebt

- Een domein dat via **Cloudflare DNS** loopt: de nameservers van het domein wijzen naar Cloudflare. Een gratis account is genoeg.
- Een server met **Docker** en de **compose-plugin**. Controleer met `docker compose version`.
- `git` op de server.

## 1. Waar het draait

De productieversie draait op **lxc-docker (CT 102, 192.168.2.53)** in `/opt/yaniv-scorekeeper`, vanaf branch `main`. Inloggen: `ssh pve`, daarna `pct enter 102`.

Een nieuwe installatie begint bij stap 2; bijwerken staat onder [Bijwerken naar een nieuwe versie](#bijwerken-naar-een-nieuwe-versie).

## 2. Ophalen en configureren op de server

```bash
cd /opt
git clone https://github.com/flyingwing1994/yaniv-scorekeeper.git
cd yaniv-scorekeeper
cp .env.example .env
nano .env        # vul APP_PIN in (bijv. 4 cijfers); TUNNEL_TOKEN volgt in stap 3
```

`APP_PIN` is optioneel, maar aan te raden nu de app publiek bereikbaar wordt. Zonder PIN kan iedereen met de link spelers en potjes aanmaken. Meekijken werkt altijd zonder PIN.

## 3. Tunnel aanmaken in Cloudflare

1. Ga naar **dash.cloudflare.com → Zero Trust → Networks → Tunnels**. Op sommige accounts heet het *Networks → Connectors*.
2. Klik **Create a tunnel**, kies **Cloudflared** en geef hem een naam, bijv. `yaniv`.
3. Kies bij het installatiescherm **Docker**. Je ziet een commando met `--token eyJ...`. Kopieer **alleen het token**, dus alles na `--token`.
4. Zet het token in `.env` op de server:
   ```
   TUNNEL_TOKEN=eyJhIjoi...
   ```
   Het commando zelf hoef je niet uit te voeren; dat doet docker compose straks.
5. Ga verder naar **Public Hostname** en vul in:
   - **Subdomain:** `yaniv`
   - **Domain:** jouw domein
   - **Service type:** `HTTP`
   - **URL:** `yaniv:8080`

   `yaniv` is de servicenaam uit docker-compose; de tunnel-container vindt de app via het interne Docker-netwerk.
6. Sla op. Cloudflare maakt de DNS-record automatisch aan.

## 4. Starten

```bash
docker compose --profile tunnel up -d --build
```

De eerste build duurt een paar minuten: dependencies installeren, tests draaien en de app bouwen. Starten zonder `--profile tunnel` start alleen de app, zonder tunnel.

## 5. Controleren

```bash
docker compose ps                         # yaniv-scorekeeper moet "healthy" zijn
docker compose logs tunnel | grep -i registered   # moet "Registered tunnel connection" tonen
curl https://yaniv.jouwdomein.nl/api/health       # {"ok":true,"pinRequired":true}
```

In het Cloudflare-dashboard staat de tunnel dan op **Healthy**.

## 6. Op je telefoon

1. Open `https://yaniv.jouwdomein.nl`.
2. Ga naar **Instellingen** en vul bij **Server-PIN** dezelfde PIN in als in `.env`. Doe dit op elke telefoon die scores moet kunnen invoeren.
3. Installeer de app via het deelmenu van de browser: **Zet op beginscherm**. In Safari is dat Deel → Zet op beginscherm.
4. Voeg spelers toe onder **Spelers**, of direct bij **Nieuw potje**.
5. Meekijkers hebben geen PIN nodig: deel de link via de deelknop in een potje, of geef ze de 6-letter code.

## 7. Opruimen

- **Sluit de poort** die je eerder op je router had opengezet. De tunnel werkt via een uitgaande verbinding en heeft geen open poort nodig.
- Docker publiceert poort 8080 alleen op `127.0.0.1` van de server. Wil je de app ook op je thuisnetwerk via `http://server-ip:8080` bereiken, verander dan in `docker-compose.yml` de regel `"127.0.0.1:8080:8080"` in `"8080:8080"`.

## Bijwerken naar een nieuwe versie

Eerst een back-up (zie [Back-up](#back-up)) en de huidige versie noteren, zodat je terug kunt:

```bash
cd /opt/yaniv-scorekeeper
git log --oneline -1          # noteer de commit (terugweg)
git status --short            # mag alleen back-upbestanden tonen; anders eerst uitzoeken
git pull
docker compose --profile tunnel up -d --build
docker compose ps             # yaniv-scorekeeper moet "healthy" zijn
docker compose logs yaniv | tail -5
```

De build draait de webtests; faalt hij, dan blijft de oude versie draaien. De data blijft bewaard in het volume `yaniv-data`. Telefoons krijgen de nieuwe versie bij de volgende keer openen; soms is één keer verversen nodig.

**Terug naar de vorige versie:** `git checkout <genoteerde commit>` en opnieuw `docker compose --profile tunnel up -d --build`. Daarna weer `git checkout main` zodra de fout is opgelost.

## Back-up

```bash
docker run --rm -v yaniv-scorekeeper_yaniv-data:/data -v "$PWD":/backup alpine \
  cp /data/yaniv.sqlite /backup/yaniv-$(date +%F).sqlite
```

De volumenaam begint met de mapnaam van het project. Controleer de naam met `docker volume ls`. Wil je dit dagelijks automatisch, zet het commando dan in een cronjob.

## Goed om te weten

- **Oude scores van GitHub Pages komen niet mee.** De oude versie bewaarde alles in de browser, gekoppeld aan het github.io-adres. Op je eigen domein ziet de app die data niet. Speel een lopend potje dus eerst uit in de oude versie. Spelers en regels zet je in een paar minuten opnieuw neer.
- **Gebruik geen Cloudflare Access (inlogscherm)** op deze hostname. Dat blokkeert meekijkers en de offline-synchronisatie van de app. De `APP_PIN` is hier de beveiliging.
- **Live meekijken** werkt via Server-Sent Events. Dat werkt standaard via Cloudflare Tunnel, en de server stuurt elke 25 seconden een signaal om de verbinding open te houden.

## Problemen oplossen

| Symptoom | Oorzaak / oplossing |
|---|---|
| Tunnel in dashboard "Down" | `docker compose logs tunnel` bekijken; meestal een verkeerd of onvolledig token in `.env`. |
| Cloudflare error 502 / 1033 | De tunnel draait, maar bereikt de app niet. Controleer of de Service-URL precies `yaniv:8080` is (type HTTP) en of `docker compose ps` de app als healthy toont. |
| In de app: "PIN nodig" | PIN op die telefoon invullen onder Instellingen. Hij moet exact gelijk zijn aan `APP_PIN`. |
| "Zet op beginscherm" ontbreekt | Werkt alleen via HTTPS; open de app via het tunnel-adres, niet via `http://ip:8080`. |
| Build faalt op `npm ci` | De server heeft internet nodig tijdens de build (npm-registry). |
