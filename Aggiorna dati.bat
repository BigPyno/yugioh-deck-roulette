@echo off
rem Riscarica da Yugipedia e YGOPRODeck le liste dei deck e i codici carta, poi rigenera app\data\decks.js
cd /d "%~dp0"
echo [1/4] Pagine dei personaggi da Yugipedia...
python -I tools\fetch_wiki.py || goto :err
echo [2/4] Database carte da YGOPRODeck...
curl -s -A "DeckRouletteLocal/0.1" -o cache\cardinfo.json "https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes" || goto :err
echo [3/4] Prima estrazione dei deck...
python -I tools\build_decks.py || goto :err
echo [4/4] Nomi alternativi e rigenerazione finale...
python -I tools\resolve_aliases.py || goto :err
python -I tools\build_decks.py || goto :err
echo Fatto.
pause
exit /b 0
:err
echo Errore durante l'aggiornamento.
pause
exit /b 1
