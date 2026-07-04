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

    // === CSS (极简高级风) ===
    var sty = document.createElement('style');
    sty.textContent = `
        .wrap * { margin: 0; padding: 0; border: 0; font: inherit; color: inherit; }
        .wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif; }
        .ball {
            position: fixed; right: 20px; bottom: 80px; width: 48px; height: 48px; display: flex;
            border-radius: 50%; background: #5252b3;
            color: #fff; font-size: 20px; align-items: center;
            justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(82,82,179,0.25);
            z-index: 2147483647; pointer-events: auto; user-select: none;
            transition: all 0.15s ease; font-weight: 700;
        }
        .ball:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(82,82,179,0.35); }
        .ball:active { transform: scale(0.95); }
        .panel {
            position: fixed; right: 20px; bottom: 80px; width: 400px; max-height: 560px; display: flex;
            background: #ffffff; color: #18181b; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.08); z-index: 2147483647;
            pointer-events: auto; flex-direction: column; overflow: hidden;
            border: 1px solid #e4e4e7;
        }
        .hdr {
            display: flex; align-items: center; padding: 14px 18px;
            background: #ffffff;
            border-bottom: 1px solid #e4e4e7; flex-shrink: 0; cursor: move;
            justify-content: space-between;
        }
        .hdr-t { font-size: 15px; font-weight: 600; color: #18181b; }
        .hdr-b { background: none; border: none; color: #a1a1aa; font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1; transition: all 0.15s ease; }
        .hdr-b:hover { color: #18181b; }
        .bdy { flex: 1; overflow-y: auto; padding: 16px; display: block; background: #ffffff; }
        .tabs { display: flex; gap: 0; margin-bottom: 14px; background: #f4f4f5; border-radius: 8px; padding: 3px; }
        .tab {
            flex: 1; padding: 8px; border-radius: 6px; border: none; display: block;
            background: transparent; color: #71717a; cursor: pointer; text-align: center;
            font-size: 13px; font-weight: 500; transition: all 0.15s ease;
        }
        .tab.on { background: #ffffff; border: none; color: #18181b; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
        .shot {
            min-height: 100px; border: 1px dashed #d4d4d8; border-radius: 12px; display: flex;
            align-items: center; justify-content: center; color: #a1a1aa;
            font-size: 13px; background: #fafafa; margin-bottom: 14px; overflow: hidden;
        }
        .shot img { max-width: 100%; max-height: 260px; display: block; }
        .hint { padding: 18px; color: #a1a1aa; font-size: 13px; text-align: center; line-height: 2; display: block; }
        .ttl { font-size: 11px; color: #71717a; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
        .thopts { display: flex; gap: 0; margin-bottom: 14px; background: #f4f4f5; border-radius: 8px; padding: 3px; }
        .tho {
            flex: 1; padding: 7px 6px; border-radius: 6px; border: none; display: block;
            background: transparent; color: #71717a; cursor: pointer; text-align: center;
            font-size: 12px; font-weight: 500; transition: all 0.15s ease;
        }
        .tho.on { background: #ffffff; border: none; color: #18181b; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .btn {
            width: 100%; padding: 12px; border-radius: 10px; border: none; display: block;
            background: #5252b3; color: #fff;
            font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 14px;
            box-shadow: 0 1px 3px rgba(82,82,179,0.3); transition: all 0.15s ease;
        }
        .btn:hover { background: #4444a8; box-shadow: 0 4px 12px rgba(82,82,179,0.25); transform: translateY(-1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .ans {
            display: block; background: #fafafa; border-radius: 10px; padding: 16px; color: #3f3f46;
            max-height: 250px; overflow-y: auto; font-size: 14px; line-height: 1.8;
            white-space: pre-wrap; word-break: break-word; border: 1px solid #e4e4e7;
            margin-bottom: 12px;
        }
        .ans:empty::after { content: '点击上方按钮开始答题...'; color: #a1a1aa; display: block; }
        .btns { display: flex; gap: 8px; margin-bottom: 12px; }
        .btns button {
            flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #e4e4e7; display: block;
            background: #ffffff; color: #5252b3; font-size: 13px; font-weight: 500; cursor: pointer;
            transition: all 0.15s ease;
        }
        .btns button:hover { background: #f4f4f5; border-color: #d4d4d8; }
        .chatr { display: flex; gap: 8px; }
        .chati {
            flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid #e4e4e7; display: inline-block;
            background: #ffffff; color: #18181b; font-size: 13px; outline: none; transition: all 0.15s ease;
        }
        .chati:focus { border-color: #5252b3; }
        .chats {
            padding: 10px 18px; border-radius: 8px; border: none; background: #5252b3; display: inline-block;
            color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
            transition: all 0.15s ease;
        }
        .chats:hover { background: #4444a8; }
        .chats:disabled { opacity: 0.4; cursor: not-allowed; }
        .load { display: block; text-align: center; padding: 24px; color: #71717a; font-size: 15px; }
        .err { display: block; color: #dc2626; padding: 10px; font-size: 13px; }
        .hlink { margin-top: 10px; text-align: center; display: block; }
        .hlink span { color: #5252b3; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.15s ease; }
        .hlink span:hover { text-decoration: underline; }
        .hitem {
            display: block; padding: 12px 14px; border-bottom: 1px solid #f4f4f5; cursor: pointer;
            font-size: 13px; color: #18181b; transition: all 0.15s ease;
        }
        .hitem:hover { background: #fafafa; }
        .hitem .htime { display: block; font-size: 11px; color: #a1a1aa; margin-bottom: 4px; }
        .hitem .hprev { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3f3f46; }
        .hzero { display: block; text-align: center; color: #a1a1aa; padding: 40px; font-size: 14px; }
        .hdet {
            display: block; background: #fafafa; border-radius: 10px; padding: 16px; color: #3f3f46;
            max-height: 280px; overflow-y: auto; font-size: 14px; line-height: 1.8;
            white-space: pre-wrap; border: 1px solid #e4e4e7;
        }
        .bkb {
            display: inline-block; background: #ffffff; border: 1px solid #e4e4e7; color: #5252b3; font-size: 13px;
            cursor: pointer; padding: 6px 14px; border-radius: 8px; margin-bottom: 10px; font-weight: 500;
            transition: all 0.15s ease;
        }
        .bkb:hover { background: #f4f4f5; }
        .clb {
            display: inline-block; background: #ffffff; border: 1px solid #fecaca; color: #dc2626; font-size: 12px;
            cursor: pointer; padding: 6px 12px; border-radius: 8px; float: right; font-weight: 500;
            transition: all 0.15s ease;
        }
        .clb:hover { background: #fef2f2; }
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
    var wrongCount = 0;          // 本次答题已加入错题本的数量
    var lastWrongEntryId = null; // 最近一次加入的错题 entry_id

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

    function cls() { abrt(); open = false; img = null; sid = null; histText = ''; view = 'main'; wrongCount = 0; lastWrongEntryId = null; ball(); }

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
            sh.setAttribute('data-dropzone', '1');
            if (img) { sh.innerHTML = '<img src="' + img + '">'; }
            else {
                sh.innerHTML = '<div class="hint" data-dropzone-hint="1">'
                    + '<div>📌 用 <b>Win+Shift+S</b> 截图题目</div>'
                    + '<div style="margin-top:6px">在此按 <b>Ctrl+V</b> 粘贴 · 或拖拽图片到此 · 或</div>'
                    + '<div style="margin-top:8px"><button class="bkb" data-pick-file="1" style="margin:0;padding:5px 12px;font-size:12px;">📂 选择图片文件</button></div>'
                    + '</div>';
            }
            bdy.appendChild(sh);

            // 文件选择按钮（隐藏 input，按钮触发）
            var fileInput = el('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', function(ev) {
                var f = ev.target.files && ev.target.files[0];
                if (f) { readImageFile(f, 'file-input'); }
                ev.target.value = '';
            });
            bdy.appendChild(fileInput);

            // 局部按钮
            var pickBtn = sh.querySelector('[data-pick-file]');
            if (pickBtn) {
                pickBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    fileInput.click();
                });
            }

            // 局部 paste 监听（shot 区域本身，覆盖document监听不可靠的场景）
            sh.addEventListener('paste', function(ev) {
                handlePaste(ev);
            });

            // 拖拽上传
            sh.addEventListener('dragover', function(ev) {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
                sh.style.borderColor = '#5252b3';
                sh.style.background = '#f0f0fa';
            });
            sh.addEventListener('dragleave', function(ev) {
                ev.preventDefault();
                sh.style.borderColor = '#d4d4d8';
                sh.style.background = '#fafafa';
            });
            sh.addEventListener('drop', function(ev) {
                ev.preventDefault();
                sh.style.borderColor = '#d4d4d8';
                sh.style.background = '#fafafa';
                var files = ev.dataTransfer && ev.dataTransfer.files;
                if (files && files.length) {
                    for (var i = 0; i < files.length; i++) {
                        if (files[i].type && files[i].type.indexOf('image/') === 0) {
                            readImageFile(files[i], 'drop');
                            break;
                        }
                    }
                }
            });
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

        // 错题标记区
        var wrong = el('div', '');
        wrong.style.cssText = 'background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px;margin-bottom:12px;display:block;';
        var wtitle = el('div', '', '💡 这道题你做对了吗？');
        wtitle.style.cssText = 'font-size:12px;color:#71717a;margin-bottom:8px;font-weight:600;display:block;';
        wrong.appendChild(wtitle);

        var wbtns = el('div', '');
        wbtns.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';

        var wok = el('button', '', '✅ 做对了');
        wok.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:1px solid #bbf7d0;background:#ffffff;color:#16a34a;font-size:12px;font-weight:600;cursor:pointer;display:inline-block;transition:all 0.15s ease;';
        wok.addEventListener('click', function() {
            wrong.querySelector('.wrong-detail').style.display = 'none';
            wok.style.background = '#f0fdf4'; wok.textContent = '✅ 已标记';
            werr.style.background = '#fff'; werr.textContent = '❌ 做错了';
            var oldTip = wrong.querySelector('.wrong-tip');
            if (oldTip) oldTip.remove();
            var tip = el('div', 'wrong-tip');
            tip.style.cssText = 'color:#16a34a;font-size:12px;text-align:center;padding:6px 0 0;display:block;';
            tip.textContent = '🎉 很棒！做对的题不会加入错题本';
            wrong.appendChild(tip);
        });

        var werr = el('button', '', '❌ 做错了');
        werr.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:1px solid #fecaca;background:#ffffff;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer;display:inline-block;transition:all 0.15s ease;';
        werr.addEventListener('click', function() {
            var detail = wrong.querySelector('.wrong-detail');
            detail.style.display = 'block';
            werr.style.background = '#fef2f2'; werr.textContent = '❌ 已标记';
            wok.style.background = '#fff'; wok.textContent = '✅ 做对了';
            var oldTip = wrong.querySelector('.wrong-tip');
            if (oldTip) oldTip.remove();
        });

        wbtns.appendChild(wok); wbtns.appendChild(werr);
        wrong.appendChild(wbtns);

        var wdetail = el('div', 'wrong-detail');
        wdetail.style.cssText = 'display:none;';

        // 计数提示
        var wcount = el('div', 'wrong-count');
        wcount.style.cssText = 'font-size:11px;color:#71717a;text-align:center;margin-bottom:8px;display:block;';
        wcount.textContent = '本次已加入 ' + wrongCount + ' 道错题';
        wdetail.appendChild(wcount);

        // 错答输入框
        var wi = el('input', 'chati');
        wi.type = 'text'; wi.placeholder = '我填的答案是...（可选，帮助AI精准诊断）';
        wi.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:8px;display:inline-block;';
        wdetail.appendChild(wi);

        // 加入错题本按钮（quick-add，允许连续标记多道）
        var wadd = el('button', 'btn', '➕ 加入错题本');
        wadd.style.cssText = 'width:100%;margin-bottom:8px;display:block;font-size:13px;background:#16a34a;box-shadow:0 1px 3px rgba(22,163,74,0.3);';
        wadd.addEventListener('click', async function() {
            if (!histText) { alert('请先点击「开始答题」获取答案'); return; }
            wadd.disabled = true; wadd.textContent = '⏳ 加入中...';
            try {
                var r = await ffetch(API + '/api/wrong/quick-add', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({
                        session_id: sid || '',
                        question: settings.mode === 'screenshot' ? (histText.slice(0, 500)) : (document.body ? document.body.innerText.slice(0, 2000) : ''),
                        correct_answer: histText,
                        wrong_answer: wi.value.trim(),
                        source_url: window.location.href
                    })
                });
                var result = await r.json();
                if (result.success && result.entry_id) {
                    wrongCount++;
                    lastWrongEntryId = result.entry_id;
                    wcount.textContent = '✓ 本次已加入 ' + wrongCount + ' 道错题';
                    wcount.style.color = '#16a34a';
                    wi.value = '';
                    wadd.textContent = '✓ 已加入（第' + wrongCount + '道），可继续标记';
                    setTimeout(function() { if (!wadd.disabled) wadd.textContent = '➕ 再加入一道错题'; }, 1500);
                } else {
                    alert('加入失败: ' + (result.error || '未知错误'));
                    wadd.textContent = '➕ 加入错题本';
                }
            } catch(e) { alert('请求失败: ' + e.message); wadd.textContent = '➕ 加入错题本'; }
            wadd.disabled = false;
        });
        wdetail.appendChild(wadd);

        // 分析最近一道按钮（对 lastWrongEntryId 触发AI分析）
        var wa = el('button', 'btn', '🔬 分析最近一道错题');
        wa.style.cssText = 'width:100%;margin-bottom:0;display:block;font-size:13px;';
        wa.addEventListener('click', async function() {
            if (!histText) { alert('请先点击「开始答题」获取答案'); return; }

            var analyzeId = lastWrongEntryId;
            // 如果还没加入，先快速入册
            if (!analyzeId) {
                wa.disabled = true; wa.textContent = '⏳ 加入中...';
                try {
                    var rr = await ffetch(API + '/api/wrong/quick-add', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({
                            session_id: sid || '',
                            question: settings.mode === 'screenshot' ? (histText.slice(0, 500)) : (document.body ? document.body.innerText.slice(0, 2000) : ''),
                            correct_answer: histText,
                            wrong_answer: wi.value.trim(),
                            source_url: window.location.href
                        })
                    });
                    var rres = await rr.json();
                    if (rres.success && rres.entry_id) {
                        analyzeId = rres.entry_id;
                        lastWrongEntryId = analyzeId;
                        wrongCount++;
                        wcount.textContent = '✓ 本次已加入 ' + wrongCount + ' 道错题';
                        wcount.style.color = '#16a34a';
                    } else {
                        alert('加入失败: ' + (rres.error || '未知错误'));
                        wa.disabled = false; wa.textContent = '🔬 分析最近一道错题';
                        return;
                    }
                } catch(e) { alert('请求失败: ' + e.message); wa.disabled = false; wa.textContent = '🔬 分析最近一道错题'; return; }
            }

            // 立即打开分析页面，显示"分析中"状态，API完成后自动跳转
            var win = window.open(API + '/analysis#analyzing', '_blank');
            if (!win) { alert('弹窗被浏览器拦截，请允许此站点的弹窗后重试'); return; }

            wa.disabled = true; wa.textContent = '⏳ 分析中...';
            try {
                var r = await ffetch(API + '/api/wrong/batch-analyze', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ ids: [analyzeId], mode: settings.think })
                });
                var result = await r.json();
                if (result.success && result.success_count > 0) {
                    win.location = API + '/analysis#' + analyzeId;
                } else {
                    win.close();
                    var errMsg = (result.results && result.results[0]) ? result.results[0].error : (result.error || '未知错误');
                    alert('分析失败: ' + errMsg);
                }
            } catch(e) { win.close(); alert('请求失败: ' + e.message); }
            wa.disabled = false; wa.textContent = '🔬 分析最近一道错题';
        });
        wdetail.appendChild(wa);
        wrong.appendChild(wdetail);
        bdy.appendChild(wrong);

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
        wrongCount = 0;
        lastWrongEntryId = null;

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

    // === 粘贴截图 / 拖拽 / 文件选择 三通道 ===
    function handlePaste(e) {
        if (!open || settings.mode !== 'screenshot') return;
        // 兼容性写法：clipboardData 可能在某些宿主页面被改写
        var cd = e.clipboardData || window.clipboardData;
        if (!cd) {
            console.warn('[AQH] paste: clipboardData 为空');
            return;
        }
        var items = cd.items;
        if (!items) {
            console.warn('[AQH] paste: items 为空');
            return;
        }
        var found = false;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.type && it.type.indexOf('image/') === 0) {
                e.preventDefault();
                var f = it.getAsFile && it.getAsFile();
                if (f) {
                    readImageFile(f, 'paste');
                    found = true;
                }
                break;
            }
        }
        if (!found) {
            console.log('[AQH] paste 未检测到图片，items 类型:', Array.prototype.map.call(items, function(x){return x.type}).join(','));
        }
    }

    function readImageFile(file, source) {
        if (!file) return;
        console.log('[AQH] 读取图片 source=' + source + ' name=' + (file.name||'') + ' size=' + file.size + ' type=' + file.type);
        try {
            var r = new FileReader();
            r.onload = function() {
                img = r.result;
                console.log('[AQH] 图片读取成功，dataURL长度=' + (img||'').length);
                panel();
            };
            r.onerror = function(err) {
                console.error('[AQH] FileReader 错误', err);
                alert('图片读取失败：' + (err && err.message ? err.message : '未知错误'));
            };
            r.readAsDataURL(file);
        } catch (e) {
            console.error('[AQH] readImageFile 异常', e);
            alert('图片读取异常：' + e.message);
        }
    }

    document.addEventListener('paste', handlePaste);

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
