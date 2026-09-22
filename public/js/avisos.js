// Modal de erro estilo Windows 98, usado pelo painel e pelo bate-papo.
//   hbErro('mensagem', { titulo, detalhe })
// Também pega qualquer erro de JavaScript que escapar (window.onerror / promise sem catch).
'use strict';

(() => {
  let dlg = null;
  let lista;
  let titulo;
  let pre;
  let detalhes;

  function montar() {
    dlg = document.createElement('dialog');
    dlg.className = 'modal-erro';
    dlg.setAttribute('aria-labelledby', 'modal-js-titulo');
    dlg.innerHTML = `
      <div class="janela-titulo"><span id="modal-js-titulo">Erro</span><button type="button" class="fechar" aria-label="Fechar">&times;</button></div>
      <div class="modal-corpo">
        <div class="modal-icone" aria-hidden="true">X</div>
        <div class="modal-textos">
          <ul class="modal-lista"></ul>
          <details class="modal-detalhes"><summary>Detalhes técnicos</summary><pre></pre></details>
        </div>
      </div>
      <div class="modal-botoes"><button type="button" class="btn98 copiar">Copiar erro</button><button type="button" class="btn98 ok">OK</button></div>`;
    document.body.append(dlg);
    lista = dlg.querySelector('.modal-lista');
    titulo = dlg.querySelector('#modal-js-titulo');
    pre = dlg.querySelector('pre');
    detalhes = dlg.querySelector('.modal-detalhes');

    // (a lista é limpa na hora de ABRIR, não no evento "close": ele chega atrasado e
    // apagaria um erro novo que aparecesse logo depois de fechar)
    const fechar = () => dlg.close();
    dlg.querySelector('.ok').addEventListener('click', fechar);
    dlg.querySelector('.fechar').addEventListener('click', fechar);
    dlg.querySelector('.copiar').addEventListener('click', async (e) => {
      const txt = `${titulo.textContent}\n${[...lista.children].map((li) => '- ' + li.textContent).join('\n')}\n\n${pre.textContent}`.trim();
      try {
        await navigator.clipboard.writeText(txt);
        e.target.textContent = 'Copiado!';
      } catch {
        e.target.textContent = 'Não deu :(';
      }
      setTimeout(() => { e.target.textContent = 'Copiar erro'; }, 1500);
    });
  }

  function hbErro(mensagem, { titulo: t = 'Erro', detalhe = '' } = {}) {
    if (!document.body) return document.addEventListener('DOMContentLoaded', () => hbErro(mensagem, { titulo: t, detalhe }));
    if (!dlg || !dlg.isConnected) montar();
    const texto = String(mensagem || 'Aconteceu um erro desconhecido.');
    if (!dlg.open) {
      lista.replaceChildren();
      pre.textContent = '';
    }

    // enquanto o modal está aberto, junta os erros numa lista (sem repetir)
    if (![...lista.children].some((li) => li.textContent === texto)) {
      const li = document.createElement('li');
      li.textContent = texto;
      lista.append(li);
      if (detalhe) pre.textContent += (pre.textContent ? '\n\n' : '') + `[${new Date().toLocaleTimeString('pt-BR')}] ${detalhe}`;
    }
    titulo.textContent = lista.children.length > 1 ? `${lista.children.length} erros` : t;
    detalhes.hidden = !pre.textContent;
    if (!dlg.open) {
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
      dlg.querySelector('.ok').focus();
    }
    console.error('[HB Hub]', texto, detalhe || '');
  }

  window.hbErro = hbErro;

  window.addEventListener('error', (e) => {
    if (!e.message) return;
    hbErro(`Deu pau no JavaScript da página: ${e.message}`, {
      titulo: 'Erro inesperado',
      detalhe: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    hbErro(r?.message || String(r), { titulo: 'Erro inesperado', detalhe: r?.detalhe || r?.stack || '' });
  });
})();
