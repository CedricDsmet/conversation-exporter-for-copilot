// Copilot Conversation Exporter — runs inside the Copilot tab (page context).
// Reads the open conversation from the page and returns it as Markdown + HTML.
// Nothing is sent anywhere: everything stays in the browser.
(() => {
  const TURN = '[data-testid="m365-chat-llm-web-ui-chat-message"]';
  const CODE_HOST = '[id^="code-block-host"], .scriptor-component-code-block';
  const SKIP =
    'button, svg, style, script, textarea, input, [role="status"], [aria-live], .katex-html';
  const UNSAFE =
    'iframe, frame, frameset, object, embed, applet, form, link, meta, base, noscript, template, portal, script';
  const FENCE = '```';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- SVG / MathML cleaning ----------

  // Diagrams (SVG) and formulas (MathML) are kept as markup in the exported file, so strip
  // anything inside them that could run code or load something when the file is opened.
  const FOREIGN_DROP = new Set([
    'script', 'animate', 'set', 'animatetransform', 'animatemotion', 'discard', 'handler', 'listener',
    'iframe', 'frame', 'object', 'embed', 'applet', 'form', 'link', 'meta', 'base', 'template', 'portal',
    'audio', 'video',
  ]);
  const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'poster', 'background']);
  const plainUrl = (v) => v.replace(/[\u0000- \u007f-\u009f]/g, '');

  function cleanForeign(root) {
    for (const e of [root, ...root.querySelectorAll('*')]) {
      if (e !== root && FOREIGN_DROP.has(e.localName.toLowerCase())) {
        e.remove();
        continue;
      }
      for (const a of [...e.attributes]) {
        const name = a.name.toLowerCase();
        let ok = !name.startsWith('on');
        if (URL_ATTRS.has(name)) ok = /^(https?:|#)/i.test(plainUrl(a.value)) || (name === 'src' && /^data:image\//i.test(plainUrl(a.value)));
        if (/^\s*(javascript|vbscript|data):/i.test(plainUrl(a.value)) && !(name === 'src' && /^data:image\//i.test(plainUrl(a.value)))) ok = false;
        if (!ok) e.removeAttribute(a.name);
      }
    }
    return root;
  }

  // ---------- images ----------

  const imgCache = new Map(); // image src -> data URL (or null when unreadable)
  let imgDefs = new Map(); // data URL -> reference id used in the Markdown file

  const isContentImage = (img) =>
    (img.naturalWidth || img.width) >= 64 && (img.naturalHeight || img.height) >= 64;
  const isContentCanvas = (c) => c.width >= 64 && c.height >= 64;

  async function toDataUrl(img) {
    const src = img.currentSrc || img.src || '';
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(src, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('http');
      const blob = await res.blob();
      if (blob.size > 8e6) return null;
      return await new Promise((ok, fail) => {
        const fr = new FileReader();
        fr.onload = () => ok(fr.result);
        fr.onerror = fail;
        fr.readAsDataURL(blob);
      });
    } catch {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png');
      } catch {
        return null;
      }
    }
  }

  // Embed images so the exported file still shows them after the links expire.
  async function prepareImages(scope) {
    for (const img of scope.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src || imgCache.has(src) || !isContentImage(img)) continue;
      imgCache.set(src, await toDataUrl(img));
    }
  }

  function imageUrl(el) {
    if (el.tagName === 'CANVAS') {
      try {
        return el.toDataURL('image/png');
      } catch {
        return null;
      }
    }
    const src = el.currentSrc || el.src || '';
    return imgCache.get(src) || (/^https?:/.test(src) ? src : null);
  }

  const svgDataUrl = (svg) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  function imgMd(url, alt) {
    alt = (alt || 'image').replace(/[\[\]\n]/g, ' ').trim();
    if (!url) return `[${alt}]`;
    if (!url.startsWith('data:')) return `![${alt}](${url})`;
    if (!imgDefs.has(url)) imgDefs.set(url, `image-${imgDefs.size + 1}`);
    return `![${alt}][${imgDefs.get(url)}]`;
  }

  const imgAlt = (el) => el.alt || el.getAttribute('aria-label') || (el.tagName === 'CANVAS' ? 'chart' : 'image');

  // ---------- code blocks, diagrams & math ----------

  // The page keeps the original source of every code block (also for diagrams that
  // are shown as a picture, and for long blocks that are only partly on screen).
  function sourceFromPage(host) {
    const key = Object.keys(host).find((k) => k.startsWith('__reactFiber$'));
    let f = key ? host[key] : null;
    for (let d = 0; f && d < 16; d++, f = f.return) {
      const md = f.memoizedProps && f.memoizedProps.markdown;
      if (typeof md !== 'string') continue;
      const m = md.match(/^\s*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n?[ \t]*\1\s*$/);
      if (m) return { lang: m[2].trim().toLowerCase(), text: m[3] };
    }
    return null;
  }

  function readCode(host) {
    const label = (host.querySelector('[data-testid="one-copilot-code-identity"]')?.textContent || '').trim();
    let lang = label.toLowerCase();
    if (lang.includes('mermaid')) lang = 'mermaid';
    else if (lang === 'plain text') lang = '';

    const frame = host.querySelector('iframe');
    let svg = null;
    if (frame) {
      try {
        const live = frame.contentDocument?.querySelector('svg');
        if (live) {
          const c = live.cloneNode(true);
          c.removeAttribute('height');
          // Very wide diagrams would shrink to an unreadable strip: keep them tall enough and let them scroll.
          const vb = (c.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
          if (vb.length === 4 && vb[3] > 0 && vb[2] / vb[3] > 5) c.style.minWidth = `${Math.round((vb[2] / vb[3]) * 240)}px`;
          svg = cleanForeign(c);
        }
      } catch {
        /* preview not readable */
      }
    }

    let text = '';
    const src = sourceFromPage(host);
    const lineEls = host.querySelectorAll('[data-line-index]');
    if (src) {
      text = src.text;
      if (src.lang) lang = src.lang;
    } else if (lineEls.length) {
      const lines = [];
      lineEls.forEach((l) => {
        lines[Number(l.dataset.lineIndex)] = l.textContent
          .replace(/ /g, ' ')
          .replace(/​/g, '')
          .replace(/\s+$/, '');
      });
      text = Array.from(lines, (l) => l ?? '').join('\n');
    } else if (!frame) {
      const el = host.querySelector('pre, code, [role="textbox"]');
      text = el ? el.textContent : '';
    }
    return { lang, label, svg, text: text.replace(/\n+$/, '') };
  }

  function readTex(el) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    return (ann ? ann.textContent : el.querySelector('.katex-mathml')?.textContent || el.textContent).trim();
  }

  // ---------- HTML -> Markdown ----------

  const BLOCK_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'DL', 'DD', 'DT']);

  const escText = (s) => s.replace(/([\\`*<])/g, '\\$1');

  const tidy = (s) =>
    s
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  function kids(el, ctx) {
    let out = '';
    for (const c of el.childNodes) out += conv(c, ctx);
    return out;
  }

  function stash(ctx, lang, text) {
    ctx.code.push(`${FENCE}${lang}\n${text}\n${FENCE}`);
    return `\n\n\u0000C${ctx.code.length - 1}\u0000\n\n`;
  }

  function list(el, ctx) {
    const ordered = el.tagName === 'OL';
    let i = Number(el.getAttribute('start')) || 1;
    const items = [];
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const marker = ordered ? `${i++}. ` : '- ';
      const pad = ' '.repeat(marker.length);
      // Keep nested lists tight against their parent item.
      const body = tidy(kids(li, ctx)).replace(/\n\n(?= *(?:- |\d+\. ))/g, '\n');
      items.push(
        marker +
          body
            .split('\n')
            .map((l, k) => (k && l ? pad + l : l))
            .join('\n')
      );
    }
    return `\n\n${items.join('\n')}\n\n`;
  }

  function table(el, ctx) {
    const rows = [...el.querySelectorAll('tr')].map((tr) =>
      [...tr.children]
        .filter((c) => c.tagName === 'TH' || c.tagName === 'TD')
        .map((c) => tidy(kids(c, ctx)).replace(/\n+/g, '<br>').replace(/\|/g, '\\|'))
    );
    if (!rows.length) return '';
    const n = Math.max(...rows.map((r) => r.length));
    const line = (r) => `| ${Array.from({ length: n }, (_, k) => r[k] || '').join(' | ')} |`;
    const out = [line(rows[0]), `| ${Array(n).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)];
    return `\n\n${out.join('\n')}\n\n`;
  }

  function conv(n, ctx) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent;
      if (/^\s*$/.test(t) && t.includes('\n')) return ''; // layout whitespace between blocks
      return escText(t.replace(/\s+/g, ' '));
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return '';
    const el = n;
    if (el.matches(CODE_HOST)) {
      const c = readCode(el);
      if (c.text) return stash(ctx, c.lang, c.text);
      if (c.svg) return `\n\n${imgMd(svgDataUrl(c.svg.outerHTML), c.label || 'diagram')}\n\n`;
      return '';
    }
    if (el.matches('.katex-display')) return `\n\n$$${readTex(el)}$$\n\n`;
    if (el.matches('.katex')) return `$${readTex(el)}$`;
    if (el.matches('button, [role="button"]')) {
      // Pictures are often wrapped in a "click to enlarge" button: keep the picture.
      const pics = [...el.querySelectorAll('img, canvas')].filter((p) =>
        p.tagName === 'CANVAS' ? isContentCanvas(p) : isContentImage(p)
      );
      if (pics.length) return `\n\n${pics.map((p) => imgMd(imageUrl(p), imgAlt(p))).join('\n\n')}\n\n`;
    }
    if (el.matches(SKIP)) return '';

    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      // Speaker names are level 2, so headings inside a reply start at level 3.
      const level = Math.min(6, Math.max(3, Number(tag[1]) + 1));
      const t = tidy(kids(el, ctx)).replace(/\n+/g, ' ');
      return t ? `\n\n${'#'.repeat(level)} ${t}\n\n` : '';
    }
    switch (tag) {
      case 'P':
        return `\n\n${kids(el, ctx)}\n\n`;
      case 'BR':
        return '\\\n';
      case 'HR':
        return '\n\n---\n\n';
      case 'STRONG':
      case 'B': {
        const t = kids(el, ctx);
        return t.trim() ? `**${t.trim()}**` : t;
      }
      case 'EM':
      case 'I': {
        const t = kids(el, ctx);
        return t.trim() ? `*${t.trim()}*` : t;
      }
      case 'DEL':
      case 'S': {
        const t = kids(el, ctx);
        return t.trim() ? `~~${t.trim()}~~` : t;
      }
      case 'CODE': {
        const t = el.textContent;
        const tick = t.includes('`') ? '``' : '`';
        return t ? `${tick}${t}${tick}` : '';
      }
      case 'PRE': {
        const code = el.querySelector('code');
        const lang = (code?.className.match(/language-([\w+#-]+)/) || [])[1] || '';
        return stash(ctx, lang, el.textContent.replace(/\n+$/, ''));
      }
      case 'A': {
        const t = tidy(kids(el, ctx)).replace(/\n+/g, ' ');
        const href = el.href || '';
        if (!/^https?:/.test(href)) return t;
        return `[${t || href}](${href})`;
      }
      case 'IMG':
        return isContentImage(el) ? imgMd(imageUrl(el), imgAlt(el)) : '';
      case 'CANVAS':
        return isContentCanvas(el) ? `\n\n${imgMd(imageUrl(el), imgAlt(el))}\n\n` : '';
      case 'UL':
      case 'OL':
        return list(el, ctx);
      case 'BLOCKQUOTE': {
        const t = tidy(kids(el, ctx));
        return `\n\n${t
          .split('\n')
          .map((l) => (l ? `> ${l}` : '>'))
          .join('\n')}\n\n`;
      }
      case 'TABLE':
        return table(el, ctx);
      default:
        return BLOCK_TAGS.has(tag) ? `\n\n${kids(el, ctx)}\n\n` : kids(el, ctx);
    }
  }

  function toMarkdown(root) {
    const ctx = { code: [] };
    const out = tidy(conv(root, ctx));
    // Put code blocks back, repeating the indentation / quote prefix of their line.
    return out.replace(/^(.*?)\u0000C(\d+)\u0000/gm, (_, prefix, i) => {
      const cont = prefix.replace(/[^>\s]/g, ' ');
      return ctx.code[Number(i)]
        .split('\n')
        .map((l, k) => (k ? cont + l : prefix + l))
        .join('\n');
    });
  }

  // ---------- HTML -> clean HTML ----------

  const escHtml = (s) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const imgHtml = (url, alt) =>
    url ? `<img src="${escHtml(url)}" alt="${escHtml(alt)}">` : `<p>[${escHtml(alt)}]</p>`;

  // Built with DOM methods (no HTML parsing), so it also works on pages that enforce Trusted Types.
  const h = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...children);
    return e;
  };

  const imgNode = (url, alt) => (url ? h('img', { 'data-keep': '', src: url, alt }) : h('p', {}, `[${alt}]`));

  function codeNode(c) {
    const frag = document.createDocumentFragment();
    const pre = c.text ? h('pre', {}, h('code', c.lang ? { 'data-lang': c.lang } : {}, c.text)) : null;
    if (!c.svg) {
      if (pre) frag.append(pre);
      return frag;
    }
    frag.append(h('figure', { 'data-keep': '', class: 'diagram' }, c.svg));
    if (pre) frag.append(h('details', {}, h('summary', {}, `Diagram source${c.lang ? ` (${c.lang})` : ''}`), pre));
    return frag;
  }

  const outermost = (root, sel) => [...root.querySelectorAll(sel)].filter((x) => !x.parentElement?.closest(sel));

  function toCleanHtml(root) {
    const c = root.cloneNode(true);
    // The clone is detached, so read from the live nodes and swap by position.
    const liveCode = outermost(root, CODE_HOST);
    const livePics = [...root.querySelectorAll('img, canvas')];
    const clonePics = [...c.querySelectorAll('img, canvas')];
    outermost(c, CODE_HOST).forEach((host, i) => host.replaceWith(codeNode(readCode(liveCode[i] || host))));
    clonePics.forEach((p, i) => {
      const live = livePics[i];
      if (!p.isConnected && !c.contains(p)) return;
      const content = live && (live.tagName === 'CANVAS' ? isContentCanvas(live) : isContentImage(live));
      if (!content) return p.remove();
      const holder = p.closest('button, [role="button"]');
      (holder && c.contains(holder) ? holder : p).replaceWith(imgNode(imageUrl(live), imgAlt(live)));
    });
    c.querySelectorAll('.katex').forEach((k) => {
      const math = k.querySelector('math');
      if (!math) return;
      const display = k.closest('.katex-display');
      if (display) math.setAttribute('display', 'block');
      (display || k).replaceWith(math);
    });
    c.querySelectorAll(SKIP).forEach((e) => {
      if (!e.closest('[data-keep]')) e.remove();
    });
    // Never carry embedded or active content into the exported file, not even inside kept blocks.
    c.querySelectorAll('form').forEach((f) => f.replaceWith(...f.childNodes)); // keep the text, drop the form
    c.querySelectorAll(UNSAFE).forEach((e) => e.remove());
    // SVG and MathML keep their own attributes below, so clean them with the stricter rules.
    outermost(c, 'math, svg').forEach(cleanForeign);
    const KEEP = new Set(['href', 'src', 'alt', 'colspan', 'rowspan', 'start', 'data-lang']);
    c.querySelectorAll('*').forEach((e) => {
      if (e.closest('math, svg')) return;
      const kept = e.hasAttribute('data-keep');
      for (const a of [...e.attributes]) {
        let ok = KEEP.has(a.name) || (kept && a.name === 'class');
        if (a.name === 'href') ok = /^https?:/i.test(a.value);
        if (a.name === 'src') ok = /^(https?:|data:image\/)/i.test(a.value);
        if (!ok) e.removeAttribute(a.name);
      }
      if (e.tagName === 'A') {
        e.setAttribute('target', '_blank');
        e.setAttribute('rel', 'noopener');
      }
    });
    return c.innerHTML;
  }

  // ---------- reading the conversation ----------

  // Pictures, charts and links that Copilot shows next to the text of a reply
  // (generated images, source lists, file cards).
  function extras(scope, roots) {
    const outside = (e) =>
      !roots.some((r) => r.contains(e)) && !e.closest('[data-testid="chat-suggestion"], nav, [role="navigation"]');
    const pics = [...scope.querySelectorAll('img, canvas')].filter(
      (p) => outside(p) && (p.tagName === 'CANVAS' ? isContentCanvas(p) : isContentImage(p))
    );
    const links = [];
    const seen = new Set();
    for (const a of scope.querySelectorAll('a[href]')) {
      if (!outside(a) || !/^https?:/.test(a.href) || seen.has(a.href)) continue;
      seen.add(a.href);
      const text = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      links.push({ href: a.href, text: text || a.href });
    }
    let markdown = pics.map((p) => imgMd(imageUrl(p), imgAlt(p))).join('\n\n');
    let html = pics.map((p) => imgHtml(imageUrl(p), imgAlt(p))).join('\n');
    if (links.length) {
      markdown += `${markdown ? '\n\n' : ''}**Links and sources**\n\n${links
        .map((l) => `- [${l.text.replace(/[\[\]]/g, ' ')}](${l.href})`)
        .join('\n')}`;
      html += `<p><strong>Links and sources</strong></p><ul>${links
        .map((l) => `<li><a href="${escHtml(l.href)}" target="_blank" rel="noopener">${escHtml(l.text)}</a></li>`)
        .join('')}</ul>`;
    }
    return { markdown, html };
  }

  async function readTurn(el, seq) {
    const wrap = el.closest('[data-virtualizer-key]');
    const key = wrap?.dataset.virtualizerKey || el.dataset.messageIndex || el.id || `seq-${seq}`;
    const order = Number(wrap?.dataset.virtualizerIndex ?? el.dataset.messageIndex ?? seq);
    const msgs = [];
    await prepareImages(el);

    const question = el.querySelector('[data-testid="chatQuestion"]');
    const q = question?.querySelector('[data-testid="chatOutput"]') || question;
    const qText = q ? q.innerText.replace(/^You said:\s*/i, '').trim() : '';
    const qExtra = question ? extras(question, q && q !== question ? [q] : []) : { markdown: '', html: '' };
    if (qText || qExtra.markdown) {
      msgs.push({
        role: 'user',
        markdown: [qText, qExtra.markdown].filter(Boolean).join('\n\n'),
        html: `<p>${escHtml(qText).replace(/\n/g, '<br>')}</p>${qExtra.html}`,
      });
    }

    let replies = [...el.querySelectorAll('[data-testid="markdown-reply"]')];
    if (!replies.length) {
      replies = [
        ...el.querySelectorAll('[data-testid="copilot-message-reply-div"] .fai-CopilotMessage__content'),
      ];
    }
    const answer = el.querySelector('[data-testid="copilot-message-div"]');
    const aExtra = answer ? extras(answer, replies) : { markdown: '', html: '' };
    const md = [...replies.map(toMarkdown), aExtra.markdown].filter(Boolean).join('\n\n');
    if (md) {
      msgs.push({ role: 'assistant', markdown: md, html: replies.map(toCleanHtml).join('\n') + aExtra.html });
    }

    const size = msgs.reduce((n, m) => n + m.markdown.length, 0);
    return { key, order, msgs, size };
  }

  function findScroller(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 20) return p;
    }
    return null;
  }

  // The message list is virtualized (off-screen messages are not in the page),
  // so scroll through the whole conversation and collect as we go.
  async function collect() {
    const seen = new Map();
    const grab = async () => {
      const els = [...document.querySelectorAll(TURN)];
      for (let i = 0; i < els.length; i++) {
        const t = await readTurn(els[i], i);
        const prev = seen.get(t.key);
        if (!prev || t.size >= prev.size) seen.set(t.key, t);
      }
    };
    await grab();
    const first = document.querySelector(TURN);
    if (!first) return [];
    const sc = findScroller(first);
    if (sc) {
      const orig = sc.scrollTop;
      let stable = 0;
      let lastH = -1;
      for (let i = 0; i < 60 && stable < 3; i++) {
        sc.scrollTop = 0;
        await sleep(300);
        await grab();
        if (sc.scrollHeight === lastH) stable++;
        else {
          stable = 0;
          lastH = sc.scrollHeight;
        }
      }
      for (let i = 0; i < 3000; i++) {
        await grab();
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
        const before = sc.scrollTop;
        sc.scrollTop = before + Math.max(200, sc.clientHeight * 0.6);
        await sleep(350);
        if (sc.scrollTop === before) break;
      }
      await sleep(400);
      await grab();
      sc.scrollTop = orig;
    }
    return [...seen.values()].sort((a, b) => a.order - b.order).flatMap((t) => t.msgs);
  }

  // ---------- output documents ----------

  const LABEL = { user: 'You', assistant: 'Copilot' };

  function isDarkPage() {
    const m = getComputedStyle(document.body).color.match(/\d+/g);
    return m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 > 140 : false;
  }

  function buildMarkdown(doc) {
    const head = `# ${doc.title}\n\n_Exported from Microsoft Copilot on ${doc.exportedAt} · ${doc.messages.length} messages_\n_Source: ${doc.url}_`;
    const body = doc.messages.map((m) => `## ${LABEL[m.role]}\n\n${m.markdown}`).join('\n\n---\n\n');
    // Embedded pictures go at the very end so the text stays readable.
    const used = [...imgDefs].filter(([, id]) => body.includes(`[${id}]`));
    const defs = used.length ? `\n\n<!-- embedded images -->\n\n${used.map(([url, id]) => `[${id}]: ${url}`).join('\n')}` : '';
    return `${head}\n\n---\n\n${body}${defs}\n`;
  }

  function buildHtml(doc) {
    const css = `
      body{font:16px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2328;background:#f6f7f9;margin:0;padding:32px 16px}
      main{max-width:860px;margin:0 auto}
      h1{font-size:1.6rem;margin:0 0 4px}
      .meta{color:#667085;font-size:.85rem;margin-bottom:28px;word-break:break-all}
      .msg{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:16px 22px;margin:0 0 16px}
      .msg.user{background:#eef4ff;border-color:#cfdcf7;margin-left:12%}
      .role{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#667085;margin-bottom:6px}
      .msg h1,.msg h2,.msg h3,.msg h4{line-height:1.3;margin:1.2em 0 .5em}
      .msg h1{font-size:1.35rem}.msg h2{font-size:1.25rem}.msg h3{font-size:1.1rem}
      table{border-collapse:collapse;margin:1em 0;display:block;overflow-x:auto;max-width:100%}
      th,td{border:1px solid #d0d5dd;padding:6px 12px;text-align:left;vertical-align:top}
      th{background:#f2f4f7}
      pre{background:#111827;color:#e5e7eb;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:.85rem;line-height:1.5}
      code{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace}
      :not(pre)>code{background:#eef0f3;padding:1px 5px;border-radius:4px;font-size:.9em}
      blockquote{border-left:4px solid #d0d5dd;margin:1em 0;padding:2px 16px;color:#475467}
      a{color:#175cd3}
      .msg img{max-width:100%;height:auto;border-radius:8px;margin:.5em 0;display:block}
      figure.diagram{margin:1em 0;padding:16px;border-radius:8px;overflow-x:auto;border:1px solid #e3e6ea;background:${doc.dark ? '#1f1f1f' : '#fff'}}
      figure.diagram svg{display:block;margin:0 auto;height:auto}
      details{margin:.5em 0 1em}summary{cursor:pointer;color:#667085;font-size:.85rem}
      @media print{body{background:#fff;padding:0}.msg{break-inside:auto}}
    `;
    const msgs = doc.messages
      .map(
        (m) =>
          `<section class="msg ${m.role}"><div class="role">${LABEL[m.role]}</div>\n${m.html}\n</section>`
      )
      .join('\n');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(doc.title)}</title><style>${css}</style></head>
