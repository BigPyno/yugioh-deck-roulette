# Deck Roulette

Una ruota che estrae a caso un deck dei personaggi dai giochi Yu-Gi-Oh! per Nintendo DS e PSP. Per il deck estratto ti dà:

- la **lista completa delle carte**, divisa in Main, Extra e Side Deck;
- il file **.ydk** da importare in Master Duel (o in qualsiasi strumento che legge i .ydk);
- la stessa lista come testo, da copiare o salvare in .txt.

## Come si usa

Fai doppio clic su **`Apri Deck Roulette.bat`**, oppure apri direttamente `app\index.html` nel browser. Non serve internet e non serve un server.

1. In alto scegli il gioco (DS o PSP).
2. Scegli la modalità:
   - **Personaggio → Deck**: la ruota estrae prima il personaggio, poi uno dei suoi deck. Ogni personaggio ha la stessa probabilità di uscire.
   - **Deck casuale**: la ruota estrae direttamente un deck tra tutti quelli del gioco.
3. Premi **GIRA** (oppure la barra spaziatrice).
4. Nel pannello del risultato usi **Scarica .ydk**, **Copia lista** o **Scarica lista .txt**.

Filtri disponibili:

- personaggi da includere o escludere, con una casella di ricerca;
- livello del deck (solo nei Tag Force, dove i deck sono da 1 a 10);
- solo deck che si possono ricostruire al 100% in Master Duel;
- escludi i deck già estratti.

## Giochi inclusi

| Piattaforma | Giochi |
|---|---|
| DS | Nightmare Troubadour, GX Spirit Caller, World Championship 2007, 2008, 2009 (Stardust Accelerator), 2010 (Reverse of Arcadia), 2011 (Over the Nexus) |
| PSP | GX Tag Force 1, 2, 3, 5D's Tag Force 4, 5, 6, ARC-V Tag Force Special |

Il gioco *GX Card Almanac* (solo Giappone) non è incluso: è un'enciclopedia di carte e non contiene deck.

## Colori nella lista carte

- **arancio**: la carta esiste, ma non è presente in Master Duel;
- **azzurro corsivo**: è una Speed Spell. Se l'opzione è attiva, nel .ydk viene sostituita dalla Magia normale con lo stesso nome (per esempio "Speed Spell - Mystical Space Typhoon" diventa "Mystical Space Typhoon");
- **rosso barrato**: la carta esiste solo nel videogioco (carte dell'anime o esclusive dei Tag Force) e non ha un codice, quindi non può entrare nel .ydk.

## Importare il .ydk in Master Duel

Master Duel non legge i file .ydk da solo. Si importano con strumenti esterni, per esempio la funzione di import dei deck di masterduelmeta.com o altri importer della community. Se tolgo carte non disponibili, il Main Deck può scendere sotto le 40 carte: in quel caso l'app ti avvisa.

## Aggiornare i dati

Fai doppio clic su **`Aggiorna dati.bat`**. Serve Python 3 e una connessione a internet. Lo script riscarica da Yugipedia le liste dei deck dei personaggi e da YGOPRODeck i codici delle carte, poi rigenera `app\data\decks.js`.

## Fonti

- Liste dei deck: [Yugipedia](https://yugipedia.com), pagine dei personaggi di ciascun gioco.
- Codici carta e disponibilità in Master Duel: [YGOPRODeck API](https://ygoprodeck.com/api-guide/).
