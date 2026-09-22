// Bate-papo do HB. Único JavaScript do site público.
// Tudo que vem de outras pessoas entra na página via textContent, nunca como HTML.
'use strict';

(() => {
  const $ = (s) => document.querySelector(s);
  const entrada = $('#entrada');
  const dentro = $('#dentro');
  const msgs = $('#msgs');
  const lista = $('#lista');
  const texto = $('#texto');
  const MAX_MSGS = 200;

  let eu = null; // { t, apelido, cor, adm }
  let fonte = null;

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
    $('#eu').replaceChildren(...apelido(eu.apelido, eu.adm));
    $('#eu').style.color = eu.hex || '';
    texto.focus();
  }

  // ------------------------------------------------------------ mensagens
  // apelido + selo ADM do webmaster (texto, montado sem innerHTML)
  function apelido(nome, adm) {
    return adm ? [nome, el('span', 'selo-adm', 'ADM')] : [nome];
  }

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

    // alguém escreveu @meu-apelido? a linha fica destacada
    if (eu && m.de !== eu.apelido && m.texto.toLowerCase().includes('@' + eu.apelido.toLowerCase())) li.classList.add('pra-mim');

    const de = el('b', 'nick');
    de.append(...apelido(m.de, m.adm));
    de.style.color = m.cor;
    de.addEventListener('click', () => chamar(m.de));
    li.append(de, ': ', el('span', 'txt', m.texto));

    if (eu && eu.adm) {
      const x = el('button', 'mod', 'apagar');
      x.type = 'button';
      x.addEventListener('click', () => moderar({ acao: 'apagar', id: m.id }));
      li.append(x);
    }
    return li;
  }

  function adicionar(m, { rolar = true } = {}) {
    const estavaNoFim = pertoDoFim();
    msgs.append(linha(m));
    while (msgs.children.length > MAX_MSGS) msgs.firstChild.remove();
    if (rolar && estavaNoFim) msgs.scrollTop = msgs.scrollHeight;
  }

  // ------------------------------------------------------------ quem está na sala
  // clicar num apelido coloca "@apelido " na mensagem
  function chamar(nome) {
    if (!eu || nome === eu.apelido) return;
    const marca = `@${nome} `;
    if (!texto.value.includes(marca)) texto.value = marca + texto.value;
    texto.focus();
    texto.setSelectionRange(texto.value.length, texto.value.length);
  }

  function atualizarLista(pessoas) {
    $('#sala-online').textContent = `${pessoas.length} na sala`;
    lista.replaceChildren(...pessoas.map((p) => {
      const li = el('li');
      const b = el('button', 'nick');
      b.append(...apelido(p.apelido, p.adm));
      b.type = 'button';
      b.style.color = p.cor;
      b.title = p.apelido === eu.apelido ? 'você' : `chamar ${p.apelido}`;
      b.addEventListener('click', () => chamar(p.apelido));
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
        d.msgs.forEach((m) => adicionar(m, { rolar: false }));
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
      await post('/chat/enviar', { t: eu.t, texto: t });
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