<body><main>
<h1>${escHtml(doc.title)}</h1>
<div class="meta">Exported from Microsoft Copilot on ${escHtml(doc.exportedAt)} · ${doc.messages.length} messages<br>${escHtml(doc.url)}</div>
${msgs}
</main></body></html>
`;
  }

  // Saved from the page itself, so the download still happens if the popup closes mid-export.
  function saveFile(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // format: 'html' or 'md' saves a file here; anything else returns the Markdown for the popup to copy.
  window.__copilotExport = async (format) => {
    const result = await exportConversation();
    if (!result.count || (format !== 'html' && format !== 'md')) return result;
    if (format === 'md') saveFile(`${result.filename}.md`, result.markdown, 'text/markdown;charset=utf-8');
    else saveFile(`${result.filename}.html`, result.html, 'text/html;charset=utf-8');
    return { count: result.count, saved: true };
  };

  async function exportConversation() {
    imgDefs = new Map();
    const messages = await collect();
    const title =
      (document.title || '').replace(/\s*[|–-]\s*(Microsoft )?(365 )?Copilot.*$/i, '').trim() ||
      'Copilot conversation';
    const doc = {
      title,
      url: location.href,
      exportedAt: new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }),
      dark: isDarkPage(),
      messages,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';
    return {
      count: messages.length,
      title,
      filename: `copilot-${slug}-${stamp}`,
      markdown: messages.length ? buildMarkdown(doc) : '',
      html: messages.length ? buildHtml(doc) : '',
    };
  }
})();
