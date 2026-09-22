// Bate-papo do HB. Único JavaScript do site público.
// Tudo que vem de outras pessoas entra na página via textContent, nunca como HTML.
'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const entrada = $('#entrada');
  const dentro = $('#dentro');
  const msgs = $('#msgs');
  const lista = $('#lista');
  const para = $('#para');
  const texto = $('#texto');
  const MAX_MSGS = 200;

  let eu = null; // { t, apelido, cor, adm }
  let fonte = null;
  let audio = null;

  const guardar = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ok */ } };
  const ler = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ok */ } };

  async function post(url, dados) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    } catch (causa) {
      const e = new Error('Não consegui falar com o servidor. Confere sua internet (ou o servidor pode estar reiniciando).');
      e.status = 0;
      e.detalhe = `POST ${url}\n${causa.message}`;
      throw e;
    }
    const texto = await r.text().catch(() => '');
    let j = {};
    try { j = JSON.parse(texto); } catch { /* sem json */ }
    if (!r.ok) {
      const e = new Error(j.erro || `O servidor respondeu com erro ${r.status}.`);
      e.status = r.status;
      e.detalhe = [`POST ${url} → HTTP ${r.status}`, j.codigo && `código: ${j.codigo}`, !j.erro && texto.slice(0, 300)].filter(Boolean).join('\n');
      throw e;
    }
    return j;
  }

  const avisar = (e, titulo) => window.hbErro(e.message, { titulo, detalhe: e.detalhe || '' });

  function el(tag, classe, txt) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // ------------------------------------------------------------ telas
  function mostrarEntrada(erro) {
    $('#carregando').hidden = true;
    dentro.hidden = true;
    entrada.hidden = false;
    const e = $('#erro-entrada');
    e.hidden = !erro;
    e.textContent = erro || '';
    const salvo = lerLocal('hb-chat-apelido');
    if (salvo && !$('#apelido').value) $('#apelido').value = salvo;
    const cor = lerLocal('hb-chat-cor');
    const radio = cor && document.querySelector(`input[name="cor"][value="${Number(cor)}"]`);
    if (radio) radio.checked = true;
    $('#apelido').focus();
  }

  function mostrarSala() {
    $('#carregando').hidden = true;
    entrada.hidden = true;
    dentro.hidden = false;
    $('#eu').textContent = (eu.adm ? '★ ' : '') + eu.apelido;
    $('#eu').style.color = eu.hex || '';
    texto.focus();
  }

  // ------------------------------------------------------------ mensagens
  function pertoDoFim() {
    return msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
  }

  function linha(m) {
    const li = el('div', 'm');
    li.dataset.id = m.id;
    li.append(el('span', 'hora', m.hora));

    if (m.tipo === 'sistema') {
      li.classList.add('sis');
      li.append(el('span', null, `*** ${m.texto}`));
      return li;
    }

    const comigo = eu && (m.para === eu.apelido || m.de === eu.apelido);
    if (m.reservado) li.classList.add('reservado');
    if (eu && m.para === eu.apelido) li.classList.add('pra-mim');

    const de = el('b', 'nick', (m.adm ? '★ ' : '') + m.de);
    de.style.color = m.cor;
    de.addEventListener('click', () => escolherPara(m.de));
    li.append(de, ` ${m.reservado ? 'reservadamente ' : ''}${m.acao} `);
    const alvo = el('b', 'nick', m.para);
    if (m.para !== 'Todos') alvo.addEventListener('click', () => escolherPara(m.para));
    li.append(alvo, ': ', el('span', 'txt', m.texto));

    if (eu && eu.adm && !m.reservado) {
      const x = el('button', 'mod', 'apagar');
      x.type = 'button';
      x.addEventListener('click', () => moderar({ acao: 'apagar', id: m.id }));
      li.append(x);
    }
    if (!comigo) li.classList.add('outros');
    return li;
  }

  function adicionar(m, { rolar = true, somar = true } = {}) {
    const estavaNoFim = pertoDoFim();
    msgs.append(linha(m));
    while (msgs.children.length > MAX_MSGS) msgs.firstChild.remove();
    if (rolar && estavaNoFim) msgs.scrollTop = msgs.scrollHeight;
    if (somar && eu && m.tipo === 'msg' && m.para === eu.apelido && m.de !== eu.apelido) bip();
  }

  function bip() {
    if (!$('#som').checked) return;
    try {
      audio = audio || new AudioContext();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(880, audio.currentTime);
      o.frequency.setValueAtTime(1320, audio.currentTime + 0.08);
      g.gain.setValueAtTime(0.06, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.25);
    } catch { /* sem som, tudo bem */ }
  }

  // ------------------------------------------------------------ quem está na sala
  function escolherPara(apelido) {
    if (!eu || apelido === eu.apelido) return;
    if ([...para.options].some((o) => o.value === apelido)) para.value = apelido;
    texto.focus();
  }

  function atualizarLista(pessoas) {
    $('#sala-online').textContent = `${pessoas.length} na sala`;
    lista.replaceChildren(...pessoas.map((p) => {
      const li = el('li');
      const b = el('button', 'nick', (p.adm ? '★ ' : '') + p.apelido);
      b.type = 'button';
      b.style.color = p.cor;
      b.title = p.apelido === eu.apelido ? 'você' : `falar com ${p.apelido}`;
      b.addEventListener('click', () => escolherPara(p.apelido));
      li.append(b);
      if (eu.adm && !p.adm) {
        const x = el('button', 'mod', 'expulsar');
        x.type = 'button';
        x.addEventListener('click', () => {
          if (confirm(`Expulsar ${p.apelido} da sala por 1 hora?`)) moderar({ acao: 'expulsar', apelido: p.apelido });
        });
        li.append(x);
      }
      return li;
    }));

    const atual = para.value;
    const opcoes = [new Option('Todos', 'todos'), ...pessoas.filter((p) => p.apelido !== eu.apelido).map((p) => new Option(p.apelido, p.apelido))];
    para.replaceChildren(...opcoes);
    para.value = opcoes.some((o) => o.value === atual) ? atual : 'todos';
  }

  async function moderar(dados) {
    try { await post('/chat/moderar', dados); } catch (e) { avisar(e, 'Moderação falhou'); }
  }

  // ------------------------------------------------------------ conexão em tempo real
  function conectar() {
    if (fonte) fonte.close();
    fonte = new EventSource(`/chat/eventos?t=${encodeURIComponent(eu.t)}`);

    fonte.onmessage = (ev) => {
      let d;
      try { d = JSON.parse(ev.data); } catch { return; }
      if (d.tipo === 'historico') {
        msgs.replaceChildren();
        d.msgs.forEach((m) => adicionar(m, { rolar: false, somar: false }));
        msgs.scrollTop = msgs.scrollHeight;
      } else if (d.tipo === 'msg' || d.tipo === 'sistema') {
        adicionar(d);
      } else if (d.tipo === 'online') {
        atualizarLista(d.lista);
      } else if (d.tipo === 'apagar') {
        msgs.querySelector(`[data-id="${Number(d.id)}"]`)?.remove();
      } else if (d.tipo === 'expulso') {
        largar('Você foi expulso da sala pelo webmaster.', true);
      }
    };

    // o EventSource reconecta sozinho; se a sala não conhece mais a gente, ele desiste (CLOSED)
    fonte.onerror = () => {
      if (fonte.readyState === EventSource.CLOSED) largar('Você caiu da sala (a conexão com o servidor caiu). Entra de novo!', true);
    };
  }

  // erro = true mostra o modal (sair por vontade própria não é erro)
  function largar(motivo, erro = false) {
    if (erro) window.hbErro(motivo, { titulo: 'Bate-papo' });
    if (fonte) fonte.close();
    fonte = null;
    eu = null;
    guardar('hb-chat-t', null);
    mostrarEntrada(motivo);
  }

  // ------------------------------------------------------------ eventos da página
  entrada.addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = entrada.querySelector('button');
    botao.disabled = true;
    try {
      const cor = document.querySelector('input[name="cor"]:checked')?.value ?? 0;
      const r = await post('/chat/entrar', { apelido: $('#apelido').value, cor });
      eu = r;
      guardar('hb-chat-t', r.t);
      guardarLocal('hb-chat-apelido', r.apelido);
      guardarLocal('hb-chat-cor', String(r.cor));
      mostrarSala();
      conectar();
    } catch (err) {
      mostrarEntrada(err.message);
      avisar(err, 'Não deu pra entrar na sala');
    } finally {
      botao.disabled = false;
    }
  });

  $('#falar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = texto.value.trim();
    if (!t || !eu) return;
    const botao = $('#falar button.botao');
    botao.disabled = true;
    try {
      await post('/chat/enviar', { t: eu.t, texto: t, para: para.value, acao: $('#acao').value, reservado: $('#reservado').checked });
      texto.value = '';
    } catch (err) {
      if (err.status === 401) return largar('Você caiu da sala. Entra de novo!', true);
      avisar(err, 'A mensagem não foi enviada');
    } finally {
      botao.disabled = false;
      texto.focus();
    }
  });

  $('#sair').addEventListener('click', async () => {
    const t = eu?.t;
    largar('Você saiu da sala. Volte sempre!');
    if (t) try { await post('/chat/sair', { t }); } catch { /* já era */ }
  });

  // Enter envia (garantido mesmo em navegador que não faz o envio implícito)
  for (const [campo, form] of [[texto, $('#falar')], [$('#apelido'), entrada]]) {
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  // recarregou a página? volta pra sala com o mesmo apelido
  (async () => {
    const t = ler('hb-chat-t');
    if (!t) return mostrarEntrada();
    try {
      const r = await post('/chat/retomar', { t });
      eu = { ...r, t };
      mostrarSala();
      conectar();
    } catch {
      guardar('hb-chat-t', null);
      mostrarEntrada();
    }
  })();
})();
