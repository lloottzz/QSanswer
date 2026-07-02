// ==UserScript==
// @name         AI 答题助手
// @namespace    https://github.com/qsanswer
// @version      2.1.0
// @description  悬浮窗 AI 答题助手
// @author       QSanswer
// @match        *://*/*
// @exclude      *://platform.deepseek.com/*
// @exclude      *://api.deepseek.com/*
// @exclude      *://chat.deepseek.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    var API = 'http://127.0.0.1:5000';
    var STORE = 'aqh_settings';

    var rand = Math.random().toString(36).slice(2, 10);
    var HOST_ID = 'aqh-' + rand;

    // 设置
    var settings = { mode: 'screenshot', think: 'normal' };
    try { var s = JSON.parse(GM_getValue(STORE, '{}')); Object.assign(settings, s); } catch(e) {}
    function save() { GM_setValue(STORE, JSON.stringify(settings)); }

    // Shadow DOM
    var host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:none;';
    var root = host.attachShadow({ mode: 'closed' });

    // === CSS (蓝白淡色系，已验证可用) ===
    var sty = document.createElement('style');
    sty.textContent = `
        .wrap * { margin: 0; padding: 0; border: 0; font: inherit; color: inherit; }
        .wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
        .ball {
            position: fixed; right: 20px; bottom: 80px; width: 52px; height: 52px; display: flex;
            border-radius: 50%; background: linear-gradient(135deg, #4a6cf7, #6c5ce7);
            color: #fff; font-size: 24px; align-items: center;
            justify-content: center; cursor: pointer; box-shadow: 0 4px 20px rgba(74,108,247,0.4);
            z-index: 2147483647; pointer-events: auto; user-select: none;
            transition: transform 0.2s; font-weight: 700;
        }
        .ball:hover { transform: scale(1.1); }
        .ball:active { transform: scale(0.95); }
        .panel {
            position: fixed; right: 20px; bottom: 80px; width: 420px; max-height: 580px; display: flex;
            background: #fff; color: #1a1a2e; border-radius: 16px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.15); z-index: 2147483647;
            pointer-events: auto; flex-direction: column; overflow: hidden;
            border: 1px solid #d6e4ff;
        }
        .hdr {
            display: flex; align-items: center; padding: 14px 18px;
            background: linear-gradient(135deg, #e8f0fe, #d6e4ff);
            border-bottom: 1px solid #c8d6e5; flex-shrink: 0; cursor: move;
            justify-content: space-between;
        }
        .hdr-t { font-size: 16px; font-weight: 700; color: #2c3e80; }
        .hdr-b { background: none; border: none; color: #7b8eb0; font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; }
        .hdr-b:hover { color: #2c3e80; }
        .bdy { flex: 1; overflow-y: auto; padding: 16px; display: block; }
        .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
        .tab {
            flex: 1; padding: 10px; border-radius: 10px; border: 2px solid #d6e4ff; display: block;
            background: #f4f8ff; color: #5a6e8e; cursor: pointer; text-align: center;
            font-size: 13px; font-weight: 600; transition: all 0.2s;
        }
        .tab.on { background: #4a6cf7; border-color: #4a6cf7; color: #fff; box-shadow: 0 2px 8px rgba(74,108,247,0.3); }
        .shot {
            min-height: 110px; border: 2px dashed #c8d6e5; border-radius: 14px; display: flex;
            align-items: center; justify-content: center; color: #8899b0;
            font-size: 14px; background: #fafcff; margin-bottom: 14px; overflow: hidden;
        }
        .shot img { max-width: 100%; max-height: 260px; display: block; }
        .hint { padding: 18px; color: #8899b0; font-size: 13px; text-align: center; line-height: 2; display: block; }
        .ttl { font-size: 12px; color: #7b8eb0; margin-bottom: 8px; font-weight: 600; display: block; }
        .thopts { display: flex; gap: 8px; margin-bottom: 14px; }
        .tho {
            flex: 1; padding: 8px 6px; border-radius: 8px; border: 2px solid #d6e4ff; display: block;
            background: #f4f8ff; color: #5a6e8e; cursor: pointer; text-align: center;
            font-size: 11px; font-weight: 600; transition: all 0.2s;
        }
        .tho.on { background: #4a6cf7; border-color: #4a6cf7; color: #fff; box-shadow: 0 2px 8px rgba(74,108,247,0.3); }
        .btn {
            width: 100%; padding: 12px; border-radius: 12px; border: none; display: block;
            background: linear-gradient(135deg, #4a6cf7, #6c5ce7); color: #fff;
            font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 14px;
            box-shadow: 0 4px 15px rgba(74,108,247,0.35); transition: all 0.2s;
        }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(74,108,247,0.45); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .ans {
            display: block; background: #f4f8ff; border-radius: 12px; padding: 16px; color: #1a1a2e;
            max-height: 250px; overflow-y: auto; font-size: 14px; line-height: 1.8;
            white-space: pre-wrap; word-break: break-word; border: 1px solid #d6e4ff;
            margin-bottom: 12px;
        }
        .ans:empty::after { content: '点击上方按钮开始答题...'; color: #b0bec5; display: block; }
        .btns { display: flex; gap: 8px; margin-bottom: 12px; }
        .btns button {
            flex: 1; padding: 10px; border-radius: 10px; border: 2px solid #d6e4ff; display: block;
            background: #fff; color: #4a6cf7; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .btns button:hover { background: #f0f4ff; border-color: #4a6cf7; }
        .chatr { display: flex; gap: 8px; }
        .chati {
            flex: 1; padding: 10px 14px; border-radius: 10px; border: 2px solid #d6e4ff; display: inline-block;
            background: #fff; color: #1a1a2e; font-size: 13px; outline: none;
        }
        .chati:focus { border-color: #4a6cf7; }
        .chats {
            padding: 10px 18px; border-radius: 10px; border: none; background: #4a6cf7; display: inline-block;
            color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
        }
        .chats:hover { background: #3b5de7; }
        .chats:disabled { opacity: 0.5; cursor: not-allowed; }
        .load { display: block; text-align: center; padding: 24px; color: #4a6cf7; font-size: 18px; }
        .err { display: block; color: #e74c3c; padding: 10px; font-size: 13px; }
        .hlink { margin-top: 10px; text-align: center; display: block; }
        .hlink span { color: #4a6cf7; font-size: 13px; cursor: pointer; font-weight: 600; }
        .hlink span:hover { text-decoration: underline; }
        .hitem {
            display: block; padding: 12px 14px; border-bottom: 1px solid #e8eef5; cursor: pointer;
            font-size: 13px; color: #1a1a2e;
        }
        .hitem:hover { background: #f0f4ff; }
        .hitem .htime { display: block; font-size: 11px; color: #8899b0; margin-bottom: 4px; }
        .hitem .hprev { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hzero { display: block; text-align: center; color: #b0bec5; padding: 40px; font-size: 14px; }
        .hdet {
            display: block; background: #f4f8ff; border-radius: 12px; padding: 16px; color: #1a1a2e;
            max-height: 280px; overflow-y: auto; font-size: 14px; line-height: 1.8;
            white-space: pre-wrap; border: 1px solid #d6e4ff;
        }
        .bkb {
            display: inline-block; background: #fff; border: 2px solid #d6e4ff; color: #4a6cf7; font-size: 13px;
            cursor: pointer; padding: 6px 14px; border-radius: 8px; margin-bottom: 10px; font-weight: 600;
        }
        .bkb:hover { background: #f0f4ff; }
        .clb {
            display: inline-block; background: #fff; border: 2px solid #f5c6cb; color: #e74c3c; font-size: 12px;
            cursor: pointer; padding: 6px 12px; border-radius: 8px; float: right; font-weight: 600;
        }
        .clb:hover { background: #fef0f0; }
    `;
    root.appendChild(sty);

    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    root.appendChild(wrap);

    // 状态
    var open = false;
    var panelRight = 20, panelBottom = 80;
    var ballRight = 20, ballBottom = 80;
    var img = null;
    var sid = null;
    var histText = '';
    var view = 'main';
    var hdata = [];
    var hitem = null;
    var abortCtrl = null;

    // 拖拽
    var dg = false, dsx, dsy, dsr, dsb;
    var pdg = false, psx, psy, psr, psb, pnl = null;

    document.addEventListener('mousemove', function(e) {
        if (dg) {
            var b = root.querySelector('.ball');
            ballRight = dsr + (dsx - e.clientX);
            ballBottom = dsb + (dsy - e.clientY);
            if (b) { b.style.right = ballRight + 'px'; b.style.bottom = ballBottom + 'px'; }
        }
        if (pdg && pnl) {
            panelRight = psr + (psx - e.clientX);
            panelBottom = psb + (psy - e.clientY);
            pnl.style.right = panelRight + 'px';
            pnl.style.bottom = panelBottom + 'px';
        }
    });
    document.addEventListener('mouseup', function() { dg = false; pdg = false; pnl = null; });

    function abrt() { if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; } }

    function ffetch(url, opts) {
        abrt();
        abortCtrl = new AbortController();
        var t = setTimeout(function() { abortCtrl.abort(); }, 120000);
        return fetch(url, Object.assign({}, opts, { signal: abortCtrl.signal })).finally(function() {
            clearTimeout(t); if (!abortCtrl.signal.aborted) abortCtrl = null;
        });
    }

    // === 渲染 ===
    function ball() {
        abrt();
        wrap.innerHTML = '';
        var b = document.createElement('div');
        b.className = 'ball';
        b.textContent = '答';
        b.title = 'AI 答题助手';
        b.style.right = ballRight + 'px'; b.style.bottom = ballBottom + 'px';
        b.addEventListener('click', function() { if (!open) { open = true; panel(); } });
        b.addEventListener('mousedown', function(e) {
            if (open) return; dg = true;
            dsx = e.clientX; dsy = e.clientY;
            dsr = parseInt(b.style.right) || ballRight; dsb = parseInt(b.style.bottom) || ballBottom;
            e.preventDefault();
        });
        wrap.appendChild(b);
    }

    function cls() { abrt(); open = false; img = null; sid = null; histText = ''; view = 'main'; ball(); }

    function panel() {
        abrt();
        if (view === 'history') return rhist();
        if (view === 'hdet') return rhdet();
        rmain();
    }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    function rmain() {
        wrap.innerHTML = '';
        var p = el('div', 'panel');
        p.style.right = panelRight + 'px'; p.style.bottom = panelBottom + 'px';
        var hdr = el('div', 'hdr');
        var ht = el('span', 'hdr-t', '📝 AI 答题助手');
        var hb = el('button', 'hdr-b', '✕');
        hb.addEventListener('click', function(e) { e.stopPropagation(); cls(); });
        var hl = el('button', 'hdr-b', '📋');
        hl.style.marginLeft = '10px'; hl.style.marginRight = 'auto'; hl.style.fontSize = '16px';
        hl.addEventListener('click', function(e) { e.stopPropagation(); view = 'history'; rhist(); });
        hdr.appendChild(ht); hdr.appendChild(hl); hdr.appendChild(hb);

        hdr.addEventListener('mousedown', function(e) {
            pdg = true; pnl = p;
            psx = e.clientX; psy = e.clientY;
            psr = parseInt(p.style.right) || panelRight; psb = parseInt(p.style.bottom) || panelBottom;
            e.preventDefault();
        });
        p.appendChild(hdr);

        var bdy = el('div', 'bdy');

        // tabs
        var tabs = el('div', 'tabs');
        ['screenshot','auto'].forEach(function(m) {
            var t = el('div', 'tab' + (settings.mode === m ? ' on' : ''));
            t.textContent = m === 'screenshot' ? '📸 截图答题' : '🔍 自动检测';
            t.addEventListener('click', function() { settings.mode = m; save(); img = null; sid = null; histText = ''; panel(); });
            tabs.appendChild(t);
        });
        bdy.appendChild(tabs);

        // shot area
        if (settings.mode === 'screenshot') {
            var sh = el('div', 'shot');
            if (img) { sh.innerHTML = '<img src="' + img + '">'; }
            else { sh.innerHTML = '<div class="hint">📌 用 <b>Win+Shift+S</b> 截图题目<br>在此按 <b>Ctrl+V</b> 粘贴</div>'; }
            bdy.appendChild(sh);
        } else {
            var sh2 = el('div', 'shot');
            sh2.style.minHeight = '60px';
            sh2.innerHTML = '<div class="hint">点击下方按钮自动抓取页面题目</div>';
            bdy.appendChild(sh2);
        }

        // think
        bdy.appendChild(el('div', 'ttl', '推理模式'));
        var tho = el('div', 'thopts');
        var lbs = { normal: '⚡ 普通', think: '🧠 深度思考', deep: '🔥 极限推理' };
        ['normal','think','deep'].forEach(function(m) {
            var t = el('div', 'tho' + (settings.think === m ? ' on' : ''), lbs[m]);
            t.addEventListener('click', function() { settings.think = m; save(); panel(); });
            tho.appendChild(t);
        });
        bdy.appendChild(tho);

        // go btn
        var go = el('button', 'btn', '🚀 开始答题');
        go.addEventListener('click', submit);
        bdy.appendChild(go);

        // answer
        var ans = el('div', 'ans');
        ans.id = 'ansBox';
        if (histText) ans.textContent = histText;
        bdy.appendChild(ans);

        // copy/fill
        var bts = el('div', 'btns');
        var cp = el('button', '', '📋 复制答案');
        cp.addEventListener('click', function() {
            var t = ans.textContent;
            if (!t) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t).catch(function() { fallbackCopy(t); });
            } else {
                fallbackCopy(t);
            }
            function fallbackCopy(text) {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
                document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
            }
        });
        var fl = el('button', '', '✏️ 填入页面');
        fl.addEventListener('click', function() {
            if (!histText) return;
            var m = histText.match(/【答案】\s*(\S+)/);
            var a = m ? m[1] : histText.split('\n')[0];
            var ae = document.activeElement;
            if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
                var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                    || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                if (s) s.call(ae, a); else ae.value = a;
                ae.dispatchEvent(new Event('input', { bubbles: true }));
                ae.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                var inp = document.querySelector('input:not([type="hidden"]), textarea');
                if (inp) { inp.focus(); inp.value = a; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
            }
        });
        bts.appendChild(cp); bts.appendChild(fl);
        bdy.appendChild(bts);

        // follow-up
        if (sid) {
            var cr = el('div', 'chatr');
            var ci = el('input', 'chati');
            ci.type = 'text'; ci.placeholder = '追问... 如：为什么不是A？';
            ci.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.isComposing) follow(); });
            var cs = el('button', 'chats', '发送');
            cs.addEventListener('click', follow);
            cr.appendChild(ci); cr.appendChild(cs);
            bdy.appendChild(cr);
        }

        // history link
        var hl2 = el('div', 'hlink');
        var hs = el('span', '', '📋 查看历史记录');
        hs.addEventListener('click', function() { view = 'history'; rhist(); });
        hl2.appendChild(hs);
        bdy.appendChild(hl2);

        p.appendChild(bdy);
        wrap.appendChild(p);
    }

    // === 答题 ===
    async function submit() {
        var ans = root.getElementById('ansBox');
        var go = root.querySelector('.btn');
        if (!ans) return;
        ans.innerHTML = '<div class="load">⏳ 思考中...</div>';
        go.disabled = true;
        sid = null;
        histText = '';

        try {
            var result;
            if (settings.mode === 'screenshot') {
                if (!img) { ans.textContent = '请先用 Win+Shift+S 截图，再 Ctrl+V 粘贴到此'; go.disabled = false; return; }
                var r = await ffetch(API + '/api/vision', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({image: img, mode: settings.think})
                });
                result = await r.json();
            } else {
                var pt = document.body ? (document.body.innerText || '') : '';
                var r = await ffetch(API + '/api/ask', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({text: '请从以下网页内容中找出所有题目并解答：\n\n' + pt.slice(0, 8000), mode: settings.think})
                });
                result = await r.json();
            }

            if (result.success) {
                sid = result.session_id || null;
                histText = result.answer;
                ans.textContent = result.answer;
                saveHist(result.answer);
            } else {
                ans.innerHTML = '<div class="err">❌ ' + (result.error || '请求失败') + '</div>';
            }
        } catch (err) {
            if (err.name === 'AbortError') ans.innerHTML = '<div class="err">⏱️ 请求超时</div>';
            else ans.innerHTML = '<div class="err">❌ 连接失败，请确保已启动服务 (start.bat)</div>';
        }
        go.disabled = false;
        panel();
    }

    async function follow() {
        var ci = root.querySelector('.chati');
        var cs = root.querySelector('.chats');
        if (!ci || !sid) return;
        var msg = ci.value.trim();
        if (!msg) return;

        var ans = root.getElementById('ansBox');
        cs.disabled = true; cs.textContent = '...'; ci.disabled = true;

        try {
            var r = await ffetch(API + '/api/chat', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({session_id: sid, message: msg})
            });
            var result = await r.json();
            if (result.success) {
                histText += '\n\n▸ ' + msg + '\n' + result.answer;
                if (ans) ans.textContent = histText;
                saveHist(histText);
                ci.value = '';
            } else {
                if (ans) ans.textContent = histText + '\n\n❌ ' + (result.error || '错误');
            }
        } catch (err) {
            if (ans) ans.textContent = histText + '\n\n❌ 发送失败';
        }
        cs.disabled = false; cs.textContent = '发送'; ci.disabled = false; ci.focus();
    }

    // === 历史 ===
    async function saveHist(content) {
        try { await fetch(API + '/api/history', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content})}); } catch(e){}
    }

    async function rhist() {
        view = 'history';
        try {
            var r = await fetch(API + '/api/history');
            var d = await r.json();
            hdata = d.history || [];
        } catch(e) { hdata = []; }

        wrap.innerHTML = '';
        var p = el('div', 'panel');
        p.style.right = panelRight + 'px'; p.style.bottom = panelBottom + 'px';
        var hdr = el('div', 'hdr');
        hdr.appendChild(el('span', 'hdr-t', '📝 历史记录'));
        var hb = el('button', 'hdr-b', '✕');
        hb.addEventListener('click', function(e) { e.stopPropagation(); cls(); });
        hdr.appendChild(hb);
        p.appendChild(hdr);

        var bdy = el('div', 'bdy');
        var bk = el('button', 'bkb', '← 返回');
        bk.addEventListener('click', function() { view = 'main'; panel(); });
        bdy.appendChild(bk);

        var cl = el('button', 'clb', '清空');
        cl.addEventListener('click', async function() {
            if (confirm('确定清空所有历史记录？')) { await fetch(API + '/api/history', {method:'DELETE'}); rhist(); }
        });
        bdy.appendChild(cl);
        bdy.appendChild(el('div', '', '<div style="clear:both"></div>'));

        if (hdata.length === 0) {
            bdy.appendChild(el('div', 'hzero', '📭 暂无历史记录'));
        } else {
            hdata.forEach(function(item) {
                var hi = el('div', 'hitem');
                hi.innerHTML = '<div class="htime">' + item.time + '</div><div class="hprev">' + item.preview + '</div>';
                hi.addEventListener('click', function() { hitem = item; view = 'hdet'; rhdet(); });
                bdy.appendChild(hi);
            });
        }
        p.appendChild(bdy);
        wrap.appendChild(p);
    }

    function rhdet() {
        view = 'hdet';
        wrap.innerHTML = '';
        var p = el('div', 'panel');
        p.style.right = panelRight + 'px'; p.style.bottom = panelBottom + 'px';
        var hdr = el('div', 'hdr');
        hdr.appendChild(el('span', 'hdr-t', '📝 历史记录'));
        var hb = el('button', 'hdr-b', '✕');
        hb.addEventListener('click', function(e) { e.stopPropagation(); cls(); });
        hdr.appendChild(hb);
        p.appendChild(hdr);

        var bdy = el('div', 'bdy');
        var bk = el('button', 'bkb', '← 返回列表');
        bk.addEventListener('click', function() { rhist(); });
        bdy.appendChild(bk);
        bdy.appendChild(el('div', 'hdet', hitem ? hitem.content : ''));
        p.appendChild(bdy);
        wrap.appendChild(p);
    }

    // === 粘贴截图 ===
    document.addEventListener('paste', function(e) {
        if (!open || settings.mode !== 'screenshot') return;
        var items = e.clipboardData?.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                var r = new FileReader();
                r.onload = function() { img = r.result; panel(); };
                r.readAsDataURL(items[i].getAsFile());
                break;
            }
        }
    });

    // === 全屏支持 ===
    function attach() {
        var t = document.fullscreenElement || document.webkitFullscreenElement || document.body;
        if (t && host.parentNode !== t) { try { t.appendChild(host); } catch(e) {} }
    }
    document.addEventListener('fullscreenchange', attach);
    document.addEventListener('webkitfullscreenchange', attach);

    function init() {
        if (!document.body) {
            var o = new MutationObserver(function() { if (document.body) { attach(); o.disconnect(); } });
            o.observe(document.documentElement, { childList: true });
        } else { attach(); }
    }

    // === 启动 ===
    ball();
    init();
})();
