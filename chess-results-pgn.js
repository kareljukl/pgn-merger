javascript:(()=>{

  const MERGER_URL = 'https://kareljukl.github.io/pgn-merger/';

  /* ── Odstranění diakritiky ───────────────────────────────────────── */
  const clean = s =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  /* ── 1. Metadata ze stránky ─────────────────────────────────────── */
  const pageTitle = clean(
    document.title
      .replace(/\s*[-\u2013|]\s*Chess.Results.*/i, '')
      .replace(/Chess-Results Server Chess-results\.com\s*[-\u2013]?\s*/i, '')
      .trim() || '?'
  );

  const body = document.body.innerText;

  const koloM = body.match(/(\d+)\.\s*Kolo/i);
  const kolo  = koloM ? koloM[1] : '?';

  const dateM  = body.match(/Datum kola\s+(\d{4})\/(\d{2})\/(\d{2})/);
  const pgDate = dateM
    ? dateM[1] + '.' + dateM[2] + '.' + dateM[3]
    : new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  /* ── 2. Parsování zápasů z DOM ──────────────────────────────────── */
  // Struktura každého řádku partie (vždy přesně 9 přímých buněk):
  //   [0]  "X.Y"   číslo zápasu.šachovnice
  //   [1]  titul   (ignorujeme)
  //   [2]  hráč    jméno domácího hráče (odkaz <a>)
  //   [3]  elo     ELO domácího hráče
  //   [4]  "-"     oddělovač
  //   [5]  titul   (ignorujeme)
  //   [6]  hráč    jméno hosta
  //   [7]  elo     ELO hosta
  //   [8]  výsl.   "1 - 0" / "0 - 1" / "½ - ½"
  //
  // Záhlaví zápasu používá <th> místo <td>.
  // Barva hráče čtena z CSS třídy vnořené tabulky:
  //   .FarbewT = bílé figurky, .FarbesT = černé figurky

  const matches = [];
  let cur = null;

  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
    if (!cells.length) continue;

    const f = cells[0].textContent.trim();

    /* --- Záhlaví zápasu --- */
    if (cells.length >= 7 && clean(f) === 'Sach.') {
      cur = {
        home   : clean(cells[2].textContent.trim()),
        away   : clean(cells[6].textContent.trim()),
        boards : []
      };
      matches.push(cur);
      continue;
    }

    /* --- Řádek partie: tvaru "X.Y", přesně 9 buněk --- */
    if (cur && cells.length === 9 && /^\d+\.\d+$/.test(f)) {
      const boardNum    = parseInt(f.split('.')[1], 10);
      const playerName  = td => clean((td.querySelector('a')?.textContent ?? '').trim());
      const eloVal      = td => { const v = td.textContent.trim(); return /^\d{3,4}$/.test(v) ? v : ''; };
      const homeIsWhite = cells[2].querySelector('.FarbewT') !== null;

      // Výsledek ze stránky je domácí - hosté → PGN potřebuje bílý - černý
      const rt = cells[8].textContent.trim();
      const rawResult =
        rt === '1 - 0'                                        ? '1-0'     :
        rt === '0 - 1'                                        ? '0-1'     :
        (rt.includes('\u00bd') || rt.includes('1/2'))         ? '1/2-1/2' : '*';
      const result = homeIsWhite ? rawResult
        : rawResult === '1-0' ? '0-1'
        : rawResult === '0-1' ? '1-0'
        : rawResult;

      cur.boards.push({
        boardNum, homeIsWhite,
        hPlayer : playerName(cells[2]), hElo : eloVal(cells[3]),
        aPlayer : playerName(cells[6]), aElo : eloVal(cells[7]),
        result
      });
    }
  }

  if (!matches.length) {
    alert('Nenalezeny zadne zapasy.\nUjisti se, ze jsi na strance se sestavou kola (art=3).');
    return;
  }

  /* ── 3. UI overlay ──────────────────────────────────────────────── */
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.82)', zIndex: '99999',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'flex-start', padding: '24px', overflow: 'auto',
    boxSizing: 'border-box', fontFamily: 'sans-serif'
  });
  document.body.appendChild(overlay);

  const el = (tag, style, text) => {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (label, style, onclick) => {
    const b = el('button',
      'padding:8px 16px;font-size:13px;cursor:pointer;border-radius:4px;' + (style || ''), label);
    b.onclick = onclick;
    return b;
  };

  /* ── Obrazovka 1: Výběr zápasu ── */
  const showMatchSelect = () => {
    overlay.innerHTML = '';
    overlay.appendChild(el('h2', 'color:white;margin-bottom:6px', 'Vyber zapas'));
    overlay.appendChild(el('p', 'color:#aaa;font-size:13px;margin-bottom:14px',
      pageTitle + '  \u2022  Kolo ' + kolo + '  \u2022  ' + pgDate));

    const wrap = el('div', 'display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:820px');
    matches.forEach(m => {
      wrap.appendChild(btn(m.home + ' - ' + m.away, '', () => showSettings(m)));
    });
    overlay.appendChild(wrap);

    if (matches.length > 1) {
      const total = matches.reduce((s, m) => s + m.boards.length, 0);
      overlay.appendChild(el('div', 'height:1px;background:#444;width:90%;max-width:700px;margin:18px 0'));
      overlay.appendChild(
        btn('Cele kolo (' + matches.length + ' zapasu, ' + total + ' partii)',
          'background:#2779aa;color:white;border:none;font-size:15px',
          () => showSettings(null))
      );
    }
    overlay.appendChild(btn('Zavrit', 'margin-top:20px;background:#555;color:white;border:none',
      () => overlay.remove()));
  };

  /* ── Obrazovka 2: Nastaveni ── */
  const showSettings = (match) => {
    overlay.innerHTML = '';
    overlay.appendChild(el('h2', 'color:white;margin-bottom:14px', 'Nastaveni PGN'));

    overlay.appendChild(el('label',
      'color:white;font-size:14px;display:block;margin-bottom:4px', 'Nazev souteze:'));
    const inp = el('input',
      'width:440px;max-width:92%;padding:8px;font-size:15px;display:block;margin-bottom:16px');
    inp.type  = 'text';
    inp.value = pageTitle;
    overlay.appendChild(inp);

    const mkChk = (label, checked) => {
      const lbl = el('label', 'color:white;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:10px');
      const chk = el('input', 'width:15px;height:15px;cursor:pointer');
      chk.type = 'checkbox'; chk.checked = checked;
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(label));
      overlay.appendChild(lbl);
      return chk;
    };
    const chkTeams = mkChk('Zahrnout nazvy druzstev do tagu Event', true);

    const hint = el('p', 'color:#aaa;font-size:13px;margin:4px 0 18px');
    const updHint = () => {
      const ev = inp.value.trim() || 'Soutez';
      hint.textContent = match
        ? (chkTeams.checked
            ? '-> [Event "' + ev + ', ' + match.home + ' - ' + match.away + '"]'
            : '-> [Event "' + ev + '"]')
        : '-> Cele kolo: ' + matches.length + ' zapasu, ' +
          matches.reduce((s, m) => s + m.boards.length, 0) + ' partii';
    };
    inp.addEventListener('input', updHint);
    chkTeams.addEventListener('change', updHint);
    updHint();
    overlay.appendChild(hint);

    const row = el('div', 'display:flex;gap:10px');
    row.appendChild(btn('<< Zpet', '', showMatchSelect));
    row.appendChild(btn('Generovat PGN', 'background:#2a9;color:white;border:none',
      () => showPGN(match, inp.value.trim(), chkTeams.checked)));
    overlay.appendChild(row);
  };

  /* ── Generování PGN tagů ── */
  const buildGames = (match, soutez, inclTeams) => {
    return match.boards.map(b => {
      const hiw = b.homeIsWhite;

      const white  = hiw ? b.hPlayer : b.aPlayer;
      const black  = hiw ? b.aPlayer : b.hPlayer;
      const wElo   = hiw ? b.hElo    : b.aElo;
      const bElo   = hiw ? b.aElo    : b.hElo;
      const wTeam  = hiw ? match.home : match.away;
      const bTeam  = hiw ? match.away : match.home;
      const ev = inclTeams
        ? (soutez || '?') + ', ' + match.home + ' - ' + match.away
        : (soutez || '?');

      let p = '';
      p += '[Event "' + ev + '"]\n';
      p += '[Site "chess-results.com"]\n';
      p += '[Date "' + pgDate + '"]\n';
      p += '[Round "' + kolo + '.' + b.boardNum + '"]\n';
      p += '[Board "' + b.boardNum + '"]\n';
      p += '[White "' + white + '"]\n';
      p += '[Black "' + black + '"]\n';
      if (wElo) p += '[WhiteElo "' + wElo + '"]\n';
      if (bElo) p += '[BlackElo "' + bElo + '"]\n';
      p += '[WhiteTeam "' + wTeam + '"]\n';
      p += '[BlackTeam "' + bTeam + '"]\n';
      p += '[Result "' + b.result + '"]\n';
      p += '\n' + b.result;
      return p;
    });
  };

  /* ── Obrazovka 3: PGN výstup ── */
  const showPGN = (match, soutez, inclTeams) => {
    overlay.innerHTML = '';
    overlay.appendChild(el('h2', 'color:white;margin-bottom:8px', 'PGN vysledku'));

    const matchList = match ? [match] : matches;
    let allGames = [];
    matchList.forEach(m => { allGames = allGames.concat(buildGames(m, soutez, inclTeams)); });

    const infoTxt = match
      ? match.home + ' - ' + match.away + '  |  Kolo ' + kolo + '  |  ' + match.boards.length + ' partii'
      : 'Cele kolo ' + kolo + '  |  ' + matchList.length + ' zapasu  |  ' + allGames.length + ' partii';
    overlay.appendChild(el('p', 'color:#ccc;margin-bottom:8px;font-size:14px', infoTxt));

    const ta = document.createElement('textarea');
    ta.value = allGames.join('\n\n');
    Object.assign(ta.style, {
      width: '92%', height: '42vh', fontSize: '12px', fontFamily: 'monospace'
    });
    overlay.appendChild(ta);
    ta.select();

    const ctrlRow = el('div', 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap');
    ctrlRow.appendChild(btn('<< Zpet', '', () => showSettings(match)));
    ctrlRow.appendChild(btn('Zavrit', 'background:#555;color:white;border:none', () => overlay.remove()));

    const copyBtn = btn('Kopirovat', 'background:#2779aa;color:white;border:none', () => {
      ta.select();
      navigator.clipboard?.writeText(ta.value).catch(() => document.execCommand('copy'));
      copyBtn.textContent = 'Zkopirovano!';
      setTimeout(() => { copyBtn.textContent = 'Kopirovat'; }, 2200);
    });
    ctrlRow.appendChild(copyBtn);

    ctrlRow.appendChild(btn('Ulozit PGN', 'background:#2a9;color:white;border:none', () => {
      const content = allGames.join('\n\n');
      const blob = new Blob([content], { type: 'application/x-chess-pgn;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const fname = match
        ? match.home + ' - ' + match.away + '.pgn'
        : 'Kolo_' + kolo + '.pgn';
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }));

    // ── Tlačítko: Otevrit v PGN Merger ──────────────────────────────
    const mergerBtn = btn('Sloucit s partiemi (PGN Merger)', 'background:#c9a84c;color:#1a1500;border:none;font-weight:600', () => {
      const pgn = allGames.join('\n\n');
      // Enkóduj jako base64url (PGN je po clean() čisté ASCII → btoa() funguje)
      const b64 = btoa(unescape(encodeURIComponent(pgn)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const url = MERGER_URL + '#pgn=' + b64;

      // Pokud je URL příliš dlouhá pro hash, zkusíme postMessage přes window.open
      if (url.length < 32000) {
        window.open(url, '_blank');
      } else {
        // Fallback: otevři merger a po načtení pošli postMessage
        const win = window.open(MERGER_URL, '_blank');
        const send = () => {
          try { win.postMessage({ type: 'pgn_merger_left', pgn }, '*'); } catch (_) {}
        };
        setTimeout(send, 1200);  // počkej na načtení stránky
        setTimeout(send, 2800);  // druhý pokus pro pomalé připojení
      }

      mergerBtn.textContent = 'Oteviram merger...';
      setTimeout(() => { mergerBtn.textContent = 'Sloucit s partiemi (PGN Merger)'; }, 3000);
    });
    ctrlRow.appendChild(mergerBtn);

    overlay.appendChild(ctrlRow);
  };

  showMatchSelect();

})()
