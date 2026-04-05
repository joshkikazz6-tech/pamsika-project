'use strict';
/* ================================================================
   PA_MSIKA v4.0 — INTEGRATED APP
   Final UI from pamsika_v3 + Real Backend from pamsika_fixed
   ================================================================ */

const CFG = {
  waNumber:   '265890641028',
  email:      'Pamsika8@gmail.com',
  fbLink:     'https://www.facebook.com/share/1aFSLUWRQy/',
  siteUrl:    window.location.origin,
};

/**
 * Route external image URLs through the backend proxy so they are served
 * from the same origin — enabling canvas-based download and preventing
 * mixed-content / CORS errors.
 *
 * Internal URLs (same origin, placehold.co) are passed through unchanged.
 */
function imgProxy(url) {
  if (!url) return url;
  // Already same-origin or a placeholder — no proxy needed
  if (url.startsWith('/') || url.startsWith(window.location.origin) || url.includes('placehold.co')) return url;
  return '/api/v1/imgproxy?url=' + encodeURIComponent(url);
}

const CATS = {
  'All Items':  [],
  'Automobiles':['Cars','Motorcycles','Trucks'],
  'Fashion':    ['Men','Women','Shoes','Accessories'],
  'Real Estate':['Houses for sale','Houses for rent','Land'],
  'Electronics':['Phones','PCs','Home gadgets','Accessories']
};
const CAT_ICONS = {'All Items':'🛍','Automobiles':'🚗','Fashion':'👗','Real Estate':'🏠','Electronics':'📱'};

/* ── UTILS ────────────────────────────────────────────────── */
const U = {
  fmt(n){if(!n&&n!==0)return'MWK 0';if(n>=1000000)return'MWK '+(n/1000000).toFixed(n%1000000===0?0:1)+'M';return'MWK '+Number(n).toLocaleString('en-MW');},
  fmtFull(n){return'MWK '+Number(n).toLocaleString('en-MW');},
  fmtN(n){return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':String(n);},
  trunc(s,n){return s&&s.length>n?s.substr(0,n)+'…':s||''},
  esc(s){const d=document.createElement('div');d.textContent=String(s||'');return d.innerHTML;},
  async copy(t){try{await navigator.clipboard.writeText(t);return true;}catch{const e=document.createElement('textarea');e.value=t;e.style.cssText='position:fixed;opacity:0';document.body.appendChild(e);e.select();document.execCommand('copy');e.remove();return true;}},
  copyText(p,affId){const url=affId?CFG.siteUrl+'/?prod='+p.id+'&aff='+affId:CFG.siteUrl+'/?prod='+p.id;return['🛍 PA_MSIKA','━━━━━━━━━━','📦 '+p.name,'💰 '+this.fmtFull(p.price),'📍 '+(p.location||''),'💼 Comm: '+(p.commission_percent||5)+'%','🔗 '+url,'━━━━━━━━━━',CFG.siteUrl].join('\n');},
  orderMsg(items,ordId,user){const lines=items.map(i=>'  • '+i.name+' ×'+i.qty+' — '+this.fmtFull(i.price*i.qty)).join('\n');const tot=items.reduce((s,i)=>s+i.price*i.qty,0);return'*Pa_mSikA Order*\nRef: '+ordId+(user?'\nCustomer: '+user:'')+'\n\n'+lines+'\n\n*Total: '+this.fmtFull(tot)+'*\n\n'+CFG.siteUrl;},
  deb(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
};

/* ── TOAST ────────────────────────────────────────────────── */
const Toast={
  _el:null,init(){this._el=document.getElementById('toast-area');},
  show(title,msg='',type='info',icon='ℹ️',dur=3400){
    if(!this._el)return;
    const id='t'+Date.now();const el=document.createElement('div');
    el.className='toast toast-'+type;el.id=id;
    el.innerHTML='<span class="toast-icon">'+icon+'</span><div class="toast-content"><div class="toast-title">'+U.esc(title)+'</div>'+(msg?'<div class="toast-msg">'+U.esc(msg)+'</div>':'')+'</div><span class="toast-close" onclick="document.getElementById(\''+id+'\')?.remove()">✕</span>';
    this._el.appendChild(el);
    requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
    setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),400);},dur);
  }
};



/* ── RECENTLY VIEWED ─────────────────────────────────────── */
const RecentlyViewed = {
  KEY: 'pm_recently_viewed',
  MAX: 10,
  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; }
  },
  add(product) {
    let items = this.get().filter(p => p.id !== product.id);
    items.unshift({ id: product.id, name: product.name, price: product.price, images: product.images, category: product.category });
    if (items.length > this.MAX) items = items.slice(0, this.MAX);
    localStorage.setItem(this.KEY, JSON.stringify(items));
  },
  render() {
    const items = this.get();
    if (!items.length) return '';
    return `<div style="margin:24px 0;">
      <div style="font-family:var(--font-display);font-size:1rem;color:var(--text-2);margin-bottom:12px;">🕐 Recently Viewed</div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
        ${items.map(p => `<div onclick="Products.openDetail('${p.id}')" style="flex-shrink:0;width:100px;cursor:pointer;">
          <img src="${p.images?.[0] || 'https://placehold.co/100x100/161616/c8a84b?text=P'}" style="width:100px;height:100px;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="font-size:.68rem;color:var(--text-2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${U.esc(U.trunc(p.name,16))}</div>
          <div style="font-size:.72rem;color:var(--gold);">${U.fmt(p.price)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }
};

/* ── PRICE ALERTS ─────────────────────────────────────────── */
const PriceAlerts = {
  KEY: 'pm_price_alerts',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  add(product) {
    const alerts = this.get().filter(a => a.id !== product.id);
    alerts.push({ id: product.id, name: product.name, price: product.price, targetPrice: product.price * 0.9 });
    localStorage.setItem(this.KEY, JSON.stringify(alerts));
    Toast.show('Price Alert Set! 🔔', `We'll notify you if ${U.trunc(product.name,20)} drops in price`, 'success', '💰', 4000);
  },
  remove(productId) {
    const alerts = this.get().filter(a => a.id !== productId);
    localStorage.setItem(this.KEY, JSON.stringify(alerts));
  },
  has(productId) { return this.get().some(a => a.id === productId); },
  check(products) {
    const alerts = this.get();
    alerts.forEach(alert => {
      const current = products.find(p => p.id === alert.id);
      if (current && current.price < alert.price) {
        Toast.show('📉 Price Drop!', `${U.trunc(alert.name,20)} dropped to ${U.fmt(current.price)}!`, 'success', '💰', 8000);
        alert.price = current.price;
      }
    });
    localStorage.setItem(this.KEY, JSON.stringify(alerts));
  }
};

/* ── PUSH NOTIFICATIONS ───────────────────────────────────── */
const PushNotif = {
  async request() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      Toast.show('Not supported', 'Push notifications not supported on this browser', 'info', '🔔'); return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { Toast.show('Blocked', 'Enable notifications in browser settings', 'info', '🔔'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZkouYTQ_A1KHRJP2QGMHY5k3F4E'
      });
      await Api.subscribeNotifications(sub.toJSON(), Auth.user?.id || 'guest');
      Toast.show('Notifications enabled! 🔔', 'You will be notified of new products', 'success', '✅');
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    }
  }
};

/* ── DELIVERY ZONES ───────────────────────────────────────── */
const DELIVERY_ZONES = {
  'Lilongwe':  { days: '1-2', fee: 2000 },
  'Blantyre':  { days: '2-3', fee: 3500 },
  'Mzuzu':     { days: '3-4', fee: 4500 },
  'Zomba':     { days: '2-3', fee: 3000 },
};
function getDeliveryInfo(location) {
  return DELIVERY_ZONES[location] || { days: '3-7', fee: 5000 };
}


/* ═══════════════════════════════════════════════════════════
   COMMUNITY FEED
   ═══════════════════════════════════════════════════════════ */
const Community = {
  _posts: [],
  _interval: null,

  async load() {
    try {
      this._posts = await Api.getPosts();
      this.render();
    } catch(e) { console.error('Community load error', e); }
  },

  startPolling() {
    this.stopPolling();
    this._interval = setInterval(() => this.load(), 10000);
  },

  stopPolling() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  render() {
    const el = document.getElementById('community-feed');
    if (!el) return;
    if (!this._posts.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);"><div style="font-size:2rem;margin-bottom:8px;">📢</div><div>No posts yet. Check back soon!</div></div>';
      return;
    }
    // Save any in-progress comment text before re-rendering so polling doesn't wipe it
    const savedDrafts = {};
    el.querySelectorAll('input[id^="cmt-input-"]').forEach(inp => {
      if (inp.value) savedDrafts[inp.id] = inp.value;
    });
    el.innerHTML = this._posts.map(p => this._renderPost(p)).join('');
    // Restore saved drafts after render
    Object.entries(savedDrafts).forEach(([id, val]) => {
      const inp = document.getElementById(id);
      if (inp) { inp.value = val; inp.focus(); }
    });
  },

  _renderPost(p) {
    const liked = Auth.user && p.liked_by_ids.includes(String(Auth.user.id));
    const imgs = (p.images || []).map(img => `<img src="${imgProxy(img)}" style="width:100%;max-height:400px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:6px;" onerror="this.style.display='none'">`).join('');
    const comments = (p.comments || []).map(c => `
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;" id="cmt-${c.id}">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0;color:var(--gold);">${c.author[0]?.toUpperCase()}</div>
        <div style="flex:1;background:var(--bg-card-2);border-radius:var(--radius-sm);padding:8px 10px;">
          <div style="font-size:.7rem;font-weight:600;color:var(--gold);margin-bottom:2px;">${U.esc(c.author)}</div>
          <div style="font-size:.78rem;">${U.esc(c.content)}</div>
        </div>
        ${Auth.user && (String(Auth.user.id) === String(c.user_id) || Auth.user.is_admin) ? `<button onclick="Community._deleteComment('${c.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:.7rem;padding:4px;">✕</button>` : ''}
      </div>`).join('');

    return `<div class="community-post" id="post-${p.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;color:#000;">P</div>
          <div>
            <div style="font-size:.8rem;font-weight:600;color:var(--gold);">Pa_mSikA</div>
            <div style="font-size:.66rem;color:var(--text-3);">${new Date(p.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
        ${Auth.user?.is_admin ? `<button onclick="Community._deletePost('${p.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:.75rem;">🗑 Delete</button>` : ''}
      </div>
      ${p.content ? `<p style="font-size:.88rem;line-height:1.6;margin-bottom:10px;">${U.esc(p.content)}</p>` : ''}
      ${imgs}
      <div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:10px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
        <button onclick="Community._toggleLike('${p.id}')" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:.82rem;color:${liked ? 'var(--red)' : 'var(--text-3)'};" id="like-btn-${p.id}">
          ${liked ? '❤️' : '🤍'} <span id="like-count-${p.id}">${p.likes}</span>
        </button>
        <button onclick="Community._focusComment('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:.82rem;color:var(--text-3);">
          💬 ${p.comments.length} comment${p.comments.length !== 1 ? 's' : ''}
        </button>
      </div>
      <div id="comments-${p.id}" style="margin-bottom:10px;">${comments}</div>
      ${Auth.user ? `<div style="display:flex;gap:8px;align-items:center;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--gold);flex-shrink:0;">${Auth.user.full_name?.[0]?.toUpperCase() || '?'}</div>
        <input id="cmt-input-${p.id}" placeholder="Write a comment…" style="flex:1;font-size:.78rem;" onkeydown="if(event.key==='Enter')Community._submitComment('${p.id}')">
        <button class="aff-copy-btn" onclick="Community._submitComment('${p.id}')">Post</button>
      </div>` : `<div style="font-size:.76rem;color:var(--text-3);">
        <span onclick="UI.openAuth('login')" style="color:var(--gold);cursor:pointer;">Sign in</span> to comment
      </div>`}
    </div>`;
  },

  async _toggleLike(postId) {
    if (!Auth.user) return UI.openAuth('login');
    try {
      const res = await Api.likePost(postId);
      const btn = document.getElementById('like-btn-' + postId);
      const cnt = document.getElementById('like-count-' + postId);
      if (btn) btn.style.color = res.liked ? 'var(--red)' : 'var(--text-3)';
      if (btn) btn.childNodes[0].textContent = res.liked ? '❤️ ' : '🤍 ';
      if (cnt) cnt.textContent = res.likes;
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  _focusComment(postId) {
    const inp = document.getElementById('cmt-input-' + postId);
    if (inp) inp.focus();
  },

  async _submitComment(postId) {
    if (!Auth.user) return UI.openAuth('login');
    const inp = document.getElementById('cmt-input-' + postId);
    const content = inp?.value.trim();
    if (!content) return;
    try {
      const c = await Api.addComment(postId, content);
      inp.value = '';
      const container = document.getElementById('comments-' + postId);
      if (container) container.insertAdjacentHTML('beforeend', `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;" id="cmt-${c.id}">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0;color:var(--gold);">${c.author[0]?.toUpperCase()}</div>
          <div style="flex:1;background:var(--bg-card-2);border-radius:var(--radius-sm);padding:8px 10px;">
            <div style="font-size:.7rem;font-weight:600;color:var(--gold);margin-bottom:2px;">${U.esc(c.author)}</div>
            <div style="font-size:.78rem;">${U.esc(c.content)}</div>
          </div>
        </div>`);
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async _deleteComment(commentId) {
    try {
      await Api.deleteComment(commentId);
      document.getElementById('cmt-' + commentId)?.remove();
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async _deletePost(postId) {
    if (!await Confirm.show('This post will be permanently deleted.', { title: 'Delete post?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Delete', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try {
      await Api.deletePost(postId);
      document.getElementById('post-' + postId)?.remove();
      Toast.show('Deleted', '', 'info', '🗑');
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async adminCreatePost() {
    const content = document.getElementById('new-post-content')?.value.trim() || '';
    const imgInput = document.getElementById('new-post-imgs');
    let images = [];
    if (imgInput?.files?.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      images = await Admin._uploadFiles(imgInput.files);
    }
    if (!content && !images.length) return Toast.show('Error', 'Add text or images', 'error', '⚠️');
    try {
      await Api.createPost(content, images);
      document.getElementById('new-post-content').value = '';
      if (imgInput) imgInput.value = '';
      document.getElementById('new-post-preview')?.replaceChildren();
      Toast.show('Posted! 📢', 'All users will be notified', 'success', '✅');
      await Community.load();
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
};

/* ═══════════════════════════════════════════════════════════
   MESSAGES / DM SYSTEM
   ═══════════════════════════════════════════════════════════ */
const Messages = {
  _convs: [],
  _activeConv: null,
  _interval: null,
  _unreadInterval: null,
  _replyMedia: [],   // staged media URLs for the reply bar

  async load() {
    try {
      this._convs = Auth.user?.is_admin
        ? await Api.adminAllConversations()
        : await Api.myConversations();
      this.renderList();
    } catch(e) { console.error('Messages load error', e); }
  },

  startPolling() {
    this.stopPolling();
    this._interval = setInterval(() => {
      if (this._activeConv) this.openConversation(this._activeConv, true);
      else this.load();
    }, 8000);
    this._unreadBadge();
    this._unreadInterval = setInterval(() => this._unreadBadge(), 15000);
  },

  stopPolling() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    if (this._unreadInterval) { clearInterval(this._unreadInterval); this._unreadInterval = null; }
  },

  async _unreadBadge() {
    if (!Auth.user?.is_admin) return;
    try {
      const data = await Api.adminUnreadCount();
      ['msg-badge', 'msg-badge-b', 'msg-badge-h'].forEach(id => {
        const badge = document.getElementById(id);
        if (badge) { badge.textContent = data.count; badge.style.display = data.count > 0 ? 'flex' : 'none'; }
      });
    } catch {}
  },

  // ── Render sidebar list ──────────────────────────────────────────────────

  renderList() {
    const el = document.getElementById('messages-list');
    if (!el) return;

    const newBtn = Auth.user?.is_admin
      ? `<button onclick="Messages.showAdminCompose()" style="background:none;border:1.5px solid var(--gold);color:var(--gold);border-radius:var(--radius-sm);padding:5px 11px;font-size:.73rem;cursor:pointer;font-weight:600;">✏️ New</button>`
      : `<button onclick="Messages.showUserCompose()" style="background:var(--gold);border:none;color:#000;border-radius:var(--radius-sm);padding:6px 13px;font-size:.75rem;cursor:pointer;font-weight:700;">✏️ New</button>`;

    const header = `<div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);position:sticky;top:0;z-index:1;">
      <span style="font-size:.78rem;font-weight:700;color:var(--text-1);letter-spacing:.03em;">Messages</span>
      ${Auth.user ? newBtn : ''}
    </div>`;

    if (!this._convs.length) {
      el.innerHTML = header + `<div style="text-align:center;padding:40px 20px;color:var(--text-3);">
        <div style="font-size:2.2rem;margin-bottom:10px;">💬</div>
        <div style="font-size:.82rem;font-weight:600;margin-bottom:6px;">No conversations yet</div>
        <div style="font-size:.74rem;margin-bottom:16px;">Start a chat with Pa_mSikA support</div>
        ${Auth.user && !Auth.user.is_admin ? `<button onclick="Messages.showUserCompose()" style="background:var(--gold);border:none;color:#000;border-radius:var(--radius-sm);padding:9px 20px;font-size:.8rem;cursor:pointer;font-weight:700;">✏️ New Message</button>` : ''}
      </div>`;
      return;
    }

    const rows = this._convs.map(c => {
      const initials = (Auth.user?.is_admin ? c.user_name : 'P').slice(0,1).toUpperCase();
      const timeStr = (() => {
        const d = new Date(c.updated_at), now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return Math.floor(diff/60000) + 'm';
        if (diff < 86400000) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        return d.toLocaleDateString([],{day:'numeric',month:'short'});
      })();
      return `<div class="msg-conv-row${this._activeConv === c.id ? ' active' : ''}" onclick="Messages.openConversation('${c.id}')">
        <div class="msg-conv-avatar">${initials}</div>
        <div class="msg-conv-body">
          <div class="msg-conv-name">${U.esc(Auth.user?.is_admin ? c.user_name : 'Pa_mSikA Support')}
            ${c.unread > 0 ? `<span style="background:var(--gold);color:#000;border-radius:10px;font-size:.58rem;font-weight:700;padding:1px 6px;margin-left:5px;">${c.unread}</span>` : ''}
          </div>
          <div class="msg-conv-sub">${U.esc(c.subject)}${c.order_ref ? ' · #'+c.order_ref : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
          <span class="msg-conv-time">${timeStr}</span>
          <button class="msg-conv-del" onclick="event.stopPropagation();Messages.deleteConversation('${c.id}')" title="Delete chat">🗑</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = header + rows;
  },

  // ── Open a conversation thread ───────────────────────────────────────────

  async openConversation(convId, silent = false) {
    this._activeConv = convId;
    // Save any in-progress reply text so polling doesn't wipe it
    const draftText = document.getElementById('msg-reply-input')?.value || '';
    if (!silent) this._replyMedia = [];
    try {
      const conv = await Api.getConversation(convId);
      const el = document.getElementById('messages-thread');
      if (!el) return;
      if (!silent) this.renderList();

      // Build bubbles with date dividers
      const msgBubbles = (() => {
        let lastDate = '';
        const isSelf = m => Auth.user?.is_admin ? m.is_admin : !m.is_admin;
        return conv.messages.map(m => {
          const mDate = new Date(m.created_at);
          const dateStr = mDate.toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'});
          const todayStr = new Date().toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'});
          const yestStr  = new Date(Date.now()-86400000).toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'});
          const label    = dateStr === todayStr ? 'Today' : dateStr === yestStr ? 'Yesterday' : mDate.toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'});
          const divider  = dateStr !== lastDate ? `<div class="msg-date-divider"><span>${label}</span></div>` : '';
          lastDate = dateStr;
          const side = isSelf(m) ? 'sent' : 'received';
          const timeStr = mDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          const mediaHtml = (m.media_urls||[]).map(url =>
            `<img src="${U.esc(url)}" alt="img" onclick="window.open('${U.esc(url)}','_blank')" onerror="this.style.display='none'">`
          ).join('');
          const showSender = !isSelf(m) && Auth.user?.is_admin;
          return `${divider}<div class="msg-bubble-wrap ${side}">
            <div class="msg-bubble">
              ${showSender ? `<span class="msg-bubble-sender">${U.esc(m.sender)}</span>` : ''}
              ${m.content ? `<span class="msg-bubble-text">${U.esc(m.content)}</span>` : ''}
              ${mediaHtml}
              <span class="msg-bubble-time">${timeStr}</span>
            </div>
          </div>`;
        }).join('');
      })();

      // Mobile: slide to thread panel + hide bottom nav like WhatsApp
      const panels = document.querySelector('.msg-panels');
      if (panels) panels.classList.add('thread-open');
      document.body.classList.add('chat-open');

      const headerAvatar = (Auth.user?.is_admin ? conv.user_name : 'P').slice(0,1).toUpperCase();
      const headerName   = Auth.user?.is_admin ? U.esc(conv.user_name) : 'Pa_mSikA Support';
      const headerSub    = Auth.user?.is_admin
        ? `${U.esc(conv.user_email)} · ${U.esc(conv.subject)}`
        : `${U.esc(conv.subject)} · 🔒 encrypted`;

      el.innerHTML = `
        <div class="msg-chat-header">
          <button onclick="Messages._backToList()" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:1.5rem;padding:0 4px 0 0;flex-shrink:0;line-height:1;" title="Back">‹</button>
          <div class="msg-chat-header-avatar">${headerAvatar}</div>
          <div class="msg-chat-header-info">
            <div class="msg-chat-header-name">${headerName}</div>
            <div class="msg-chat-header-sub">${headerSub}</div>
          </div>
          <button onclick="Messages.deleteConversation('${conv.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:1rem;padding:6px;border-radius:50%;transition:background .15s;" onmouseover="this.style.background='rgba(255,60,60,.12)'" onmouseout="this.style.background=''" title="Delete chat">🗑</button>
        </div>
        <div class="msg-bubbles" id="msg-thread-body">
          ${msgBubbles || '<div style="text-align:center;color:var(--text-3);font-size:.8rem;padding:40px 20px;"><div style="font-size:2rem;margin-bottom:8px;">👋</div>Say hello!</div>'}
        </div>
        <div class="msg-input-bar">
          <div id="msg-media-preview" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
          <div class="msg-input-row">
            <label class="msg-attach-btn" title="Attach image">
              📎<input type="file" accept="image/*,image/gif" multiple style="display:none;" onchange="Messages._stageMedia(this,'${conv.id}')">
            </label>
            <textarea id="msg-reply-input" class="msg-textarea" placeholder="Message…" rows="1"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();Messages.sendReply('${conv.id}')}"
              oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
            <button class="msg-send-btn" onclick="Messages.sendReply('${conv.id}')" title="Send">➤</button>
          </div>
        </div>`;

      const body = document.getElementById('msg-thread-body');
      // Only auto-scroll on initial open, not on silent poll refreshes
      if (body && !silent) body.scrollTop = body.scrollHeight;
      // Restore any in-progress reply text draft after re-render
      if (draftText) {
        const inp = document.getElementById('msg-reply-input');
        if (inp) {
          inp.value = draftText;
          inp.style.height = 'auto';
          inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
        }
      }
      // Restore staged media previews — the innerHTML replace wipes the preview div
      if (this._replyMedia.length) {
        const preview = document.getElementById('msg-media-preview');
        if (preview) {
          preview.innerHTML = this._replyMedia.map((url, i) =>
            '<div style="position:relative;display:inline-block;">' +
            '<img src="' + U.esc(url) + '" style="height:48px;width:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border);">' +
            '<button onclick="Messages._removeMedia(' + i + ')" style="position:absolute;top:-4px;right:-4px;background:var(--bg-card);border:1px solid var(--border);border-radius:50%;width:16px;height:16px;font-size:.55rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>' +
            '</div>'
          ).join('');
        }
      }
    } catch(e) { if (!silent) Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  // ── Stage media files for a reply ───────────────────────────────────────

  async _stageMedia(input, convId) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const preview = document.getElementById('msg-media-preview');
    Toast.show('Uploading…', '', 'info', '⏳');
    try {
      // Use the existing upload endpoint
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      const token = Api._token;
      const res = await fetch(API_BASE + '/admin/upload/images', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      this._replyMedia.push(...(data.urls || []));
      // Show thumbs
      if (preview) {
        preview.innerHTML = this._replyMedia.map((url, i) =>
          `<div style="position:relative;display:inline-block;">
            <img src="${U.esc(url)}" style="height:48px;width:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border);" onerror="this.style.display='none'">
            <button onclick="Messages._removeMedia(${i})" style="position:absolute;top:-4px;right:-4px;background:var(--bg-card);border:1px solid var(--border);border-radius:50%;width:16px;height:16px;font-size:.55rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
          </div>`
        ).join('');
      }
    } catch(e) { Toast.show('Upload failed', e.message, 'error', '⚠️'); }
    input.value = '';
  },

  _removeMedia(idx) {
    this._replyMedia.splice(idx, 1);
    const preview = document.getElementById('msg-media-preview');
    if (preview) {
      preview.innerHTML = this._replyMedia.map((url, i) =>
        `<div style="position:relative;display:inline-block;">
          <img src="${U.esc(url)}" style="height:48px;width:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border);">
          <button onclick="Messages._removeMedia(${i})" style="position:absolute;top:-4px;right:-4px;background:var(--bg-card);border:1px solid var(--border);border-radius:50%;width:16px;height:16px;font-size:.55rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
        </div>`
      ).join('');
    }
  },

  // ── Send reply ───────────────────────────────────────────────────────────

  async sendReply(convId) {
    const inp = document.getElementById('msg-reply-input');
    const content = inp?.value.trim() || '';
    const media = [...this._replyMedia];
    if (!content && !media.length) return;
    inp.value = '';
    inp.style.height = 'auto';
    this._replyMedia = [];
    const preview = document.getElementById('msg-media-preview');
    if (preview) preview.innerHTML = '';
    try {
      await Api.replyMessage(convId, content, media);
      await this.openConversation(convId, true);
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  // ── User: compose new message (no order) ────────────────────────────────

  showUserCompose() {
    if (!Auth.user) return UI.openAuth('login');
    const thread = document.getElementById('messages-thread');
    if (!thread) return;
    thread.innerHTML = `
      <div style="padding:22px 20px;">
        <div style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:4px;">💬 New Message</div>
        <div style="font-size:.74rem;color:var(--text-3);margin-bottom:18px;">Send a message to Pa_mSikA support</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Subject</label>
          <input id="uc-subject" value="General Enquiry" style="width:100%;font-size:.82rem;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Message</label>
          <textarea id="uc-message" placeholder="Write your message here…" rows="4" style="width:100%;font-size:.82rem;box-sizing:border-box;resize:vertical;"></textarea>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Attach images (optional)</label>
          <input type="file" id="uc-files" accept="image/*" multiple style="font-size:.75rem;">
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-gold btn-sm" onclick="Messages._submitUserCompose()">Send Message</button>
          <button onclick="Messages._clearThread()" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 14px;font-size:.78rem;cursor:pointer;color:var(--text-2);">Cancel</button>
        </div>
      </div>`;
  },

  async _submitUserCompose() {
    const subject = document.getElementById('uc-subject')?.value.trim() || 'General Enquiry';
    const message = document.getElementById('uc-message')?.value.trim() || '';
    const filesInput = document.getElementById('uc-files');
    let mediaUrls = [];
    if (!message) return Toast.show('Error', 'Please write a message', 'error', '⚠️');
    if (filesInput?.files?.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      const formData = new FormData();
      Array.from(filesInput.files).forEach(f => formData.append('files', f));
      try {
        const res = await fetch(API_BASE + '/admin/upload/images', {
          method: 'POST',
          headers: Api._token ? { Authorization: 'Bearer ' + Api._token } : {},
          body: formData,
        });
        if (res.ok) { const d = await res.json(); mediaUrls = d.urls || []; }
      } catch {}
    }
    try {
      const res = await Api.startConversation(null, subject, message, mediaUrls);
      Toast.show('Message sent! 💬', 'We\'ll reply soon', 'success', '✅');
      await this.load();
      await this.openConversation(res.conversation_id);
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  // ── Admin: search user and compose ──────────────────────────────────────

  showAdminCompose() {
    const thread = document.getElementById('messages-thread');
    if (!thread) return;
    thread.innerHTML = `
      <div style="padding:22px 20px;">
        <div style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:4px;">✏️ New Message to User</div>
        <div style="font-size:.74rem;color:var(--text-3);margin-bottom:18px;">Search by registered email or name</div>
        <div style="margin-bottom:12px;position:relative;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Find User</label>
          <div style="display:flex;gap:8px;">
            <input id="ac-search" placeholder="email or name…" style="flex:1;font-size:.82rem;" oninput="Messages._debounceSearch(this.value)">
            <button onclick="Messages._doUserSearch()" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 12px;font-size:.78rem;cursor:pointer;">🔍</button>
          </div>
          <div id="ac-results" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:100;max-height:180px;overflow-y:auto;display:none;"></div>
        </div>
        <div id="ac-selected" style="display:none;margin-bottom:12px;padding:10px;background:var(--gold-dim);border:1px solid var(--gold);border-radius:var(--radius-sm);font-size:.78rem;">
          <span id="ac-selected-label"></span>
          <button onclick="Messages._clearUserSelection()" style="float:right;background:none;border:none;cursor:pointer;font-size:.8rem;color:var(--text-3);">✕</button>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Subject</label>
          <input id="ac-subject" value="Message from Pa_mSikA" style="width:100%;font-size:.82rem;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Message</label>
          <textarea id="ac-message" placeholder="Write your message…" rows="4" style="width:100%;font-size:.82rem;box-sizing:border-box;resize:vertical;"></textarea>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Attach images (optional)</label>
          <input type="file" id="ac-files" accept="image/*" multiple style="font-size:.75rem;">
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-gold btn-sm" onclick="Messages._submitAdminCompose()">Send Message</button>
          <button onclick="Messages._clearThread()" style="background:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 14px;font-size:.78rem;cursor:pointer;color:var(--text-2);">Cancel</button>
        </div>
      </div>`;
    this._selectedUserId = null;
    this._searchTimer = null;
  },

  _debounceSearch(val) {
    clearTimeout(this._searchTimer);
    if (val.length < 2) { const r = document.getElementById('ac-results'); if(r) r.style.display='none'; return; }
    this._searchTimer = setTimeout(() => this._doUserSearch(), 350);
  },

  async _doUserSearch() {
    const q = document.getElementById('ac-search')?.value.trim();
    if (!q || q.length < 2) return;
    const results = document.getElementById('ac-results');
    if (!results) return;
    try {
      const users = await Api.adminSearchUsers(q);
      if (!users.length) {
        results.innerHTML = '<div style="padding:10px 14px;font-size:.76rem;color:var(--text-3);">No users found</div>';
      } else {
        results.innerHTML = users.map(u =>
          `<div onclick="Messages._selectUser('${u.id}','${U.esc(u.full_name)}','${U.esc(u.email)}')"
               style="padding:9px 14px;cursor:pointer;font-size:.78rem;border-bottom:1px solid var(--border);"
               onmouseover="this.style.background='var(--bg-card-2)'" onmouseout="this.style.background=''">
            <div style="font-weight:600;">${U.esc(u.full_name)}</div>
            <div style="color:var(--text-3);font-size:.72rem;">${U.esc(u.email)}</div>
          </div>`
        ).join('');
      }
      results.style.display = 'block';
    } catch(e) { Toast.show('Search error', e.message, 'error', '⚠️'); }
  },

  _selectUser(id, name, email) {
    this._selectedUserId = id;
    const sel = document.getElementById('ac-selected');
    const lbl = document.getElementById('ac-selected-label');
    const res = document.getElementById('ac-results');
    if (lbl) lbl.textContent = `✅ ${name} (${email})`;
    if (sel) sel.style.display = 'block';
    if (res) res.style.display = 'none';
    const inp = document.getElementById('ac-search');
    if (inp) inp.value = '';
  },

  _clearUserSelection() {
    this._selectedUserId = null;
    const sel = document.getElementById('ac-selected');
    if (sel) sel.style.display = 'none';
  },

  async _submitAdminCompose() {
    if (!this._selectedUserId) return Toast.show('Error', 'Select a user first', 'error', '⚠️');
    const subject = document.getElementById('ac-subject')?.value.trim() || 'Message from Pa_mSikA';
    const message = document.getElementById('ac-message')?.value.trim() || '';
    const filesInput = document.getElementById('ac-files');
    let mediaUrls = [];
    if (!message) return Toast.show('Error', 'Please write a message', 'error', '⚠️');
    if (filesInput?.files?.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      const formData = new FormData();
      Array.from(filesInput.files).forEach(f => formData.append('files', f));
      try {
        const res = await fetch(API_BASE + '/admin/upload/images', {
          method: 'POST',
          headers: Api._token ? { Authorization: 'Bearer ' + Api._token } : {},
          body: formData,
        });
        if (res.ok) { const d = await res.json(); mediaUrls = d.urls || []; }
      } catch {}
    }
    try {
      const res = await Api.adminStartConversation(this._selectedUserId, subject, message, mediaUrls);
      Toast.show('Message sent! 💬', '', 'success', '✅');
      this._selectedUserId = null;
      await this.load();
      await this.openConversation(res.conversation_id);
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  // ── Start from order (user taps 💬 on order) ────────────────────────────

  async startFromOrder(orderId, orderRef) {
    if (!Auth.user) return UI.openAuth('login');
    Views.show('messages');
    const subject = `Order #${orderRef} Enquiry`;
    const thread = document.getElementById('messages-thread');
    if (thread) thread.innerHTML = `
      <div style="padding:22px 20px;">
        <div style="font-family:var(--font-display);font-size:1rem;margin-bottom:14px;">💬 Message about Order #${U.esc(orderRef)}</div>
        <div style="margin-bottom:10px;">
          <textarea id="new-msg-content" placeholder="Describe your issue or question…" rows="4" style="width:100%;font-size:.82rem;box-sizing:border-box;resize:vertical;"></textarea>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:.74rem;font-weight:600;display:block;margin-bottom:4px;">Attach images (optional)</label>
          <input type="file" id="new-msg-files" accept="image/*" multiple style="font-size:.75rem;">
        </div>
        <button class="btn btn-gold btn-sm" onclick="Messages._sendFirst('${orderId}','${subject}')">Send Message</button>
      </div>`;
  },

  async _sendFirst(orderId, subject) {
    const content = document.getElementById('new-msg-content')?.value.trim() || '';
    const filesInput = document.getElementById('new-msg-files');
    let mediaUrls = [];
    if (!content) return Toast.show('Error', 'Write a message first', 'error', '⚠️');
    if (filesInput?.files?.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      const formData = new FormData();
      Array.from(filesInput.files).forEach(f => formData.append('files', f));
      try {
        const res = await fetch(API_BASE + '/admin/upload/images', {
          method: 'POST',
          headers: Api._token ? { Authorization: 'Bearer ' + Api._token } : {},
          body: formData,
        });
        if (res.ok) { const d = await res.json(); mediaUrls = d.urls || []; }
      } catch {}
    }
    try {
      const res = await Api.startConversation(orderId, subject, content, mediaUrls);
      Toast.show('Message sent! 💬', 'Admin will reply soon', 'success', '✅');
      await this.load();
      await this.openConversation(res.conversation_id);
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  _clearThread() {
    this._activeConv = null;
    const panels = document.querySelector('.msg-panels');
    if (panels) panels.classList.remove('thread-open');
    document.body.classList.remove('chat-open');
    const el = document.getElementById('messages-thread');
    if (el) el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-3);text-align:center;padding:40px;gap:10px;">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--gold-dim);border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:2rem;">💬</div>
      <div style="font-size:.95rem;font-weight:700;color:var(--text-2);">Your conversations</div>
      <div style="font-size:.76rem;max-width:220px;line-height:1.6;">Select a chat from the left, or tap <strong style="color:var(--gold);">✏️ New</strong> to start one</div>
    </div>`;
  },

  _backToList() {
    const panels = document.querySelector('.msg-panels');
    if (panels) panels.classList.remove('thread-open');
    document.body.classList.remove('chat-open');
    this._activeConv = null;
  },

  async deleteConversation(convId) {
    const ok = await Confirm.show('Delete this conversation?', {
      title: 'Delete Chat', icon: '🗑', okText: 'Delete', okColor: 'var(--red)', okBorder: 'var(--red)'
    });
    if (!ok) return;
    try {
      await Api.deleteConversation(convId);
      this._convs = this._convs.filter(c => c.id !== convId);
      if (this._activeConv === convId) this._clearThread();
      this.renderList();
      Toast.show('Deleted', 'Conversation removed', 'success', '🗑');
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
};

/* ── CONFIRM DIALOG ───────────────────────────────────────── */
const Confirm = {
  show(message, opts = {}) {
    return new Promise(resolve => {
      const { title = 'Are you sure?', icon = '⚠️', iconColor = 'var(--gold)', okText = 'Confirm', okColor = 'var(--gold)', okBorder = 'var(--gold)' } = opts;
      const id = 'confirm-' + Date.now();
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px;';
      el.innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--border-2);border-radius:var(--radius);padding:28px 24px;max-width:360px;width:100%;text-align:center;">
        <div style="font-size:2rem;color:${iconColor};margin-bottom:10px;">${icon}</div>
        <div style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:8px;">${title}</div>
        <div style="font-size:.82rem;color:var(--text-3);margin-bottom:22px;">${message}</div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button onclick="document.getElementById('${id}').remove();window['_cr_${id}'](false);" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid var(--border-2);background:none;color:var(--text-2);cursor:pointer;font-size:.84rem;">Cancel</button>
          <button onclick="document.getElementById('${id}').remove();window['_cr_${id}'](true);" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid ${okBorder};background:none;color:${okColor};cursor:pointer;font-size:.84rem;font-weight:600;">${okText}</button>
        </div>
      </div>`;
      window['_cr_' + id] = resolve;
      document.body.appendChild(el);
    });
  }
};

/* ── MODAL ────────────────────────────────────────────────── */
const Modal={
  open(id){const el=document.getElementById(id);if(!el)return;el.classList.add('open');document.body.classList.add('modal-open');},
  close(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('open');if(!document.querySelector('.modal-backdrop.open'))document.body.classList.remove('modal-open');},
  closeAll(){document.querySelectorAll('.modal-backdrop.open').forEach(m=>m.classList.remove('open'));document.body.classList.remove('modal-open');},
  init(){
    document.querySelectorAll('.modal-backdrop').forEach(bd=>bd.addEventListener('click',e=>{if(e.target===bd)Modal.close(bd.id);}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')Modal.closeAll();});
  }
};

/* ── AUTH STATE ───────────────────────────────────────────── */
const Auth = {
  user: null,

  async load() {
    if (!Api._token) return;
    try {
      this.user = await Api.me();
      this._nav();
    } catch {
      Api.setToken(null);
      this.user = null;
    }
  },

  async login(email, pw) {
    if (!email.includes('@')) return { err: 'Invalid email' };
    if (pw.length < 8) return { err: 'Password must be at least 8 characters' };
    try {
      await Api.login(email, pw);
      this.user = await Api.me();
      this._nav();
      // Sync cart after login
      await Cart.load();
      return { ok: true };
    } catch (e) {
      return { err: e.message || 'Login failed' };
    }
  },

  async register(name, email, pw) {
    if (!name || name.length < 2) return { err: 'Enter your name' };
    if (!email.includes('@')) return { err: 'Invalid email' };
    if (pw.length < 8) return { err: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(pw)) return { err: 'Password needs at least one uppercase letter' };
    if (!/[0-9]/.test(pw)) return { err: 'Password needs at least one number' };
    try {
      const referredBy = sessionStorage.getItem('pm_aff_invite') || null;
      await Api.register(name, email, pw, referredBy);
      this.user = await Api.me();
      this._nav();
      await Cart.load();
      return { ok: true };
    } catch (e) {
      return { err: e.message || 'Registration failed' };
    }
  },

  async logout() {
    await Api.logout();
    this.user = null;
    Cart.items = [];
    Cart._badge();
    Favs.ids = [];
    Favs._badge();
    this._nav();
    Toast.show('Signed out', '', 'info', '👋');
  },

  _nav() {
    const btn = document.getElementById('nav-auth-btn');
    const ua = document.getElementById('nav-user-area');
    const un = document.getElementById('nav-user-name');
    if (!btn) return;
    if (this.user) {
      btn.style.display = 'none';
      if (ua) ua.style.display = 'flex';
      if (un) un.textContent = this.user.full_name || this.user.email;
    } else {
      btn.style.display = 'flex';
      if (ua) ua.style.display = 'none';
    }
  }
};

/* ── CART ─────────────────────────────────────────────────── */
const Cart = {
  items: [], // { id, product_id, name, price, image, location, qty }

  async load() {
    try {
      const data = await Api.getCart();
      this.items = (data.items || []).map(i => ({
        id: i.id,
        product_id: i.product_id,
        name: i.product?.name || 'Product',
        price: i.price_at_add,
        image: (i.product?.images || [])[0] || '',
        location: i.product?.location || '',
        qty: i.quantity
      }));
    } catch {
      this.items = [];
    }
    this._badge();
    this._render();
  },

  _badge() {
    const n = this.items.reduce((s, i) => s + i.qty, 0);
    const label = n > 99 ? '99+' : n;
    ['cart-badge','cart-badge-b'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = label; b.style.display = n > 0 ? 'flex' : 'none'; } });
  },

  async add(product, qty = 1) {
    try {
      await Api.addToCart(product.id, qty);
      await this.load();
      Toast.show('Added to cart', U.trunc(product.name, 32), 'success', '🛒');
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    }
  },

  async remove(itemId) {
    try {
      await Api.removeCartItem(itemId);
      this.items = this.items.filter(i => i.id !== itemId);
      this._badge();
      this._render();
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    }
  },

  async setQty(itemId, qty) {
    if (qty < 1) { await this.remove(itemId); return; }
    try {
      await Api.updateCartItem(itemId, qty);
      const item = this.items.find(x => x.id === itemId);
      if (item) item.qty = qty;
      this._badge();
      this._render();
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    }
  },

  async clear() {
    try {
      await Api.clearCart();
      this.items = [];
      this._badge();
    } catch {}
  },

  total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
  count() { return this.items.reduce((s, i) => s + i.qty, 0); },

  async openModal() {
    await this.load();
    this._render();
    Modal.open('cart-modal');
  },

  _render() {
    const body = document.getElementById('cart-body');
    const foot = document.getElementById('cart-foot');
    if (!body) return;
    if (!this.items.length) {
      body.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>Your cart is empty</p><p style="font-size:.76rem;color:var(--text-3);margin-top:6px;">Browse products and add items</p></div>';
      if (foot) foot.innerHTML = ''; return;
    }
    body.innerHTML = this.items.map(i => `
      <div class="cart-item">
        <img class="cart-item-img" src="${imgProxy(i.image)}" alt="${U.esc(i.name)}" onerror="this.src='https://placehold.co/62x62/161616/c8a84b?text=P'">
        <div class="cart-item-info">
          <div class="cart-item-name">${U.esc(U.trunc(i.name, 38))}</div>
          <div class="cart-item-loc">📍 ${U.esc(i.location)}</div>
          <div class="cart-item-price">${U.fmt(i.price * i.qty)}</div>
          <div class="cart-qty-row">
            <button class="qty-btn" onclick="Cart.setQty('${i.id}',${i.qty - 1})">−</button>
            <span class="qty-num">${i.qty}</span>
            <button class="qty-btn" onclick="Cart.setQty('${i.id}',${i.qty + 1})">+</button>
            <span class="cart-remove" onclick="Cart.remove('${i.id}')">✕ Remove</span>
          </div>
        </div>
      </div>`).join('');
    const sub = this.total();
    if (foot) foot.innerHTML = `
      <div style="padding-top:14px;">
        <div class="cart-total"><span>Subtotal (${this.count()} items)</span><span>${U.fmt(sub)}</span></div>
        <div class="cart-total big"><span>Total</span><span>${U.fmtFull(sub)}</span></div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="Cart.clear().then(()=>Cart._render())">Clear</button>
          <button class="btn btn-gold" style="flex:2" onclick="Modal.close('cart-modal');OrderModal.open(Cart.items, true)">Checkout →</button>
        </div>
      </div>`;
  }
};

/* ── FAVORITES ────────────────────────────────────────────── */
const Favs = {
  ids: [],

  async load() {
    if (!Auth.user) { this.ids = []; this._badge(); return; }
    try {
      const data = await Api.getFavorites();
      this.ids = data.map(f => f.product_id);
    } catch { this.ids = []; }
    this._badge();
  },

  _badge() {
    const n = this.ids.length;
    ['fav-badge','fav-badge-b'].forEach(id => { const b = document.getElementById(id); if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; } });
  },

  has(id) { return this.ids.includes(String(id)); },

  async toggle(id) {
    if (!Auth.user) {
      Toast.show('Sign in', 'Please sign in to save favourites', 'info', '❤️');
      UI.openAuth('login'); return false;
    }
    try {
      if (this.has(id)) {
        await Api.removeFavorite(id);
        this.ids = this.ids.filter(x => x !== String(id));
        Toast.show('Removed', '', 'info', '💔');
      } else {
        await Api.addFavorite(id);
        this.ids.push(String(id));
        Toast.show('Saved!', '', 'success', '❤️');
      }
      this._badge();
      return this.has(id);
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️'); return false;
    }
  }
};

/* ── AFFILIATE STATE ──────────────────────────────────────── */
const Aff = {
  data: null,

  async load() {
    if (!Auth.user) return;
    try {
      this.data = await Api.affiliateDashboard();
    } catch { this.data = null; }
  },

  async join() {
    try {
      await Api.joinAffiliate();
      await this.load();
      return { ok: true };
    } catch (e) {
      return { err: e.message };
    }
  },

  async refLink(productId) {
    if (!this.data) return CFG.siteUrl + '/?prod=' + productId;
    try {
      const data = await Api.referralLink(productId);
      return data.referral_url;
    } catch {
      return CFG.siteUrl + '/?prod=' + productId + '&aff=' + this.data.affiliate_id;
    }
  },

  refLinkSync(productId) {
    if (!this.data) return CFG.siteUrl + '/?prod=' + productId;
    return CFG.siteUrl + '/?prod=' + productId + '&aff=' + this.data.affiliate_id;
  }
};

/* ── ORDER MODAL ──────────────────────────────────────────── */
const OrderModal = {
  items: [], ordId: '', _fromCart: false,

  open(items, fromCart = false) {
    this.items = items;
    this._fromCart = fromCart;
    this.ordId = 'ORD-' + Date.now().toString(36).toUpperCase();
    const body = document.getElementById('order-modal-body'); if (!body) return;
    const tot = items.reduce((s, i) => s + i.price * i.qty, 0);

    body.innerHTML = `
      <div style="margin-bottom:14px;">
        ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:.82rem;gap:10px;">
          <span style="color:var(--text-2);flex:1;">${U.esc(U.trunc(i.name, 34))} ×${i.qty}</span>
          <span style="color:var(--gold);flex-shrink:0;">${U.fmt(i.price * i.qty)}</span>
        </div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding-top:11px;font-family:var(--font-display);font-size:1.02rem;">
          <span>Total</span><span style="color:var(--gold);">${U.fmtFull(tot)}</span>
        </div>
      </div>
      <div style="background:var(--bg-card-2);border-radius:var(--radius-sm);padding:11px;margin-bottom:14px;">
        <div style="font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:4px;">Order Reference</div>
        <div style="font-family:monospace;color:var(--gold);font-size:.8rem;">${this.ordId}</div>
        <button onclick="U.copy('${this.ordId}').then(()=>Toast.show('Copied','','info','📋'))" style="margin-top:7px;padding:3px 9px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text-3);font-size:.66rem;cursor:pointer;">📋 Copy Ref</button>
      </div>
      <p style="font-size:.74rem;color:var(--text-3);margin-bottom:13px;line-height:1.5;">Choose how to send your order.</p>
      <div class="order-method-btns">
        <button class="order-method-btn order-wa" onclick="OrderModal.send('whatsapp')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Order via WhatsApp
        </button>
        <button class="order-method-btn order-email" onclick="OrderModal.send('email')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>
          Order via Email
        </button>
        <button class="order-method-btn order-fb" onclick="OrderModal.send('messenger')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Order via Facebook
        </button>
      </div>`;
    Modal.open('order-modal');
  },

  async send(method) {
    const user = Auth.user ? Auth.user.full_name || Auth.user.email : '';
    const tot = this.items.reduce((s, i) => s + i.price * i.qty, 0);
    const raw = U.orderMsg(this.items, this.ordId, user);
    const affRef = sessionStorage.getItem('pm_aff_ref');
    const contactInfo = { reference: this.ordId, name: user };

    // Always persist order to backend — works for both guests and logged-in users
    try {
      if (this._fromCart && Auth.user) {
        // Cart checkout: backend reads the DB cart (requires login)
        const extraHeaders = affRef ? { 'X-Affiliate-Ref': affRef } : {};
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const opts = {
          method: 'POST',
          headers: { ...Api._headers(), ...extraHeaders },
          body: JSON.stringify({ payment_method: method, contact_info: contactInfo }),
          signal: controller.signal,
          credentials: 'include'
        };
        await fetch('/api/v1/orders', opts);
        clearTimeout(timer);
      } else {
        // Direct "Order Now" — sends items explicitly, works for guests too
        await Api.createDirectOrder(this.items, method, contactInfo, affRef || null);
      }
      if (affRef) sessionStorage.removeItem('pm_aff_ref');
    } catch (e) {
      console.warn('Order save error:', e.message);
      // Still let WhatsApp/email open even if backend save failed
    }

    if (method === 'whatsapp') window.open('https://wa.me/' + CFG.waNumber + '?text=' + encodeURIComponent(raw), '_blank');
    else if (method === 'email') window.open('mailto:' + CFG.email + '?subject=' + encodeURIComponent('Pa_mSikA Order ' + this.ordId) + '&body=' + encodeURIComponent(raw), '_blank');
    else window.open(CFG.fbLink, '_blank');

    Modal.close('order-modal');
    if (this._fromCart && Auth.user) { await Cart.clear(); Cart._render(); }
    Toast.show('Order sent! \u{1F389}', "We'll confirm shortly.", 'success', '\u2705', 5000);
  }
};

/* ── LIGHTBOX ──────────────────────────────────────────────── */
const LB = {
  imgs: [], idx: 0, _sx: 0, _sy: 0,
  open(imgs, startIdx = 0) {
    this.imgs = imgs; this.idx = startIdx;
    let lb = document.getElementById('pm-lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'pm-lightbox';
      lb.innerHTML = '<div id="lb-overlay"></div><button id="lb-close" onclick="LB.close()">✕</button><button id="lb-prev" onclick="LB.go(-1)">‹</button><button id="lb-next" onclick="LB.go(1)">›</button><div id="lb-img-wrap"><img id="lb-img" alt="Product"></div><div id="lb-dots"></div><div id="lb-counter"></div>';
      document.body.appendChild(lb);
      const w = lb.querySelector('#lb-img-wrap');
      w.addEventListener('touchstart', e => { this._sx = e.touches[0].clientX; this._sy = e.touches[0].clientY; }, { passive: true });
      w.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - this._sx; const dy = e.changedTouches[0].clientY - this._sy; if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) this.go(dx < 0 ? 1 : -1); }, { passive: true });
      lb.querySelector('#lb-overlay').addEventListener('click', () => this.close());
    }
    lb.classList.add('open'); document.body.classList.add('modal-open'); this._upd();
  },
  go(dir) { this.idx = (this.idx + dir + this.imgs.length) % this.imgs.length; this._upd(); },
  _upd() {
    const img = document.getElementById('lb-img'); const dots = document.getElementById('lb-dots'); const ctr = document.getElementById('lb-counter');
    if (img) { img.style.opacity = '0'; img.src = this.imgs[this.idx]; img.onload = () => { img.style.transition = 'opacity .22s'; img.style.opacity = '1'; }; }
    if (dots) dots.innerHTML = this.imgs.map((_, i) => '<span class="lb-dot' + (i === this.idx ? ' active' : '') + '" onclick="LB.go(' + (i - this.idx) + ')"></span>').join('');
    if (ctr) ctr.textContent = (this.idx + 1) + ' / ' + this.imgs.length;
    const prev = document.getElementById('lb-prev'); const next = document.getElementById('lb-next');
    if (prev) prev.style.display = this.imgs.length > 1 ? 'flex' : 'none';
    if (next) next.style.display = this.imgs.length > 1 ? 'flex' : 'none';
  },
  close() { const lb = document.getElementById('pm-lightbox'); if (lb) lb.classList.remove('open'); if (!document.querySelector('.modal-backdrop.open')) document.body.classList.remove('modal-open'); }
};

/* ── PRODUCTS ─────────────────────────────────────────────── */
const Products = {
  state: { cat: 'All Items', subcat: null, search: '', sort: 'newest', page: 1, perPage: 12 },
  _sl: {}, _lastQ: '', _locFilter: null, _priceMin: null, _priceMax: null,
  _data: [], _total: 0, _loading: false, _hotProducts: [],

  _mapSort(sort) {
    const map = { featured: 'newest', 'price-asc': 'price_asc', 'price-desc': 'price_desc', views: 'views', hot: 'newest', new: 'newest' };
    return map[sort] || 'newest';
  },

  renderRecentlyViewed() {
    const el = document.getElementById('recently-viewed-section');
    if (el) el.innerHTML = RecentlyViewed.render();
  },
  async load() {
    if (this._loading) return;
    this._loading = true;
    this._showSkeleton();
    try {
      const params = {
        page: this.state.page,
        per_page: this.state.perPage,
        sort: this._mapSort(this.state.sort)
      };
      if (this.state.cat !== 'All Items') params.category = this.state.cat;
      if (this.state.subcat) params.subcategory = this.state.subcat;
      if (this._locFilter) params.location = this._locFilter;
      if (this._priceMin != null) params.min_price = this._priceMin;
      if (this._priceMax != null) params.max_price = this._priceMax;
      if (this.state.search) { params.search = this.state.search; this._lastQ = this.state.search.toLowerCase(); }
      else { this._lastQ = ''; }

      // For hot/new filters — apply client-side badge filter after fetch
      const data = await Api.products(params);
      let items = data.items || [];

      if (this.state.sort === 'hot') items = [...items.filter(p => p.badge === 'HOT'), ...items.filter(p => p.badge !== 'HOT')];
      else if (this.state.sort === 'new') items = [...items.filter(p => p.badge === 'NEW'), ...items.filter(p => p.badge !== 'NEW')];
      else if (this.state.sort === 'newest' && this.state.cat === 'All Items' && !this.state.search) {
        // Shuffle within each category so every refresh shows a different mix
        const groups = {};
        items.forEach(p => { const c = p.category || 'Other'; (groups[c] = groups[c] || []).push(p); });
        Object.values(groups).forEach(g => { for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; } });
        const cats = Object.keys(groups).sort();
        items = [];
        const maxLen = cats.length ? Math.max(...cats.map(c => groups[c].length)) : 0;
        for (let i = 0; i < maxLen; i++) cats.forEach(c => { if (groups[c][i]) items.push(groups[c][i]); });
      }

      this._data = items;
      this._total = data.total || items.length;
      PriceAlerts.check(items);
      this.render();
      this.renderRecentlyViewed();
    } catch (e) {
      const grid = document.getElementById('products-grid');
      if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Could not load products</h3><p>' + U.esc(e.message) + '</p><button class="btn btn-outline btn-sm" style="margin-top:14px" onclick="Products.load()">Retry</button></div>';
      const cnt = document.getElementById('result-count');
      if (cnt) cnt.textContent = 'Error';
    } finally {
      this._loading = false;
    }
  },

  async loadHot() {
    try {
      this._hotProducts = await Api.hotProducts();
      UI.renderHotStrip();
    } catch {}
  },

  _showSkeleton() {
    const grid = document.getElementById('products-grid');
    if (grid) grid.innerHTML = Array(4).fill(`
      <div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line w-60"></div>
          <div class="skeleton skeleton-line w-40"></div>
        </div>
      </div>`).join('');
  },

  _hl(text) {
    if (!this._lastQ) return U.esc(text);
    const q = this._lastQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return U.esc(text).replace(new RegExp('(' + q + ')', 'gi'), '<mark>$1</mark>');
  },

  render() {
    const grid = document.getElementById('products-grid');
    const cnt = document.getElementById('result-count');
    if (!grid) return;
    if (cnt) cnt.textContent = this._total + ' ITEM' + (this._total !== 1 ? 'S' : '');
    if (!this._data.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Nothing found</h3><p>Try different keywords or reset filters</p><button class="btn btn-outline btn-sm" style="margin-top:14px" onclick="Products.resetFilters()">Reset</button></div>';
      document.getElementById('pagination').innerHTML = ''; return;
    }
    grid.innerHTML = this._data.map((p, i) => this._card(p, i * 40)).join('');
    this._pag();
  },

  _card(p, delay = 0) {
    const fav = Favs.has(p.id);
    const namHL = this._hl(p.name);
    const imgs = p.images || [];
    const imgsSafe = imgs.length ? imgs : ['https://placehold.co/800x800/161616/c8a84b?text=Pa_mSikA'];
    const imgsSafeProxied = imgsSafe.map(imgProxy);
    const slides = imgsSafeProxied.map((img, i) => `
      <div class="card-slide">
        <img src="${img}" alt="${U.esc(p.name)}" loading="${i === 0 ? 'eager' : 'lazy'}"
          onclick="Products.openDetail('${p.id}')"
          style="cursor:pointer;"
          onerror="this.src='https://placehold.co/800x800/161616/c8a84b?text=Pa_mSikA'">
      </div>`).join('');
    const dots = imgsSafeProxied.length > 1 ? imgsSafeProxied.map((_, i) => `<span class="card-dot${i === 0 ? ' active' : ''}" onclick="Products.goSlide('${p.id}',${i},event)"></span>`).join('') : '';
    const comm = U.fmt(Math.round(p.price * (p.commission_percent || 5) / 100));

    return `
    <div class="product-card" id="card-${p.id}" style="animation-delay:${delay}ms">
      <div class="card-media" id="media-${p.id}">
        <div class="card-slider" id="slider-${p.id}">${slides}</div>
        ${imgsSafeProxied.length > 1 ? `
          <button class="card-nav prev" onclick="Products.slide('${p.id}',-1,event)">‹</button>
          <button class="card-nav next" onclick="Products.slide('${p.id}',1,event)">›</button>
          <div class="card-dots">${dots}</div>` : ''}
        ${p.badge ? `<span class="card-badge badge-${p.badge.toLowerCase()}">${p.badge}</span>` : ''}
        <button class="card-fav${fav ? ' faved' : ''}" onclick="Products.toggleFav('${p.id}',event)">${fav ? '❤️' : '🤍'}</button>
        ${imgsSafeProxied.length > 1 ? `<div class="card-img-count"><span id="imgcnt-${p.id}">⊙ ${imgsSafeProxied.length}</span></div>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${U.esc(p.subcategory || p.category)}</div>
        <div class="card-name">${namHL}</div>
        <div class="card-price">${U.fmt(p.price)}</div>
        <div class="card-meta">
          <span class="card-meta-item">👁 ${U.fmtN(p.views || 0)}</span>
          <span class="card-meta-item">❤️ ${U.fmtN(p.likes || 0)}</span>
          <span class="card-comm">💼 ${comm}</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="card-btn-order" id="obtn-${p.id}" onclick="Products.orderNow('${p.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
          ORDER
        </button>
        <button class="card-btn-cart" id="cbtn-${p.id}" onclick="Products.addToCart('${p.id}')" title="Add to cart">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        </button>
      </div>
      <div class="card-utils">
        <button class="card-util-btn" onclick="Products.openDetail('${p.id}')">👁 View</button>
        <button class="card-util-btn" onclick="Products.copyInfo('${p.id}')">📋 Copy</button>
        <button class="card-util-btn" onclick="Products.downloadCardImg('${p.id}')">⬇️ Download</button>
      </div>
    </div>`;
  },

  _pag() {
    const pg = document.getElementById('pagination'); if (!pg) return;
    const pages = Math.ceil(this._total / this.state.perPage);
    if (pages <= 1) { pg.innerHTML = ''; return; }
    let h = '<button class="page-btn" onclick="Products.goPage(' + Math.max(1, this.state.page - 1) + ')">‹</button>';
    for (let i = 1; i <= pages; i++) h += '<button class="page-btn' + (i === this.state.page ? ' active' : '') + '" onclick="Products.goPage(' + i + ')">' + i + '</button>';
    h += '<button class="page-btn" onclick="Products.goPage(' + Math.min(pages, this.state.page + 1) + ')">›</button>';
    pg.innerHTML = h;
  },

  goPage(n) { this.state.page = n; this.load(); const s = document.getElementById('products-section'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); },

  slide(id, dir, e) {
    e && e.stopPropagation();
    const card = document.getElementById('card-' + id); if (!card) return;
    const sl = document.getElementById('slider-' + id); if (!sl) return;
    const slides = sl.querySelectorAll('.card-slide');
    if (slides.length < 2) return;
    let i = ((this._sl[id] || 0) + dir + slides.length) % slides.length;
    this._sl[id] = i; sl.style.transform = 'translateX(-' + i * 100 + '%)';
    card.querySelectorAll('.card-dot').forEach((d, j) => d.classList.toggle('active', j === i));
  },

  goSlide(id, idx, e) {
    e && e.stopPropagation();
    const sl = document.getElementById('slider-' + id); if (!sl) return;
    this._sl[id] = idx; sl.style.transform = 'translateX(-' + idx * 100 + '%)';
    const card = document.getElementById('card-' + id);
    if (card) card.querySelectorAll('.card-dot').forEach((d, j) => d.classList.toggle('active', j === idx));
  },

  async addToCart(id) {
    const p = this._data.find(x => String(x.id) === String(id));
    if (!p) return;
    RecentlyViewed.add(p);
    await Cart.add(p);
    const btn = document.getElementById('cbtn-' + id);
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '✓'; btn.style.background = 'var(--green)'; setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1400); }
  },

  orderNow(id) {
    const p = this._data.find(x => String(x.id) === String(id)); if (!p) return;
    const btn = document.getElementById('obtn-' + id);
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '⏳ Loading…'; btn.style.opacity = '.7'; setTimeout(() => { btn.innerHTML = orig; btn.style.opacity = ''; }, 1000); }
    OrderModal.open([{ id: String(p.id), name: p.name, price: p.price, image: (p.images || [])[0] || '', location: p.location || '', qty: 1 }]);
  },

  // Used by product detail modal — uses cached _mP so it works for API-fetched products too
  orderNowModal() {
    const p = this._mP; if (!p) return;
    // Use original images from _data if available (avoids proxied URLs in order payload)
    const orig = this._data.find(x => String(x.id) === String(p.id));
    const img = (orig ? orig.images : p.images || [])[0] || '';
    OrderModal.open([{ id: String(p.id), name: p.name, price: p.price, image: img, location: p.location || '', qty: 1 }]);
  },

  // Safe "Add to Cart" from the product detail modal — uses _mP.id explicitly
  async addToCartFromModal() {
    const p = this._mP;
    if (!p || !p.id) { Toast.show('Error', 'Product not loaded', 'error', '⚠️'); return; }
    // Build a minimal product object with the original (non-proxied) id
    const orig = this._data.find(x => String(x.id) === String(p.id)) || p;
    await Cart.add({ id: String(orig.id), name: orig.name, price: orig.price });
    Modal.close('prod-modal');
  },

  async toggleFav(id, e) {
    e && e.stopPropagation();
    const now = await Favs.toggle(id);
    const btn = document.querySelector('#card-' + id + ' .card-fav');
    if (btn) { btn.textContent = now ? '❤️' : '🤍'; btn.classList.toggle('faved', now); }
    if (Views.current === 'favorites') Views.renderFavs();
  },

  async openDetail(idOrProduct) {
    // Accept either a product ID string or a product object directly
    let p = (idOrProduct && typeof idOrProduct === 'object')
      ? idOrProduct
      : this._data.find(x => String(x.id) === String(idOrProduct));
    // If not in current page data, fetch from API
    if (!p && typeof idOrProduct === 'string') {
      try { p = await Api.product(idOrProduct); } catch {}
    }
    if (!p) return;
    // Also add to _data cache if not already there so copyInfo etc work
    if (!this._data.find(x => String(x.id) === String(p.id))) {
      this._data.push(p);
    }
    const bd = document.getElementById('prod-modal-body'); if (!bd) return;
    const imgs = p.images && p.images.length ? p.images : ['https://placehold.co/800x800/161616/c8a84b?text=Pa_mSikA'];
    const imgsProxied = imgs.map(imgProxy);
    const comm = U.fmtFull(Math.round(p.price * (p.commission_percent || 5) / 100));
    const affLink = Aff.refLinkSync(p.id);

    bd.innerHTML = `
      <div class="prod-slider-wrap" id="prod-zoom-wrap" style="position:relative;">
        <div class="prod-modal-slider" id="pms">
          ${imgsProxied.map((img, i) => `<div class="prod-modal-slide">
            <img src="${img}" alt="${U.esc(p.name)}" id="pms-img-${i}"
              style="cursor:zoom-in;transition:transform .3s;transform-origin:center;"
              onclick="LB.open(${JSON.stringify(imgsProxied)},${i})"
              onerror="this.src='https://placehold.co/800x800/161616/c8a84b?text=Pa_mSikA'">
          </div>`).join('')}
        </div>
        ${imgsProxied.length > 1 ? `<button class="prod-modal-nav prev" onclick="Products._ms(null,-1)">‹</button><button class="prod-modal-nav next" onclick="Products._ms(null,1)">›</button>` : ''}
        <div style="position:absolute;bottom:8px;right:8px;display:flex;gap:6px;z-index:5;">
          <button class="aff-copy-btn" style="font-size:.75rem;padding:5px 9px;" title="Zoom In" onclick="Products._zoomBtn(1)">🔍+</button>
          <button class="aff-copy-btn" style="font-size:.75rem;padding:5px 9px;" title="Zoom Out" onclick="Products._zoomBtn(-1)">🔍−</button>
          <button class="aff-copy-btn" style="font-size:.75rem;padding:5px 9px;" title="Download image" onclick="Products._downloadImg()">⬇️</button>
          <button class="aff-copy-btn" style="font-size:.75rem;padding:5px 9px;" title="Open fullscreen" onclick="LB.open(${JSON.stringify(imgsProxied)},Products._mI||0)">⛶</button>
        </div>
      </div>
      ${imgsProxied.length > 1 ? `<div class="prod-modal-dots">${imgsProxied.map((_, i) => `<span class="prod-modal-dot${i === 0 ? ' active' : ''}" onclick="Products._ms(${i})"></span>`).join('')}</div>` : ''}
      <h2 style="font-family:var(--font-display);font-size:1.45rem;margin-bottom:4px;">${U.esc(p.name)}</h2>
      <div style="font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px;">${U.esc(p.category)}${p.subcategory ? ' › '+U.esc(p.subcategory) : ''} · <span style="color:var(--gold);">${String(p.id).substring(0, 8).toUpperCase()}</span></div>
      <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;color:var(--gold);margin-bottom:14px;">${U.fmtFull(p.price)}</div>
      <div class="prod-detail-grid">
        <div class="prod-detail-box"><div class="prod-detail-lbl">Location</div><div class="prod-detail-val">📍 ${U.esc(p.location || 'N/A')}</div></div>
        <div class="prod-detail-box"><div class="prod-detail-lbl">Commission</div><div class="prod-detail-val" style="color:var(--teal);">💼 ${p.commission_percent || 5}% = ${comm}</div></div>
      </div>
      <p class="prod-desc">${U.esc(p.description)}</p>
      <!-- Delivery Zone Info -->
      ${(()=>{ const d=getDeliveryInfo(p.location); return `<div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:12px;display:flex;gap:18px;font-size:.76rem;">
        <span>🚚 <strong>Delivery:</strong> ${d.days} days</span>
        <span>💵 <strong>Fee:</strong> ${U.fmt(d.fee)}</span>
      </div>`; })()}
      <!-- Price Alert Button -->
      <div style="margin-bottom:12px;">
        <button class="btn btn-ghost btn-sm" onclick="PriceAlerts.has('${p.id}') ? (PriceAlerts.remove('${p.id}'),Toast.show('Alert removed','','info','🔕')) : PriceAlerts.add(p)" style="font-size:.74rem;">
          ${PriceAlerts.has(p.id) ? '🔕 Remove Price Alert' : '🔔 Alert me if price drops'}
        </button>
      </div>
      <div class="prod-modal-actions">
        <button class="btn btn-gold" onclick="Products.addToCartFromModal()">🛒 Add to Cart</button>
        <button class="btn" style="background:#25D366;color:#000;font-weight:700;" onclick="Products.orderNowModal();Modal.close('prod-modal')">⚡ Order Now</button>
        <button class="btn btn-ghost btn-sm" onclick="Products.toggleFav('${p.id}')">❤️</button>
        <button class="btn btn-ghost btn-sm" onclick="Products.copyInfo('${p.id}')">📋 Copy</button>
        <button class="btn btn-ghost btn-sm" onclick="Products._downloadImg()" title="Download product image">⬇️ Download</button>
      </div>
      <!-- Reviews Section -->
      <div id="prod-reviews-${p.id}" style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;">
        <div style="font-family:var(--font-display);font-size:.9rem;margin-bottom:10px;">⭐ Reviews</div>
        <div id="reviews-loading-${p.id}" style="font-size:.76rem;color:var(--text-3);">Loading reviews…</div>
      </div>
      ${Aff.data ? `
        <div style="margin-top:14px;background:var(--gold-dim);border:1px solid var(--border-2);border-radius:var(--radius-sm);padding:12px;">
          <div style="font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:5px;">💼 Your Affiliate Link — ${p.commission_percent || 5}% commission = ${comm} per sale</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <code style="flex:1;font-size:.68rem;color:var(--text-3);word-break:break-all;">${affLink}</code>
            <button class="aff-copy-btn" onclick="U.copy('${affLink}').then(()=>Toast.show('Referral link copied!','Share on WhatsApp, Facebook, TikTok','success','🔗'))">Copy</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="aff-copy-btn" style="font-size:.68rem;" onclick="Products._downloadImg()">⬇️ Download Image</button>
            <button class="aff-copy-btn" style="font-size:.68rem;" onclick="U.copy(U.copyText(Products._mP, Aff.data?.affiliate_id)).then(()=>Toast.show('Post copied!','Paste on WhatsApp/Facebook','success','📋'))">📋 Copy Post Text</button>
          </div>
        </div>` : ''}`;
    document.getElementById('prod-modal-title').textContent = U.trunc(p.name, 40);
    this._mP = { ...p, images: imgsProxied }; this._mI = 0; this._zoomLevel = 1;
    Modal.open('prod-modal');
    // Load reviews async
    Api.getReviews(String(p.id)).then(data => {
      const el = document.getElementById('reviews-loading-' + p.id);
      if (!el) return;
      if (!data.reviews.length) { el.innerHTML = '<span style="font-size:.74rem;color:var(--text-3);">No reviews yet. Buy this product to leave a review.</span>'; return; }
      const stars = n => '⭐'.repeat(n) + '☆'.repeat(5-n);
      el.innerHTML = `<div style="font-size:.78rem;color:var(--gold);margin-bottom:8px;">${stars(Math.round(data.average))} ${data.average}/5 (${data.count} review${data.count!==1?'s':''})</div>`
        + data.reviews.map(r => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text-3);">${stars(r.rating)}<span>${r.reviewer}</span></div>
          ${r.comment ? `<div style="font-size:.75rem;margin-top:4px;">${U.esc(r.comment)}</div>` : ''}
        </div>`).join('')
        + (Auth.user ? `<div style="margin-top:10px;"><div style="font-size:.74rem;color:var(--text-3);margin-bottom:6px;">Leave a review:</div>
          <div style="display:flex;gap:6px;margin-bottom:6px;">${[1,2,3,4,5].map(n=>`<button onclick="this.dataset.sel='1';document.getElementById('rev-rating-${p.id}').value=${n};document.querySelectorAll('.rev-star-${p.id}').forEach((b,i)=>b.style.opacity=i<${n}?'1':'.3')" class="rev-star-${p.id}" style="font-size:1.2rem;background:none;border:none;cursor:pointer;opacity:.3;">⭐</button>`).join('')}</div>
          <input type="hidden" id="rev-rating-${p.id}" value="0">
          <input id="rev-comment-${p.id}" placeholder="Comment (optional)" style="width:100%;font-size:.76rem;margin-bottom:6px;box-sizing:border-box;">
          <button class="btn btn-gold btn-sm" onclick="Products._submitReview('${p.id}')">Submit Review</button>
        </div>` : '');
    }).catch(() => { const el = document.getElementById('reviews-loading-' + p.id); if (el) el.innerHTML = ''; });
  },

  _zoomLevel: 1,
  _setZoom(level, imgIdx) {
    this._zoomLevel = level;
    const img = document.getElementById('pms-img-' + (imgIdx !== undefined ? imgIdx : this._mI || 0));
    const wrap = document.getElementById('prod-zoom-wrap');
    if (img) {
      img.style.transform = `scale(${level})`;
      img.style.cursor = level > 1 ? 'zoom-out' : 'zoom-in';
    }
    if (wrap) wrap.classList.toggle('zoomed', level > 1);
  },
  _toggleZoom(imgIdx) {
    this._setZoom(this._zoomLevel === 1 ? 2.2 : 1, imgIdx);
  },
  _zoomBtn(dir) {
    this._setZoom(Math.min(3, Math.max(1, this._zoomLevel + dir * 0.5)));
  },
  async _submitReview(productId) {
    const rating = parseInt(document.getElementById('rev-rating-' + productId)?.value || '0');
    const comment = document.getElementById('rev-comment-' + productId)?.value.trim() || '';
    if (!rating) return Toast.show('Select a rating', '', 'error', '⭐');
    try {
      await Api.addReview(productId, rating, comment);
      Toast.show('Review submitted!', 'Thank you for your feedback', 'success', '⭐');
      // Reload reviews
      Api.getReviews(productId).then(data => {
        const el = document.getElementById('reviews-loading-' + productId);
        if (el && data.reviews.length) {
          const stars = n => '⭐'.repeat(n) + '☆'.repeat(5-n);
          el.innerHTML = `<div style="font-size:.78rem;color:var(--gold);margin-bottom:8px;">${stars(Math.round(data.average))} ${data.average}/5 (${data.count} reviews)</div>`
            + data.reviews.map(r => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:6px;">
              <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text-3);">${stars(r.rating)}<span>${r.reviewer}</span></div>
              ${r.comment ? `<div style="font-size:.75rem;margin-top:4px;">${U.esc(r.comment)}</div>` : ''}
            </div>`).join('');
        }
      }).catch(() => {});
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _downloadImg() {
    const p = this._mP; if (!p) return;
    const imgs = p.images && p.images.length ? p.images : [];
    const imgUrl = imgs[this._mI || 0] || imgs[0];
    if (!imgUrl) return Toast.show('No image', 'This product has no image', 'info', 'ℹ️');
    // Derive a clean filename from the original product name
    const fname = (p.name || 'product').replace(/[^a-z0-9]/gi, '_') + '.jpg';
    Toast.show('Preparing download…', '', 'info', '⏳', 1800);

    // Images are now routed through our same-origin proxy so canvas always works.
    // Strategy: canvas (best quality) → fetch blob → new tab fallback
    try {
      // 1. Canvas approach — works for same-origin and CORS-enabled URLs
      const canvasResult = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 800;
            canvas.height = img.naturalHeight || img.height || 800;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.toBlob(blob => {
              if (!blob) { resolve(null); return; }
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = fname;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
              resolve(true);
            }, 'image/jpeg', 0.92);
          } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = imgUrl;
      });

      if (canvasResult) {
        Toast.show('Downloaded!', p.name, 'success', '⬇️');
        return;
      }

      // 2. Fetch blob — works for same-origin (proxied) URLs
      try {
        const res = await fetch(imgUrl, { cache: 'force-cache' });
        if (res.ok) {
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
          Toast.show('Downloaded!', p.name, 'success', '⬇️');
          return;
        }
      } catch {}

      // 3. Final fallback — open in new tab
      window.open(imgUrl, '_blank');
      Toast.show('Opening image', 'Long-press or right-click → Save image', 'info', '🖼', 5000);
    } catch {
      window.open(imgUrl, '_blank');
      Toast.show('Opening image', 'Long-press or right-click → Save image', 'info', '🖼', 5000);
    }
  },

  _mP: null, _mI: 0,
  _ms(idx, dir) {
    const p = this._mP; if (!p) return; const sl = document.getElementById('pms'); if (!sl) return;
    let i = idx !== null && idx !== undefined ? idx : this._mI + (dir || 0);
    const count = (p.images || []).length || 1;
    if (i < 0) i = count - 1; if (i >= count) i = 0;
    // Reset zoom on slide change
    if (this._mI !== i) {
      this._setZoom(1, this._mI);
    }
    this._mI = i; sl.style.transform = 'translateX(-' + i * 100 + '%)';
    document.querySelectorAll('.prod-modal-dot').forEach((d, j) => d.classList.toggle('active', j === i));
  },

  copyInfo(id) {
    const p = this._data.find(x => String(x.id) === String(id)); if (!p) return;
    const affId = Aff.data?.affiliate_id || null;
    U.copy(U.copyText(p, affId)).then(() => {
      if (affId) {
        Toast.show('Affiliate post copied! 🔗', 'Your unique referral link is included. Share on WhatsApp & Facebook!', 'success', '📋', 4000);
      } else {
        Toast.show('Copied!', 'Product info copied', 'info', '📋');
      }
    });
  },

  shareProduct(id) {
    const p = this._data.find(x => String(x.id) === String(id)); if (!p) return;
    const url = Aff.refLinkSync(id);
    if (navigator.share) navigator.share({ title: p.name, text: 'Check on Pa_mSikA: ' + p.name, url });
    else U.copy(url).then(() => Toast.show('Link copied!', '', 'info', '📤'));
  },

  async downloadCardImg(id) {
    const p = this._data.find(x => String(x.id) === String(id)); if (!p) return;
    const imgs = p.images && p.images.length ? p.images.map(imgProxy) : [];
    const slideIdx = this._sl[id] || 0;
    const imgUrl = imgs[slideIdx] || imgs[0];
    if (!imgUrl) return Toast.show('No image', '', 'info', 'ℹ️');
    const fname = (p.name || 'product').replace(/[^a-z0-9]/gi, '_') + '.jpg';
    Toast.show('Downloading…', p.name, 'info', '⏳', 1800);
    try {
      const res = await fetch(imgUrl, { cache: 'force-cache' });
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        Toast.show('Downloaded!', p.name, 'success', '⬇️'); return;
      }
    } catch {}
    window.open(imgUrl, '_blank');
    Toast.show('Opening image', 'Long-press → Save image', 'info', '🖼', 4000);
  },

  resetFilters() {
    this.state = { cat: 'All Items', subcat: null, search: '', sort: 'newest', page: 1, perPage: 12 };
    this._locFilter = null; this._priceMin = null; this._priceMax = null;
    const ss = document.getElementById('sort-select'); if (ss) ss.value = 'featured';
    const ni = document.getElementById('nav-search-inp'); if (ni) ni.value = '';
    const fl = document.getElementById('filter-location'); if (fl) fl.value = '';
    const fn = document.getElementById('filter-min'); if (fn) fn.value = '';
    const fx = document.getElementById('filter-max'); if (fx) fx.value = '';
    UI.renderSidebar(); this.load();
  },

  setCat(cat, subcat = null) {
    this.state.cat = cat; this.state.subcat = subcat; this.state.page = 1;
    this.load(); Views.show('home');
    if (window.innerWidth < 1100) UI.closeSidebar();
  }
};

/* ── VIEWS ────────────────────────────────────────────────── */
const Views = {
  current: 'home',

  show(v) {
    // Stop polling when leaving community/messages
    if (this.current === 'community' && v !== 'community') Community.stopPolling();
    if (this.current === 'messages' && v !== 'messages') { Messages.stopPolling(); Messages._clearThread(); document.body.classList.remove('chat-open'); }
    this.current = v;
    ['home', 'favorites', 'affiliate', 'account', 'community', 'messages'].forEach(x => {
      const el = document.getElementById('view-' + x);
      if (el) el.style.display = x === v ? 'block' : 'none';
    });
    const hero = document.getElementById('hero');
    const hot = document.getElementById('hot-strip');
    const wa = document.getElementById('wa-banner');
    if (hero) hero.style.display = v === 'home' ? 'block' : 'none';
    if (hot) hot.style.display = v === 'home' ? 'flex' : 'none';
    if (wa) wa.style.display = v === 'home' ? 'flex' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (v === 'favorites') this.renderFavs();
    if (v === 'affiliate') this.renderAffiliate();
    if (v === 'account') this.renderAccount();
    if (v === 'community') {
      Community.load(); Community.startPolling();
      const composer = document.getElementById('admin-post-composer');
      if (composer) composer.style.display = Auth.user?.is_admin ? 'block' : 'none';
    }
    if (v === 'messages') { Messages.load(); Messages.startPolling(); }
  },

  async renderFavs() {
    const grid = document.getElementById('favs-grid'); if (!grid) return;
    grid.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-3);">Loading…</div>';
    if (!Auth.user) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">❤️</div><h3>Sign in to see favourites</h3><button class="btn btn-gold btn-sm" style="margin-top:12px" onclick="UI.openAuth(\'login\')">Sign In</button></div>';
      return;
    }
    try {
      await Favs.load();
      if (!Favs.ids.length) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">❤️</div><h3>No favourites</h3><p>Tap ❤️ on any product</p><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="Views.show(\'home\')">Browse</button></div>';
        return;
      }
      // Load products matching favorite ids
      const promises = Favs.ids.slice(0, 20).map(id => Api.product(id).catch(() => null));
      const favProds = (await Promise.all(promises)).filter(Boolean);
      // Temporarily inject into Products data for card rendering
      const prevData = Products._data;
      Products._data = favProds;
      grid.innerHTML = favProds.map(p => Products._card(p)).join('');
      Products._data = prevData;
    } catch (e) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading</h3><p>' + U.esc(e.message) + '</p></div>';
    }
  },

  async renderAffiliate() {
    const body = document.getElementById('aff-view-body'); if (!body) return;
    if (!Auth.user) {
      body.innerHTML = `<div style="text-align:center;padding:48px 20px;">
        <div style="font-size:2.8rem;margin-bottom:14px;">💼</div>
        <h3 style="font-family:var(--font-display);font-size:1.4rem;margin-bottom:8px;">Sign in to join Dolo Programme</h3>
        <p style="font-size:.82rem;color:var(--text-3);margin-bottom:18px;">Earn 5% commission on every sale</p>
        <button class="btn btn-gold" onclick="UI.openAuth('login')">Sign In / Register</button>
      </div>`;
      return;
    }
    await Aff.load();
    if (!Aff.data) {
      body.innerHTML = `
        <div class="aff-join-wrap">
          <div class="aff-join-icon">💼</div>
          <h3>Become a Dolo Pa_mSikA</h3>
          <p>Earn <strong>5% commission</strong> on every sale you refer through your unique links. Free to join!</p>
          <button class="btn btn-gold btn-lg" onclick="Views._doAffJoin()">🚀 Join as Dolo Pa_mSikA</button>
          <p style="font-size:.72rem;color:var(--text-3);margin-top:10px;">Free · Instant links · 5% per sale</p>
        </div>`;
      return;
    }
    this._renderAffDash();
  },

  async _doAffJoin() {
    const res = await Aff.join();
    if (res.err) { Toast.show('Error', res.err, 'error', '⚠️'); return; }
    Toast.show('Welcome, Dolo! 🎉', 'Your affiliate account is live!', 'success', '💼', 5000);
    this._renderAffDash();
  },

  async _renderAffDash() {
    const body = document.getElementById('aff-view-body'); if (!body || !Aff.data) return;
    const d = Aff.data;
    // Use recommended_products from dashboard API (category-based on click history, or highest commission)
    const hotProds = (d.recommended_products || []).slice(0, 6);

    let wds = [];
    try { wds = await Api.myWithdrawals().then(r => r.slice(0, 5)); } catch {}

    body.innerHTML = `
      <div class="aff-header-card">
        <div class="aff-header-left">
          <div class="aff-avatar">${Auth.user.email[0].toUpperCase()}</div>
          <div>
            <div class="aff-header-id">${d.affiliate_id}</div>
            <div class="aff-header-email">${U.esc(Auth.user.email)}</div>
            <div class="aff-header-since">Dolo Programme Member</div>
          </div>
        </div>
        <div class="aff-header-balance">
          <div class="aff-balance-label">Available Balance</div>
          <div class="aff-balance-num">${U.fmtFull(Math.round((d.commission_balance || 0) * 100) / 100)}</div>
          <button class="btn btn-gold btn-sm" onclick="Views._openWithdraw()" style="margin-top:8px;">💸 Withdraw Funds</button>
        </div>
      </div>

      <div class="aff-stats-grid">
        <div class="aff-stat-box"><div class="aff-stat-num">${d.clicks || 0}</div><div class="aff-stat-lbl">Link Clicks</div></div>
        <div class="aff-stat-box"><div class="aff-stat-num">${d.sales || 0}</div><div class="aff-stat-lbl">Sales Made</div></div>
        <div class="aff-stat-box"><div class="aff-stat-num">${U.fmtN(Math.round((d.commission_balance || 0) * 100) / 100)}</div><div class="aff-stat-lbl">Balance MWK</div></div>
        <div class="aff-stat-box"><div class="aff-stat-num">${U.fmtN(d.total_earned != null ? d.total_earned : (d.commission_balance || 0))}</div><div class="aff-stat-lbl">Total Earned MWK</div></div>
      </div>

      ${d.personal_referral_link ? `
      <div class="aff-section" style="margin-bottom:14px;">
        <div class="aff-section-head"><h3>👥 Invite Other Affiliates — Earn 5% of Their Commissions</h3></div>
        <p style="font-size:.78rem;color:var(--text-2);margin-bottom:10px;">Share this link with others. When they join and earn commissions, you automatically receive <strong style="color:var(--gold);">5%</strong> of their earnings — forever!</p>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-card-2);border-radius:var(--radius-sm);padding:10px;border:1px solid var(--gold-dim);">
          <code style="flex:1;font-size:.68rem;color:var(--teal);word-break:break-all;">${d.personal_referral_link}</code>
          <button class="aff-copy-btn" onclick="U.copy('${d.personal_referral_link}').then(()=>Toast.show('Invite link copied!','Share on WhatsApp, Facebook, TikTok to recruit affiliates','success','👥'))">📋 Copy</button>
        </div>
        <div style="display:flex;align-items:center;gap:16px;margin-top:10px;padding:10px;background:var(--bg-card-2);border-radius:var(--radius-sm);">
          <div style="text-align:center;flex:1;">
            <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--gold);">${d.invited_affiliates_count || 0}</div>
            <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;">Affiliates Invited</div>
            ${(d.sub_affiliate_earned > 0) ? `<div style="font-size:.62rem;color:var(--teal);margin-top:3px;">+${U.fmtN(d.sub_affiliate_earned)} MWK earned</div>` : ''}
          </div>
          <div style="flex:2;font-size:.72rem;color:var(--text-3);line-height:1.5;">When they earn, 5% of their commission is automatically added to your balance — no extra work needed.</div>
        </div>
      </div>` : ''}

      <div class="aff-section">
        <div class="aff-section-head"><h3>🎯 Recommended for You — Referral Links</h3><span style="font-size:.68rem;color:var(--text-3);">Based on your top categories &amp; highest commissions</span></div>
        <div class="aff-links-list">
          ${hotProds.map(p => `
            <div class="aff-link-row">
              <img src="${imgProxy((p.images || [])[0] || '')}" class="aff-link-img" alt="${U.esc(p.name)}" onerror="this.src='https://placehold.co/42x42/161616/c8a84b?text=P'">
              <div class="aff-link-info">
                <div class="aff-link-name">${U.esc(U.trunc(p.name, 28))}</div>
                <div class="aff-link-price">${U.fmt(p.price)} · <span style="color:var(--teal);">Earn ${U.fmt(Math.round(p.price * 0.05))}</span></div>
                <div class="aff-link-url">${Aff.refLinkSync(p.id)}</div>
              </div>
              <button class="aff-copy-btn" onclick="U.copy('${Aff.refLinkSync(p.id)}').then(()=>Toast.show('Copied!','','info','🔗'))">Copy</button>
            </div>`).join('')}
        </div>
      </div>

      <div class="aff-section">
        <div class="aff-section-head"><h3>📦 Sales History</h3></div>
        ${d.sales_history && d.sales_history.length ? `
          <div style="overflow-x:auto;">
            <table class="aff-table">
              <thead><tr><th>Order Ref</th><th>Product</th><th>Qty</th><th>Commission</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                ${d.sales_history.map(s => `<tr>
                  <td style="font-family:monospace;color:var(--gold);font-size:.66rem;">${String(s.order_id).substring(0,8).toUpperCase()}</td>
                  <td style="font-size:.74rem;">${U.esc(U.trunc(s.product_name || '', 24))}</td>
                  <td>${s.quantity}</td>
                  <td style="color:var(--teal);font-weight:600;">${U.fmt(s.commission)}</td>
                  <td style="font-size:.68rem;color:var(--text-3);">${new Date(s.created_at).toLocaleDateString()}</td>
                  <td><span class="wd-status wd-${s.order_status}">${s.order_status}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` :
          '<p style="font-size:.8rem;color:var(--text-3);padding:10px 0;">No sales yet. Share your referral links to start earning!</p>'}
      </div>

      <div class="aff-section">
        <h3 style="margin-bottom:12px;">💸 Withdrawal History</h3>
        ${wds.length ? `
          <div style="overflow-x:auto;">
            <table class="aff-table">
              <thead><tr><th>ID</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                ${wds.map(w => `<tr>
                  <td style="font-family:monospace;color:var(--gold);font-size:.66rem;">${String(w.id).substring(0, 8)}</td>
                  <td style="color:var(--teal);">${U.fmt(w.amount)}</td>
                  <td style="font-size:.75rem;">${U.esc(w.method || '')}</td>
                  <td style="font-size:.68rem;color:var(--text-3);">${new Date(w.created_at).toLocaleDateString()}</td>
                  <td><span class="wd-status wd-${w.status}">${w.status}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` :
          '<p style="font-size:.8rem;color:var(--text-3);">No withdrawals yet.</p>'}
      </div>

      <div class="aff-how">
        <strong style="color:var(--gold);">How Dolos Earn:</strong> Share referral links on WhatsApp, Facebook, TikTok. When someone buys, you earn <strong>5% automatically</strong>. Minimum withdrawal: MWK 2,000. Contact <a href="mailto:${CFG.email}" style="color:var(--gold);">${CFG.email}</a>.
      </div>`;
  },

  _openWithdraw() {
    const b = document.getElementById('withdraw-modal-body'); if (!b) return;
    const balance = Aff.data?.commission_balance || 0;
    b.innerHTML = `
      <div style="background:var(--bg-card-2);border-radius:var(--radius-sm);padding:14px;margin-bottom:18px;text-align:center;">
        <div style="font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:4px;">Available Balance</div>
        <div style="font-family:var(--font-display);font-size:1.5rem;color:var(--gold);font-weight:700;">${U.fmtFull(balance)}</div>
      </div>
      <div class="form-row">
        <div><label class="form-lbl">Amount (MWK) — Min 2,000</label><input id="wd-amount" type="number" placeholder="2000" min="2000" style="margin-top:5px;"></div>
        <div><label class="form-lbl">Withdrawal Method</label>
          <select id="wd-method" style="margin-top:5px;">
            <option value="">Select…</option>
            <option>Airtel Money</option><option>TNM Mpamba</option>
            <option>National Bank</option><option>Standard Bank</option>
            <option>FDH Bank</option><option>NBS Bank</option><option>First Capital Bank</option>
          </select>
        </div>
        <div><label class="form-lbl">Phone / Account Number</label><input id="wd-account" type="text" placeholder="0888 123 456 or account number" style="margin-top:5px;"></div>
        <div><label class="form-lbl">Full Name on Account</label><input id="wd-name" type="text" placeholder="Your full registered name" style="margin-top:5px;"></div>
        <div><label class="form-lbl">Notes (optional)</label><input id="wd-notes" type="text" placeholder="Additional info" style="margin-top:5px;"></div>
      </div>
      <button class="btn btn-gold" style="width:100%;margin-top:16px;" onclick="Views._submitWithdraw()">💸 Submit Request</button>
      <p style="font-size:.7rem;color:var(--text-3);margin-top:9px;text-align:center;">Admin reviews within 48 hours.</p>`;
    Modal.open('withdraw-modal');
  },

  async _submitWithdraw() {
    const amount = parseInt(document.getElementById('wd-amount')?.value || '0');
    const method = document.getElementById('wd-method')?.value || '';
    const account = document.getElementById('wd-account')?.value.trim() || '';
    const name = document.getElementById('wd-name')?.value.trim() || '';
    const notes = document.getElementById('wd-notes')?.value.trim() || '';
    if (!method) return Toast.show('Error', 'Select a withdrawal method', 'error', '⚠️');
    if (!account) return Toast.show('Error', 'Enter your account number', 'error', '⚠️');
    if (!name) return Toast.show('Error', 'Enter account name', 'error', '⚠️');
    if (amount < 2000) return Toast.show('Error', 'Minimum MWK 2,000', 'error', '⚠️');
    try {
      await Api.requestWithdrawal(amount, method, { account, name, notes });
      Toast.show('Request submitted! 💸', 'Admin will review within 48 hours', 'success', '✅', 5000);
      Modal.close('withdraw-modal');
      await Aff.load();
      this._renderAffDash();
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    }
  },

  async renderAccount() {
    const body = document.getElementById('account-view-body'); if (!body) return;
    if (!Auth.user) {
      body.innerHTML = '<div style="text-align:center;padding:48px 20px;"><div style="font-size:2.8rem;margin-bottom:14px;">👤</div><h3 style="font-family:var(--font-display);font-size:1.4rem;margin-bottom:8px;">Sign in to your account</h3><p style="font-size:.82rem;color:var(--text-3);margin-bottom:18px;">Access order history and settings</p><button class="btn btn-gold" onclick="UI.openAuth(\'login\')">Sign In / Register</button></div>';
      return;
    }
    let orders = [];
    try { orders = await Api.myOrders(); } catch {}
    body.innerHTML = `
      <div class="account-card">
        <h3>👤 Profile</h3>
        <div class="acc-row"><div class="acc-lbl">Name</div><div class="acc-val">${U.esc(Auth.user.full_name || '')}</div></div>
        <div class="acc-row"><div class="acc-lbl">Email</div><div class="acc-val">${U.esc(Auth.user.email)}</div></div>
        <div style="margin-top:16px;padding:14px;background:var(--bg-card-2);border:1px solid var(--border);border-radius:var(--radius-sm);">
          <div style="font-size:.76rem;font-weight:600;margin-bottom:8px;">🔔 Push Notifications</div>
          <div style="font-size:.74rem;color:var(--text-3);margin-bottom:10px;">Get notified of new products and order updates</div>
          <button class="btn btn-outline btn-sm" onclick="PushNotif.request()">Enable Notifications</button>
        </div>
        ${Auth.user.is_admin ? `
        <div style="margin-top:14px;padding:12px;background:var(--gold-dim);border:1px solid var(--border-2);border-radius:var(--radius-sm);">
          <div style="font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">⚙️ Administrator</div>
          <button class="btn btn-gold" style="width:100%;" onclick="Admin.open()">🛡 Open Admin Panel</button>
        </div>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="Auth.logout().then(()=>Views.renderAccount())">Sign Out</button>
      </div>
      <div class="account-card">
        <h3>📦 Order History ${orders.length ? '<span style="font-size:.72rem;color:var(--text-3);">(' + orders.length + ')</span>' : ''}</h3>
        ${orders.length ? orders.slice(0, 20).map(o => `
          <div class="order-row">
            <div style="flex:1;min-width:0;">
              <div class="order-id">${String(o.id).substring(0, 8).toUpperCase()}</div>
              <div style="font-size:.68rem;color:var(--text-3);margin-top:2px;">${new Date(o.created_at).toLocaleDateString()} · ${U.esc(o.payment_method)}</div>
              <div style="font-size:.68rem;color:var(--text-3);">${(o.items || []).map(i => U.trunc(i.product_snapshot?.name || 'Item', 18) + '×' + i.quantity).join(', ')}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="color:var(--gold);font-size:.88rem;font-weight:600;">${U.fmt(o.total_amount)}</div>
              <span class="order-status status-${o.status || 'pending'}">${o.status || 'Pending'}</span>
              <div style="display:flex;gap:4px;margin-top:4px;">
                <button onclick="Messages.startFromOrder('${o.id}','${String(o.id).substring(0,8).toUpperCase()}')" style="padding:2px 7px;border-radius:4px;border:1px solid var(--border-2);background:transparent;color:var(--teal);font-size:.6rem;cursor:pointer;">💬 Message</button>
                <button onclick="Views._deleteOrder('${o.id}')" title="Remove from history" style="padding:2px 7px;border-radius:4px;border:1px solid var(--border-2);background:transparent;color:var(--red);font-size:.6rem;cursor:pointer;">🗑 Remove</button>
              </div>
            </div>
          </div>`).join('') : '<p style="font-size:.8rem;color:var(--text-3);padding:14px 0;">No orders yet.</p>'}
        ${orders.length ? `<div style="margin-top:10px;text-align:right;"><button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);font-size:.66rem;" onclick="Views._clearOrders()">🗑 Clear All Order History</button></div>` : ''}
      </div>`;
  },

  async _deleteOrder(orderId) {
    if (!await Confirm.show('This order will be removed from your history.', { title: 'Remove order?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Yes, Remove', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try {
      await Api.deleteOrder(orderId);
      Toast.show('Removed', 'Order removed from history', 'info', '🗑');
      Views.renderAccount();
    } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async _clearOrders() {
    if (!await Confirm.show('All orders will be removed from your history permanently.', { title: 'Clear all orders?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Yes, Clear All', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try {
      await Api.clearMyOrders();
      Toast.show('Cleared', 'Order history cleared', 'info', '🗑');
      Views.renderAccount();
    } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  }
};

/* ── ADMIN ────────────────────────────────────────────────── */
const Admin = {
  KEY: 'pm_admin_auth', _tab: 'overview', _combo: [], _pendingOpen: false,
  isAuth() { return localStorage.getItem(this.KEY) === 'true' && Auth.user?.is_admin; },

  checkCombo(key) {
    this._combo.push(key); if (this._combo.length > CFG.adminCombo.length) this._combo.shift();
    if (this._combo.join('') === CFG.adminCombo.join('')) { this._combo = []; if (Auth.user?.is_admin) { localStorage.setItem(this.KEY, 'true'); this.open(); } else Toast.show('Access denied', 'Admin privileges required', 'error', '🚫'); }
  },

  open() {
    if (!Auth.user) {
      // Not logged in — show login form and remember to open admin after
      this._pendingOpen = true;
      UI.openAuth('login');
      Toast.show('Sign in required', 'Please sign in with your admin account', 'info', '🔐');
      return;
    }
    if (!Auth.user.is_admin) { Toast.show('Access denied', 'Admin privileges required', 'error', '🚫'); return; }
    this._pendingOpen = false;
    localStorage.setItem(this.KEY, 'true');
    this._render(); Modal.open('admin-modal');
  },

  _render() {
    const body = document.getElementById('admin-modal-body'); if (!body) return;
    const tabs = [['overview', '📊 Overview'], ['orders', '📦 Orders'], ['products', '🛍 Products'], ['affiliates', '💼 Affiliates'], ['withdrawals', '💸 Withdrawals'], ['users', '👥 Users'], ['promo', '🎟 Promos'], ['notif', '🔔 Notify'], ['inbox', '💬 Inbox']];
    body.innerHTML = `
      <div class="admin-wrap">
        <div class="admin-sidebar">
          ${tabs.map(([t, lbl]) => `<div class="admin-nav${this._tab === t ? ' active' : ''}" onclick="Admin._setTab('${t}')">${lbl}</div>`).join('')}
          <div style="height:1px;background:var(--border);margin:8px 0;"></div>
          <div class="admin-nav" style="color:var(--red);" onclick="localStorage.removeItem('${this.KEY}');Modal.close('admin-modal');Toast.show('Logged out','','info','🔐')">🚪 Logout</div>
        </div>
        <div class="admin-content" id="admin-content"><div style="padding:20px;color:var(--text-3);">Loading…</div></div>
      </div>`;
    this._renderTab();
  },

  _setTab(tab) {
    this._tab = tab;
    document.querySelectorAll('.admin-nav').forEach(n => { n.classList.toggle('active', n.textContent.toLowerCase().includes(tab.split('s')[0].toLowerCase()) && !n.textContent.includes('Logout')); });
    this._renderTab();
  },

  async _renderTab() {
    const c = document.getElementById('admin-content'); if (!c) return;
    c.innerHTML = '<div style="padding:20px;color:var(--text-3);">Loading…</div>';
    try {
      switch (this._tab) {
        case 'overview': c.innerHTML = await this._overview(); break;
        case 'orders': c.innerHTML = await this._orders(); break;
        case 'products': c.innerHTML = await this._products(); break;
        case 'affiliates': c.innerHTML = await this._affiliates(); break;
        case 'withdrawals': c.innerHTML = await this._withdrawals(); break;
        case 'users': c.innerHTML = await this._users(); break;
        case 'promo': c.innerHTML = await this._promos(); break;
        case 'notif': c.innerHTML = await this._notifPanel(); break;
        case 'inbox': c.innerHTML = await this._inbox(); break;
      }
    } catch (e) {
      c.innerHTML = '<div style="padding:20px;color:var(--red);">Error: ' + U.esc(e.message) + '</div>';
    }
  },

  async _overview() {
    let stats = null;
    let statsErr = null;
    try {
      stats = await Api.adminStats();
    } catch (e) {
      statsErr = e.message || 'Failed to load stats';
    }
    if (statsErr || !stats) {
      return `<div class="admin-head"><h2>Overview</h2><p>Pa_mSikA control panel</p></div>
        <div style="background:var(--bg-card-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:24px;text-align:center;margin-top:12px;">
          <div style="font-size:1.6rem;margin-bottom:8px;">⚠️</div>
          <div style="font-size:.88rem;color:var(--text-2);margin-bottom:6px;">Could not load stats</div>
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:16px;">${U.esc(statsErr || 'Unknown error')}</div>
          <button class="btn btn-gold btn-sm" onclick="Admin._setTab('overview')">🔄 Retry</button>
        </div>`;
    }
    return `<div class="admin-head"><h2>Overview</h2><p>Pa_mSikA control panel</p></div>
      <div class="admin-kpis">
        <div class="admin-kpi"><div class="admin-kpi-icon">📦</div><div class="admin-kpi-num">${stats.total_products ?? '—'}</div><div class="admin-kpi-lbl">Products</div></div>
        <div class="admin-kpi"><div class="admin-kpi-icon">🛒</div><div class="admin-kpi-num">${stats.total_orders ?? '—'}</div><div class="admin-kpi-lbl">Orders</div></div>
        <div class="admin-kpi"><div class="admin-kpi-icon">👤</div><div class="admin-kpi-num">${stats.total_users ?? '—'}</div><div class="admin-kpi-lbl">Users</div></div>
        <div class="admin-kpi"><div class="admin-kpi-icon">💸</div><div class="admin-kpi-num" style="color:${(stats.pending_withdrawals || 0) > 0 ? 'var(--red)' : 'inherit'}">${stats.pending_withdrawals ?? '—'}</div><div class="admin-kpi-lbl">Pending WD</div></div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <button class="aff-copy-btn" style="font-size:.68rem;" onclick="Admin._setTab('overview')">🔄 Refresh</button>
      </div>`;
  },

  async _orders() {
    const orders = await Api.adminOrders({ per_page: 100 }).catch(() => ({ items: [] }));
    const list = orders.items || orders || [];
    if (!list.length) return `<div class="admin-head"><h2>Orders</h2></div><p style="color:var(--text-3);font-size:.82rem;padding:18px 0;">No orders yet.</p>`;
    const pending = list.filter(o => (o.status || 'pending') === 'pending').length;
    return `<div class="admin-head"><h2>Orders</h2><p>${list.length} total · <span style="color:var(--gold);">${pending} pending</span></p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <button class="aff-copy-btn" onclick="Api.exportOrders('csv').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📄 Export CSV</button>
        <button class="aff-copy-btn" onclick="Api.exportOrders('excel').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📊 Export Excel</button>
        <button class="aff-copy-btn" onclick="Api.exportOrders('pdf').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📋 Export PDF</button>
      </div>
    </div>
      <p style="font-size:.68rem;color:var(--text-3);margin-bottom:10px;">💼 <strong>Commission flow:</strong> <span style="color:var(--teal);">✓ Done</span> = marks fulfilled &amp; credits affiliate commission. <span style="color:orange;">✕ Cancel</span> = cancels order &amp; reverses any credited commission. <span style="color:var(--red);">🗑</span> = removes from this panel only.</p>
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);font-size:.66rem;" onclick="Admin._clearAllOrders()">🗑 Clear All Orders</button>
      </div>
      <div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>Ref</th><th>Customer</th><th>Items</th><th>Total</th><th>Method</th><th>Affiliate</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${list.map(o => `<tr>
          <td style="font-family:monospace;color:var(--gold);font-size:.68rem;">${String(o.id).substring(0, 8).toUpperCase()}</td>
          <td style="font-size:.72rem;">${U.esc(o.customer_name || o.contact_info?.name || 'Guest')}${o.customer_email ? `<br><span style="color:var(--text-3);font-size:.62rem;">${U.esc(o.customer_email)}</span>` : ''}</td>
          <td style="font-size:.7rem;">${(o.items || []).map(i => `<a href="/?product=${i.product_id || ''}" target="_blank" style="color:var(--gold);text-decoration:none;" title="View product">${U.trunc(i.product_snapshot?.name || 'Item', 14)}</a>×${i.quantity}`).join(', ')}</td>
          <td style="color:var(--gold);font-weight:600;">${U.fmt(o.total_amount)}</td>
          <td style="font-size:.72rem;">${U.esc(o.payment_method || '')}</td>
          <td style="font-family:monospace;font-size:.65rem;color:var(--teal);">${(o.items || []).map(i => i.affiliate_id).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ') || '—'}</td>
          <td style="font-size:.68rem;color:var(--text-3);">${new Date(o.created_at).toLocaleDateString()}</td>
          <td><span class="wd-status wd-${o.status || 'pending'}">${o.status || 'pending'}</span></td>
          <td><div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${o.status === 'pending' ? `<button class="aff-copy-btn" style="color:var(--teal);border-color:var(--teal);font-size:.72rem;padding:5px 10px;" onclick="Admin._upOrd('${o.id}','completed')">✓ Done</button>` : ''}
            ${o.status !== 'cancelled' && o.status !== 'completed' ? `<button class="aff-copy-btn" style="color:orange;border-color:orange;font-size:.72rem;padding:5px 10px;" onclick="Admin._cancelOrd('${o.id}')">✕ Cancel</button>` : ''}
            <button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);font-size:.72rem;padding:5px 10px;" onclick="Admin._delOrder('${o.id}')">🗑</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  },

  async _products() {
    const data = await Api.products({ per_page: 100 }).catch(() => ({ items: [] }));
    const list = data.items || [];
    return `<div class="admin-head"><h2>Products Manager</h2><p>${list.length} products</p></div>
      <div style="background:var(--bg-card-2);border-radius:var(--radius);padding:14px;margin-bottom:18px;">
        <div style="font-size:.72rem;font-weight:600;color:var(--gold);margin-bottom:10px;">➕ Add New Product</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
          <input id="ap-name" placeholder="Product Name *" style="font-size:.76rem;">
          <input id="ap-price" placeholder="Price (MWK) *" type="number" style="font-size:.76rem;">
          <select id="ap-cat" style="font-size:.76rem;"><option value="Automobiles">Automobiles</option><option value="Fashion">Fashion</option><option value="Real Estate">Real Estate</option><option value="Electronics">Electronics</option></select>
          <input id="ap-subcat" placeholder="Subcategory (optional)" style="font-size:.76rem;">
          <input id="ap-loc" placeholder="Location" style="font-size:.76rem;">
          <input id="ap-comm" placeholder="Commission %" type="number" value="5" style="font-size:.76rem;">
          <select id="ap-badge" style="font-size:.76rem;"><option value="">No Badge</option><option value="NEW">NEW</option><option value="HOT">HOT</option></select>
          <div></div>
          <div style="grid-column:1/-1;">
            <label style="font-size:.68rem;color:var(--text-3);display:block;margin-bottom:6px;">🖼 Product Images (select multiple from gallery)</label>
            <div id="ap-img-drop" style="border:2px dashed var(--border-2);border-radius:var(--radius);padding:18px;text-align:center;cursor:pointer;transition:border-color .2s;background:var(--bg-card);" onclick="document.getElementById('ap-img-input').click()" ondragover="event.preventDefault();this.style.borderColor='var(--gold)'" ondragleave="this.style.borderColor='var(--border-2)'" ondrop="Admin._handleImgDrop(event)">
              <div style="font-size:1.6rem;margin-bottom:4px;">📁</div>
              <div style="font-size:.74rem;color:var(--text-2);font-weight:500;">Click to select or drag &amp; drop images</div>
              <div style="font-size:.66rem;color:var(--text-3);margin-top:3px;">JPEG · PNG · WebP · GIF · Up to 10 images · Max 8 MB each</div>
            </div>
            <input id="ap-img-input" type="file" accept="image/*" multiple style="display:none;" onchange="Admin._previewImgs(this.files,'ap-img-previews','ap-img-urls')">
            <div id="ap-img-previews" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>
            <input type="hidden" id="ap-img-urls" value="">
          </div>
          <textarea id="ap-desc" placeholder="Description *" rows="2" style="font-size:.76rem;grid-column:1/-1;resize:vertical;"></textarea>
        </div>
        <button class="btn btn-gold btn-sm" style="margin-top:10px;" onclick="Admin._addProduct()">📦 Upload Product</button>
      </div>
      <div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>Comm%</th><th>Views</th><th>Badge</th><th>Actions</th></tr></thead>
        <tbody>${list.map(p => `<tr>
          <td style="font-family:monospace;color:var(--gold);font-size:.68rem;">${String(p.id).substring(0, 8)}</td>
          <td>${U.esc(U.trunc(p.name, 26))}</td>
          <td style="font-size:.75rem;">${U.esc(p.category)}</td>
          <td style="color:var(--gold);">${U.fmt(p.price)}</td>
          <td style="font-size:.75rem;">${p.commission_percent || 5}%</td>
          <td>${p.views}</td>
          <td>${p.badge ? `<span class="wd-status ${p.badge === 'HOT' ? 'wd-rejected' : 'wd-pending'}">${p.badge}</span>` : '—'}</td>
          <td><div style="display:flex;gap:10px;">
            <button class="aff-copy-btn" style="color:var(--teal);border-color:var(--teal);font-size:.65rem;" onclick="Admin._editProduct('${p.id}')">✏️ Edit</button>
            <button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);font-size:.65rem;" onclick="Admin._delProduct('${p.id}')">🗑 Del</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  },

  async _affiliates() {
    const list = await Api.adminAffiliates().catch(() => []);
    return `<div class="admin-head"><h2>Affiliates (Dolos)</h2><p>${list.length} registered</p></div>
      <div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>Affiliate ID</th><th>Email</th><th>Clicks</th><th>Sales</th><th>Balance</th></tr></thead>
        <tbody>${list.map(a => `<tr>
          <td style="font-family:monospace;color:var(--gold);font-size:.7rem;">${U.esc(a.affiliate_id)}</td>
          <td style="font-size:.75rem;">${U.esc(a.email)}</td>
          <td>${a.clicks || 0}</td><td>${a.sales || 0}</td>
          <td>${U.fmt(a.commission_balance || 0)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  },

  async _users() {
    const users = await Api.get('/admin/users?per_page=100').catch(() => []);
    const list = Array.isArray(users) ? users : [];
    if (!list.length) return `<div class="admin-head"><h2>Users</h2></div><p style="color:var(--text-3);font-size:.82rem;padding:18px 0;">No users yet.</p>`;
    return `<div class="admin-head"><h2>All Users</h2><p>${list.length} registered</p></div>
      <div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Admin</th><th>Affiliate</th><th>Joined</th><th>Last IP</th></tr></thead>
        <tbody>${list.map(u => `<tr>
          <td style="font-size:.78rem;">${U.esc(u.full_name || '')}</td>
          <td style="font-size:.72rem;color:var(--text-3);">${U.esc(u.email)}</td>
          <td style="text-align:center;">${u.is_admin ? '✅' : '—'}</td>
          <td style="font-size:.68rem;font-family:monospace;color:${u.is_affiliate ? 'var(--teal)' : 'var(--text-3)'};">${u.affiliate_id || (u.is_affiliate ? '✓' : '—')}</td>
          <td style="font-size:.68rem;color:var(--text-3);">${new Date(u.created_at).toLocaleDateString()}</td>
          <td style="font-size:.64rem;color:var(--text-3);">${u.last_login_ip || '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  },

  async _withdrawals() {
    const wds = await Api.adminWithdrawals().catch(() => []);
    const pending = wds.filter(w => w.status === 'pending').length;
    return `<div class="admin-head"><h2>Withdrawal Requests</h2><p>${pending} pending</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <button class="aff-copy-btn" onclick="Api.exportWithdrawals('csv').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📄 Export CSV</button>
        <button class="aff-copy-btn" onclick="Api.exportWithdrawals('excel').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📊 Export Excel</button>
        <button class="aff-copy-btn" onclick="Api.exportWithdrawals('pdf').catch(e=>Toast.show('Error',e.message,'error','⚠️'))" style="font-size:.66rem;">📋 Export PDF</button>
      </div></div>
      ${!wds.length ? '<p style="color:var(--text-3);font-size:.8rem;padding:16px 0;">No requests yet.</p>' : `
      <div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>Ref</th><th>Affiliate</th><th>Amount</th><th>Method</th><th>Send To</th><th>Account Name</th><th>Account No.</th><th>Notes</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${wds.map(w => {
          const pd = w.payout_details || {};
          const acctName = U.esc(pd.name || pd.account_name || '—');
          const acctNum  = U.esc(pd.account || pd.account_number || pd.number || pd.phone || '—');
          const notes    = U.esc(pd.notes || pd.note || '—');
          return `<tr>
          <td style="font-family:monospace;color:var(--gold);font-size:.64rem;">${String(w.id).substring(0,8).toUpperCase()}</td>
          <td style="font-size:.68rem;color:var(--text-2);">${U.esc(w.affiliate_email || '—')}</td>
          <td style="color:var(--teal);font-weight:600;">${U.fmt(w.amount)}</td>
          <td style="font-size:.72rem;">${U.esc(w.method || '')}</td>
          <td style="font-size:.72rem;color:var(--text-2);">${U.esc(w.method || '—')}</td>
          <td style="font-size:.74rem;font-weight:600;">${acctName}</td>
          <td style="font-family:monospace;font-size:.72rem;color:var(--teal);">
            ${acctNum !== '—' ? `<span style="cursor:pointer;" onclick="U.copy('${U.esc(pd.account||pd.account_number||pd.number||pd.phone||'')}').then(()=>Toast.show('Copied','','info','📋'))" title="Click to copy">${acctNum} 📋</span>` : '—'}
          </td>
          <td style="font-size:.68rem;color:var(--text-3);">${notes}</td>
          <td style="font-size:.64rem;color:var(--text-3);">${new Date(w.created_at).toLocaleDateString()}</td>
          <td><span class="wd-status wd-${w.status}">${w.status}</span></td>
          <td>${w.status === 'pending' ? `<div style="display:flex;gap:10px;">
            <button class="aff-copy-btn" style="color:var(--teal);border-color:var(--teal);font-size:.72rem;padding:5px 10px;" onclick="Admin._appWd('${w.id}')">✓ Pay</button>
            <button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);font-size:.72rem;padding:5px 10px;" onclick="Admin._rejWd('${w.id}')">✕ Reject</button>
          </div>` : (w.admin_note ? `<span style="font-size:.64rem;color:var(--text-3);">${U.esc(w.admin_note)}</span>` : '—')}</td>
        </tr>`;}).join('')}</tbody>
      </table></div>`}`;
  },

  async _upOrd(id, status) {
    try { await Api.adminUpdateOrder(id, status); Toast.show('Updated', status, 'success', '✅'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _cancelOrd(id) {
    if (!await Confirm.show('Any credited affiliate commission will be reversed.', { title: 'Cancel this order?', icon: '✕', iconColor: 'orange', okText: 'Yes, Cancel', okColor: 'orange', okBorder: 'orange' })) return;
    try { await Api.adminUpdateOrder(id, 'cancelled'); Toast.show('Cancelled', 'Order cancelled & commission reversed', 'info', '✕'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _delOrder(id) {
    if (!await Confirm.show('It will be removed from the admin panel permanently.', { title: 'Delete this order?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Yes, Delete', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try { await Api.adminDeleteOrder(id); Toast.show('Deleted', 'Order removed', 'info', '🗑'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _promos() {
    const promos = await Api.adminListPromos().catch(() => []);
    return `<div class="admin-head"><h2>🎟 Promo Codes</h2></div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
        <div style="font-size:.78rem;font-weight:600;margin-bottom:10px;">Create New Promo Code</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div><label class="form-lbl">Code</label><input id="pc-code" placeholder="SAVE20" style="margin-top:4px;width:100%;box-sizing:border-box;text-transform:uppercase;"></div>
          <div><label class="form-lbl">Discount %</label><input id="pc-disc" type="number" placeholder="20" min="1" max="100" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Max Uses (0=unlimited)</label><input id="pc-uses" type="number" value="0" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Expires (optional)</label><input id="pc-exp" type="datetime-local" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="Admin._createPromo()">➕ Create Code</button>
      </div>
      ${promos.length ? `<div style="overflow-x:auto;"><table class="admin-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Max</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${promos.map(p => `<tr>
          <td style="font-family:monospace;color:var(--gold);font-weight:700;">${p.code}</td>
          <td>${p.discount_percent}%</td>
          <td>${p.uses}</td>
          <td>${p.max_uses || '∞'}</td>
          <td style="font-size:.68rem;">${p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}</td>
          <td><span class="wd-status wd-${p.is_active ? 'completed' : 'cancelled'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
          <td><button class="aff-copy-btn" style="color:var(--red);border-color:var(--red);" onclick="Admin._deletePromo('${p.id}')">🗑 Delete</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<p style="font-size:.82rem;color:var(--text-3);">No promo codes yet.</p>'}`;
  },

  async _createPromo() {
    const code = document.getElementById('pc-code')?.value.trim().toUpperCase();
    const disc = parseFloat(document.getElementById('pc-disc')?.value);
    const uses = parseInt(document.getElementById('pc-uses')?.value || '0');
    const exp = document.getElementById('pc-exp')?.value || null;
    if (!code || !disc) return Toast.show('Error', 'Fill code and discount', 'error', '⚠️');
    try {
      await Api.adminCreatePromo({ code, discount_percent: disc, max_uses: uses, expires_at: exp });
      Toast.show('Promo created!', code, 'success', '🎟');
      this._renderTab();
    } catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async _deletePromo(id) {
    if (!await Confirm.show('This promo code will be deleted.', { title: 'Delete promo?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Delete', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try { await Api.adminDeletePromo(id); Toast.show('Deleted', '', 'info', '🗑'); this._renderTab(); }
    catch(e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },

  async _notifPanel() {
    const countData = await Api.notificationCount().catch(() => ({ count: 0 }));
    return `<div class="admin-head"><h2>🔔 Notifications</h2><p>📧 ${countData.count} registered users · 🔔 ${countData.push_subscribers || 0} push subscribers</p></div>
      <div style="background:var(--bg-card-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="font-size:.78rem;font-weight:600;margin-bottom:4px;">Send Email to ALL Users</div>
        <div style="font-size:.72rem;color:var(--text-3);margin-bottom:10px;">Every registered user will receive this in their inbox + push notification if subscribed</div>
        <div style="display:grid;gap:8px;margin-bottom:8px;">
          <div><label class="form-lbl">Title</label><input id="notif-title" placeholder="New product added!" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Message</label><input id="notif-body" placeholder="Check out our latest listings" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Link (optional)</label><input id="notif-url" placeholder="/" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
        </div>
        <button class="btn btn-gold btn-sm" onclick="Admin._sendNotif()">🔔 Send to All Users</button>
      </div>`;
  },

  async _sendNotif() {
    const title = document.getElementById('notif-title')?.value.trim();
    const body = document.getElementById('notif-body')?.value.trim();
    const url = document.getElementById('notif-url')?.value.trim() || '/';
    if (!title || !body) return Toast.show('Error', 'Fill title and message', 'error', '⚠️');
    const btn = document.querySelector('#admin-content .btn-gold');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending…'; }
    try {
      const res = await Api.broadcastNotification(title, body, url);
      Toast.show('Sent! 🔔', `Emailed ${res.emails_sent}/${res.users_total} users · Push: ${res.push_sent}`, 'success', '✅', 6000);
      if (btn) { btn.disabled = false; btn.textContent = '🔔 Send to All Users'; }
    } catch(e) {
      Toast.show('Error', e.message, 'error', '⚠️');
      if (btn) { btn.disabled = false; btn.textContent = '🔔 Send to All Users'; }
    }
  },

  async _inbox() {
    const convs = await Api.adminAllConversations().catch(() => []);
    const unread = convs.reduce((s,c) => s + c.unread, 0);
    return `<div class="admin-head"><h2>💬 Customer Messages</h2><p>${convs.length} conversations · <span style="color:var(--gold);">${unread} unread</span></p></div>
      <div style="display:grid;grid-template-columns:280px 1fr;gap:0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;height:500px;">
        <div style="border-right:1px solid var(--border);overflow-y:auto;background:var(--bg-card);">
          ${convs.length ? convs.map(c => `<div onclick="Messages._activeConv='${c.id}';Messages.openConversation('${c.id}')" style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;" onmouseover="this.style.background='var(--bg-card-2)'" onmouseout="this.style.background=''">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:.78rem;font-weight:600;">${U.esc(c.user_name)}</div>
              ${c.unread > 0 ? `<span style="background:var(--gold);color:#000;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;">${c.unread}</span>` : ''}
            </div>
            <div style="font-size:.68rem;color:var(--text-3);margin-top:2px;">${U.esc(c.subject)}${c.order_ref ? ` · #${c.order_ref}` : ''}</div>
          </div>`).join('') : '<div style="padding:20px;font-size:.78rem;color:var(--text-3);">No messages yet</div>'}
        </div>
        <div id="messages-thread" style="display:flex;flex-direction:column;overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:.82rem;">Select a conversation</div>
        </div>
      </div>`;
  },

  async _clearAllOrders() {
    if (!await Confirm.show('This will remove ALL orders and cannot be undone.', { title: 'Clear all orders?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Yes, Clear All', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try { await Api.adminClearOrders(); Toast.show('Cleared', 'All orders removed', 'info', '🗑'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _appWd(id) {
    if (!await Confirm.show('Mark this withdrawal as paid? This cannot be undone.', { title: 'Approve withdrawal?', icon: '💸', iconColor: 'var(--teal)', okText: 'Yes, Approve', okColor: 'var(--teal)', okBorder: 'var(--teal)' })) return;
    try { await Api.adminUpdateWithdrawal(id, 'approved'); Toast.show('Approved', '', 'success', '💸'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _rejWd(id) {
    if (!await Confirm.show('The balance will be refunded to the affiliate.', { title: 'Reject this withdrawal?', icon: '↩️', iconColor: 'var(--red)', okText: 'Yes, Reject', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try { await Api.adminUpdateWithdrawal(id, 'rejected'); Toast.show('Rejected', 'Balance refunded', 'info', '↩️'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  // ── Image upload helpers ──────────────────────────────────────
  async _uploadFiles(files) {
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('files', f));
      const res = await fetch('/api/v1/admin/upload/images', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + Api._token },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail || `HTTP ${res.status} error`;
        throw new Error(detail);
      }
      const data = await res.json();
      return data.urls || [];
    } catch (e) {
      Toast.show('Upload failed', e.message, 'error', '⚠️', 6000);
      return [];
    }
  },

  async _previewImgs(files, previewContainerId, hiddenInputId) {
    if (!files || !files.length) return;
    Toast.show('Uploading…', `${files.length} image${files.length > 1 ? 's' : ''}`, 'info', '⏳', 2000);
    const urls = await this._uploadFiles(files);
    if (!urls.length) return;

    // Store URLs in hidden field
    const hiddenInput = document.getElementById(hiddenInputId);
    if (hiddenInput) {
      const existing = hiddenInput.value ? hiddenInput.value.split(',') : [];
      hiddenInput.value = [...existing, ...urls].filter(Boolean).join(',');
    }

    // Show previews
    const container = document.getElementById(previewContainerId);
    if (container) {
      urls.forEach(url => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:inline-block;';
        const displaySrc = url + '?t=' + Date.now();
        wrapper.innerHTML = `
          <img src="${displaySrc}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid var(--gold);box-shadow:0 2px 8px rgba(0,0,0,.3);" onerror="this.src='https://placehold.co/72x72/161616/c8a84b?text=✓'">
          <span onclick="this.parentElement.remove();Admin._removePreviewUrl('${hiddenInputId}','${url}')" style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:.65rem;cursor:pointer;line-height:1;">✕</span>`;
        container.appendChild(wrapper);
      });
      Toast.show('Images uploaded!', `${urls.length} image${urls.length > 1 ? 's' : ''} ready`, 'success', '✅', 2000);
    }
  },

  _removePreviewUrl(hiddenInputId, urlToRemove) {
    const el = document.getElementById(hiddenInputId);
    if (el) el.value = el.value.split(',').filter(u => u.trim() && u.trim() !== urlToRemove).join(',');
  },

  _handleImgDrop(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = 'var(--border-2)';
    const files = event.dataTransfer?.files;
    if (files?.length) Admin._previewImgs(files, 'ap-img-previews', 'ap-img-urls');
  },

  async _addProduct() {
    const name = document.getElementById('ap-name')?.value.trim();
    const price = parseFloat(document.getElementById('ap-price')?.value);
    const category = document.getElementById('ap-cat')?.value;
    const subcategory = document.getElementById('ap-subcat')?.value.trim() || null;
    const location = document.getElementById('ap-loc')?.value.trim();
    const commission_percent = parseFloat(document.getElementById('ap-comm')?.value) || 5;
    const badge = document.getElementById('ap-badge')?.value || null;
    const description = document.getElementById('ap-desc')?.value.trim();
    // Images come from the file-picker upload flow (stored as comma-separated URLs in hidden field)
    const imgVal = document.getElementById('ap-img-urls')?.value || '';
    const imgs = imgVal.split(',').map(s => s.trim()).filter(Boolean);
    if (!name || !price || !description) return Toast.show('Error', 'Fill required fields (Name, Price, Description)', 'error', '⚠️');
    // Upload any pending files first if URLs haven't been set yet
    const fileInput = document.getElementById('ap-img-input');
    if (fileInput?.files?.length && !imgs.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      const uploaded = await Admin._uploadFiles(fileInput.files);
      imgs.push(...uploaded);
    }
    try {
      await Api.createProduct({ name, price, category, subcategory, location, images: imgs, description, commission_percent, badge });
      Toast.show('Product added!', name, 'success', '✅'); this._renderTab();
    } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _editProduct(id) {
    const data = await Api.products({ per_page: 100 }).catch(() => ({ items: [] }));
    const p = (data.items || []).find(x => String(x.id) === id || String(x.id).startsWith(id.substring(0,8)));
    if (!p) return Toast.show('Error', 'Product not found', 'error', '⚠️');

    // Build edit modal inside admin-content
    const c = document.getElementById('admin-content');
    if (!c) return;
    const existingImgs = (p.images || []).map((url, i) => `
      <div style="position:relative;display:inline-block;" id="ep-img-${i}">
        <img src="${imgProxy(url)}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.src='https://placehold.co/72x72/161616/c8a84b?text=P'">
        <span onclick="Admin._removeEditImg(${i},'${U.esc(url)}')" style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:.65rem;cursor:pointer;line-height:1;">✕</span>
      </div>`).join('');

    c.innerHTML = `
      <div style="padding:20px;max-width:600px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
          <button class="aff-copy-btn" onclick="Admin._setTab('products')" style="font-size:.72rem;">← Back</button>
          <h3 style="margin:0;font-family:var(--font-display);">✏️ Edit Product</h3>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="grid-column:1/-1;"><label class="form-lbl">Product Name *</label><input id="ep-name" value="${U.esc(p.name)}" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Price (MWK) *</label><input id="ep-price" type="number" value="${p.price}" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Commission %</label><input id="ep-comm" type="number" value="${p.commission_percent || 5}" style="margin-top:4px;width:100%;box-sizing:border-box;"></div>
          <div><label class="form-lbl">Badge</label>
            <select id="ep-badge" style="margin-top:4px;width:100%;box-sizing:border-box;font-size:.8rem;">
              <option value="" ${!p.badge ? 'selected' : ''}>No Badge</option>
              <option value="NEW" ${p.badge==='NEW' ? 'selected' : ''}>NEW</option>
              <option value="HOT" ${p.badge==='HOT' ? 'selected' : ''}>HOT</option>
            </select>
          </div>
          <div></div>
          <div style="grid-column:1/-1;"><label class="form-lbl">Description *</label><textarea id="ep-desc" rows="3" style="margin-top:4px;width:100%;box-sizing:border-box;resize:vertical;font-size:.8rem;">${U.esc(p.description || '')}</textarea></div>
          <div style="grid-column:1/-1;">
            <label class="form-lbl" style="margin-bottom:8px;display:block;">🖼 Images</label>
            <div id="ep-existing-imgs" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${existingImgs}</div>
            <input type="hidden" id="ep-kept-urls" value="${U.esc((p.images||[]).join(','))}">
            <div style="border:2px dashed var(--border-2);border-radius:var(--radius);padding:14px;text-align:center;cursor:pointer;background:var(--bg-card);" onclick="document.getElementById('ep-img-input').click()" ondragover="event.preventDefault();this.style.borderColor='var(--gold)'" ondragleave="this.style.borderColor='var(--border-2)'" ondrop="Admin._handleEditImgDrop(event)">
              <div style="font-size:1.2rem;">📁</div>
              <div style="font-size:.72rem;color:var(--text-2);">Click to add more images or drag &amp; drop</div>
              <div style="font-size:.64rem;color:var(--text-3);margin-top:2px;">JPEG · PNG · WebP · GIF · Max 8 MB each</div>
            </div>
            <input id="ep-img-input" type="file" accept="image/*" multiple style="display:none;" onchange="Admin._previewImgs(this.files,'ep-new-previews','ep-new-urls')">
            <div id="ep-new-previews" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
            <input type="hidden" id="ep-new-urls" value="">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="Admin._setTab('products')">Cancel</button>
          <button class="btn btn-gold" style="flex:2" onclick="Admin._saveEditProduct('${p.id}')">💾 Save Changes</button>
        </div>
      </div>`;
    // Store original images for removal tracking
    Admin._editOrigImgs = [...(p.images || [])];
  },

  _removeEditImg(idx, url) {
    const el = document.getElementById(`ep-img-${idx}`);
    if (el) el.remove();
    const kept = document.getElementById('ep-kept-urls');
    if (kept) {
      kept.value = kept.value.split(',').map(s=>s.trim()).filter(u => u && u !== url).join(',');
    }
  },

  async _handleEditImgDrop(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = 'var(--border-2)';
    const files = event.dataTransfer?.files;
    if (files?.length) await Admin._previewImgs(files, 'ep-new-previews', 'ep-new-urls');
  },

  async _saveEditProduct(id) {
    const name = document.getElementById('ep-name')?.value.trim();
    const price = parseFloat(document.getElementById('ep-price')?.value);
    const description = document.getElementById('ep-desc')?.value.trim();
    const commission_percent = parseFloat(document.getElementById('ep-comm')?.value) || 5;
    const badge = document.getElementById('ep-badge')?.value || null;
    if (!name || !price || !description) return Toast.show('Error', 'Fill required fields', 'error', '⚠️');

    // Combine kept existing images + newly uploaded ones
    const keptStr = document.getElementById('ep-kept-urls')?.value || '';
    const keptImgs = keptStr.split(',').map(s=>s.trim()).filter(Boolean);
    const newUrlsStr = document.getElementById('ep-new-urls')?.value || '';
    const newUrlsAlready = newUrlsStr.split(',').map(s=>s.trim()).filter(Boolean);

    // Upload any pending files that haven't been uploaded yet
    const fileInput = document.getElementById('ep-img-input');
    let newUploaded = [];
    if (fileInput?.files?.length && !newUrlsAlready.length) {
      Toast.show('Uploading images…', '', 'info', '⏳');
      newUploaded = await Admin._uploadFiles(fileInput.files);
    }

    const images = [...keptImgs, ...newUrlsAlready, ...newUploaded];
    try {
      await Api.updateProduct(id, { name, price, description, images, commission_percent, badge });
      Toast.show('Product updated!', name, 'success', '✅');
      this._setTab('products');
    } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  },
  async _delProduct(id) {
    if (!await Confirm.show('This product will be removed from the store.', { title: 'Delete product?', icon: '🗑️', iconColor: 'var(--red)', okText: 'Yes, Delete', okColor: 'var(--red)', okBorder: 'var(--red)' })) return;
    try { await Api.deleteProduct(id); Toast.show('Deleted', '', 'info', '🗑️'); this._renderTab(); } catch (e) { Toast.show('Error', e.message, 'error', '⚠️'); }
  }
};

/* ── UI ───────────────────────────────────────────────────── */
const UI = {
  theme: 'dark',
  initTheme() {
    this.theme = localStorage.getItem('pm_theme') || 'dark';
    document.body.classList.toggle('light', this.theme === 'light');
    const btn = document.getElementById('theme-btn'); if (btn) btn.textContent = this.theme === 'dark' ? '☀️' : '🌙';
  },
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('light', this.theme === 'light');
    localStorage.setItem('pm_theme', this.theme);
    const btn = document.getElementById('theme-btn'); if (btn) btn.textContent = this.theme === 'dark' ? '☀️' : '🌙';
  },

  renderSidebar() {
    const list = document.getElementById('cat-list'); if (!list) return;
    list.innerHTML = Object.entries(CATS).map(([cat, subs]) => `
      <div>
        <div class="cat-item${Products.state.cat === cat && !Products.state.subcat ? ' active' : ''}" id="ci-${cat.replace(/\s/g, '_')}" onclick="UI.toggleCat(this,'${cat.replace(/'/g, "\\'")}')">
          <span class="cat-item-left"><span class="cat-icon">${CAT_ICONS[cat] || '📦'}</span><span>${U.esc(cat)}</span></span>
          ${subs.length ? '<span class="cat-arrow">›</span>' : ''}
        </div>
        ${subs.length ? `<div class="subcat-list${Products.state.cat === cat ? ' open' : ''}" id="sl-${cat.replace(/\s/g, '_')}">
          ${subs.map(s => `<div class="subcat-item${Products.state.subcat === s ? ' active' : ''}" onclick="Products.setCat('${cat.replace(/'/g, "\\'")}','${s.replace(/'/g, "\\'")}');UI.renderSidebar()">${U.esc(s)}</div>`).join('')}
        </div>` : ''}</div>`).join('');
  },

  toggleCat(el, cat) {
    const subs = CATS[cat] || [];
    if (!subs.length) { Products.setCat(cat, null); this.renderSidebar(); return; }
    const sl = document.getElementById('sl-' + cat.replace(/\s/g, '_'));
    const was = sl && sl.classList.contains('open');
    document.querySelectorAll('.subcat-list.open').forEach(l => l.classList.remove('open'));
    document.querySelectorAll('.cat-item.open').forEach(e => e.classList.remove('open'));
    if (!was && sl) { sl.classList.add('open'); el.classList.add('open'); }
    Products.setCat(cat, null); this.renderSidebar();
  },

  renderHotStrip() {
    const s = document.getElementById('hot-strip'); if (!s) return;
    const hot = Products._hotProducts.slice(0, 10);
    if (!hot.length) { s.style.display = 'none'; return; }
    s.innerHTML = '<div style="display:flex;align-items:center;padding:0 14px;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text-3);border-right:1px solid var(--border);white-space:nowrap;flex-shrink:0;">🔥 Hot Now</div>'
      + hot.map(p => '<div class="hot-chip" onclick="Products.openDetail(\'' + p.id + '\')">' + '🔥 ' + U.esc(U.trunc(p.name, 20)) + '<span class="hot-chip-price">' + U.fmt(p.price) + '</span></div>').join('');
    s.style.display = 'flex';
  },

  openAuth(tab = 'login') { this._renderAuth(tab); Modal.open('auth-modal'); },
  _renderForgot() {
    const body = document.getElementById('auth-modal-body'); if (!body) return;
    body.innerHTML = `<div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:1.8rem;margin-bottom:6px;">🔐</div>
      <div style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:4px;">Forgot Password?</div>
      <div style="font-size:.78rem;color:var(--text-3);">Enter your email and we'll send a reset link.</div>
    </div>
    <div><label class="form-lbl">Email</label><input id="forgot-email" type="email" placeholder="you@email.com" style="margin-top:5px;" onkeydown="if(event.key==='Enter')UI._submitForgot()"></div>
    <button class="btn btn-gold" style="width:100%;margin-top:16px;" onclick="UI._submitForgot()">📧 Send Reset Link</button>
    <p style="text-align:center;font-size:.74rem;color:var(--text-3);margin-top:12px;">
      <span onclick="UI._renderAuth('login')" style="color:var(--gold);cursor:pointer;">← Back to Sign In</span>
    </p>`;
  },
  async _submitReset() {
    const pw = document.getElementById('reset-pw')?.value || '';
    const pw2 = document.getElementById('reset-pw2')?.value || '';
    if (!pw || !pw2) return Toast.show('Error', 'Fill in both fields', 'error', '⚠️');
    if (pw !== pw2) return Toast.show('Error', 'Passwords do not match', 'error', '⚠️');
    const btn = document.querySelector('#auth-modal-body .btn-gold');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Resetting…'; }
    try {
      await Api.post('/auth/reset-password', { token: UI._resetToken, password: pw });
      Toast.show('Password reset!', 'You can now log in with your new password', 'success', '✅', 6000);
      Modal.close('auth-modal');
      setTimeout(() => UI.openAuth('login'), 1000);
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
      if (btn) { btn.disabled = false; btn.textContent = '🔐 Reset Password'; }
    }
  },
  async _submitForgot() {
    const email = document.getElementById('forgot-email')?.value.trim();
    if (!email) return Toast.show('Error', 'Enter your email', 'error', '⚠️');
    const btn = document.querySelector('#auth-modal-body .btn-gold');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending…'; }
    try {
      await Api.post('/auth/forgot-password', { email });
      Toast.show('Email sent!', 'Check your inbox for the reset link', 'success', '📧', 6000);
      Modal.close('auth-modal');
    } catch (e) {
      Toast.show('Error', e.message, 'error', '⚠️');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📧 Send Reset Link'; }
    }
  },
  _renderAuth(tab) {
    const body = document.getElementById('auth-modal-body'); if (!body) return;
    const isL = tab === 'login';
    const inviteId = sessionStorage.getItem('pm_aff_invite');
    const inviteBanner = (!isL && inviteId) ? `<div style="background:var(--gold-dim);border:1px solid var(--gold);border-radius:var(--radius-sm);padding:10px;margin-bottom:12px;font-size:.76rem;color:var(--text-1);text-align:center;">🎉 You were invited to join as a Dolo affiliate! Register to start earning commissions.</div>` : '';
    body.innerHTML = `<div class="auth-tabs"><div class="auth-tab${isL ? ' active' : ''}" onclick="UI._renderAuth('login')">Sign In</div><div class="auth-tab${!isL ? ' active' : ''}" onclick="UI._renderAuth('register')">Register</div></div>
      ${inviteBanner}
      <div class="form-row">
        ${!isL ? '<div><label class="form-lbl">Full Name</label><input id="auth-name" type="text" placeholder="Chimwemwe Banda" style="margin-top:5px;"></div>' : ''}
        <div><label class="form-lbl">Email</label><input id="auth-email" type="email" placeholder="you@email.com" style="margin-top:5px;"></div>
        <div><label class="form-lbl">Password</label><input id="auth-pw" type="password" placeholder="••••••••" style="margin-top:5px;" onkeydown="if(event.key==='Enter')UI._submitAuth('${tab}')"><div style="font-size:.72rem;color:var(--text-3);margin-top:5px;display:${isL?'none':'block'}">⚠️ Min 8 chars · 1 uppercase letter · 1 number</div></div>
      </div>
      <button class="btn btn-gold" style="width:100%;margin-top:16px;" onclick="UI._submitAuth('${tab}')">${isL ? '🔓 Sign In' : '🚀 Create Account'}</button>
      <p style="text-align:center;font-size:.74rem;color:var(--text-3);margin-top:12px;">
        ${isL ? `No account? <span onclick="UI._renderAuth('register')" style="color:var(--gold);cursor:pointer;">Register free</span> · <span onclick="UI._renderForgot()" style="color:var(--text-3);cursor:pointer;">Forgot password?</span>` : `Have account? <span onclick="UI._renderAuth('login')" style="color:var(--gold);cursor:pointer;">Sign in</span>`}
      </p>`;
  },
  async _submitAuth(tab) {
    const name = document.getElementById('auth-name')?.value || '';
    const email = document.getElementById('auth-email')?.value || '';
    const pw = document.getElementById('auth-pw')?.value || '';
    const btn = document.querySelector('#auth-modal-body .btn-gold');
    if (btn) { btn.textContent = '⏳ Loading…'; btn.disabled = true; }
    const res = tab === 'login' ? await Auth.login(email, pw) : await Auth.register(name, email, pw);
    if (btn) { btn.disabled = false; btn.textContent = tab === 'login' ? '🔓 Sign In' : '🚀 Create Account'; }
    if (res.err) { Toast.show('Error', res.err, 'error', '⚠️'); return; }
    Toast.show('Welcome!', 'Hello, ' + (Auth.user.full_name || Auth.user.email) + '!', 'success', '🎉');
    Modal.close('auth-modal');
    // Auto-join affiliate programme if user registered via an affiliate invite link
    if (tab === 'register' && sessionStorage.getItem('pm_aff_invite')) {
      sessionStorage.removeItem('pm_aff_invite');
      try {
        await Api.joinAffiliate();
        await Aff.load();
        Toast.show('Dolo Programme Activated! 🎉', 'You are now an affiliate — start sharing links to earn!', 'success', '💼', 6000);
        Views.show('affiliate');
      } catch {}
    }
    // If the logged-in user is an admin, open the admin panel immediately
    if (Auth.user?.is_admin) {
      localStorage.setItem(Admin.KEY, 'true');
      Admin._pendingOpen = false;
      setTimeout(() => Admin.open(), 300);
      await Favs.load();
      Favs._badge();
      return;
    }
    // Non-admin tried to access admin panel
    if (Admin._pendingOpen) {
      Admin._pendingOpen = false;
      Toast.show('Access denied', 'This account does not have admin privileges', 'error', '🚫');
    }
    if (Views.current === 'account') Views.renderAccount();
    if (Views.current === 'affiliate') Views.renderAffiliate();
    await Favs.load();
    Favs._badge();
  },

  applyFilters() {
    const loc = document.getElementById('filter-location')?.value || '';
    const min = document.getElementById('filter-min')?.value;
    const max = document.getElementById('filter-max')?.value;
    Products._locFilter = loc || null; Products._priceMin = min ? Number(min) : null; Products._priceMax = max ? Number(max) : null;
    Products.state.page = 1; Products.load();
    Toast.show('Filters applied', '', 'info', '🔍', 1600);
    if (window.innerWidth < 1100) this.closeSidebar();
  },
  openSidebar() { document.getElementById('sidebar')?.classList.add('open'); document.querySelector('.sidebar-overlay')?.classList.add('open'); document.getElementById('hamburger')?.classList.add('open'); },
  closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); document.querySelector('.sidebar-overlay')?.classList.remove('open'); document.getElementById('hamburger')?.classList.remove('open'); }
};

/* ── TOUCH SWIPE ──────────────────────────────────────────── */
function initSwipe() {
  document.addEventListener('touchstart', e => { const m = e.target.closest('.card-media'); if (!m) return; m._tx = e.touches[0].clientX; m._ty = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', e => { const m = e.target.closest('.card-media'); if (!m || m._tx == null) return; const dx = e.changedTouches[0].clientX - m._tx; const dy = e.changedTouches[0].clientY - m._ty; if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 36) { const id = m.id.replace('media-', ''); Products.slide(id, dx < 0 ? 1 : -1); } m._tx = null; }, { passive: true });
}

/* ── BOOTSTRAP ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init(); Modal.init(); initSwipe();
  Api.init();
  UI.initTheme(); UI.renderSidebar();

  // Authenticated loads — 3s timeout so a hanging refresh never blocks the page
  await Promise.race([Auth.load(), new Promise(r => setTimeout(r, 3000))]);
  Auth._nav();

  // Parallel data load — each wrapped so one failure never blocks the rest
  await Promise.all([
    Products.load().catch(() => {}),
    Products.loadHot().catch(() => {}),
    Cart.load().catch(() => {}),
    Auth.user ? Favs.load().catch(() => {}) : Promise.resolve(),
  ]);
  Cart._badge(); Favs._badge();
  // ── URL param handling ─────────────────────────────────────────────────────
  const _urlParams = new URLSearchParams(window.location.search);
  const _prodParam = _urlParams.get('prod');
  const _affParam  = _urlParams.get('aff');
  const _affInvite = _urlParams.get('aff_invite');

  if (_affInvite) {
    // Personal affiliate invite link: ?aff_invite=DOLO-XXXX-1234
    // Store invite ID in session so it's captured at register
    sessionStorage.setItem('pm_aff_invite', _affInvite);
    // Track the referrer's name to show on join page
    try {
      const inviteInfo = await Api.validateInvite(_affInvite);
      Views.show('affiliate');
      // After affiliate view renders, show special invite banner
      setTimeout(() => {
        const body = document.getElementById('aff-view-body');
        if (!body) return;
        const banner = document.createElement('div');
        banner.style.cssText = 'background:linear-gradient(135deg,var(--gold-dim),var(--bg-card-2));border:1px solid var(--gold);border-radius:var(--radius);padding:18px;margin-bottom:18px;text-align:center;';
        banner.innerHTML = `<div style="font-size:1.6rem;margin-bottom:8px;">🎉</div>
          <div style="font-family:var(--font-display);font-size:1.1rem;color:var(--gold);margin-bottom:6px;">You were invited by <strong>${U.esc(inviteInfo.inviter_name)}</strong>!</div>
          <p style="font-size:.8rem;color:var(--text-2);margin-bottom:14px;">Register as a Dolo Pa_mSikA affiliate and start earning commissions on every sale you refer.</p>
          <button class="btn btn-gold" onclick="UI.openAuth('register')">🚀 Register & Join as Dolo</button>`;
        body.prepend(banner);
      }, 400);
    } catch {
      Views.show('affiliate');
    }
  } else if (_prodParam) {
    // Product referral link: ?prod=PRODUCT_ID&aff=AFFILIATE_ID
    Views.show('home');
    if (_affParam) {
      // Store affiliate ref in session for order tracking
      sessionStorage.setItem('pm_aff_ref', _affParam);
      // Track the click on the backend (fire-and-forget)
      Api.trackClick(_affParam, _prodParam).catch(() => {});
    }
    // Open the product detail modal directly for the linked product
    setTimeout(async () => {
      // First try to find product in already-loaded data
      let prod = Products._data.find(x => String(x.id) === String(_prodParam));
      if (!prod) {
        // Fetch from API if not in current page
        try { prod = await Api.product(_prodParam); } catch {}
      }
      if (prod) {
        Products.openDetail(prod);
        // Also scroll the card into view if on homepage
        const card = document.getElementById('card-' + _prodParam);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
    }, 900);
  } else {
    Views.show('home');
  }

  // Loading screen — dismiss after content is ready, not on a blind timer
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.classList.add('done'); setTimeout(() => ls.remove(), 500); }

  // Admin secret: type "pamsika" anywhere, or go to #admin-pamsika
  document.addEventListener('keydown', e => Admin.checkCombo(e.key.toLowerCase()));
  if (window.location.hash === CFG.adminHash) Admin.open();
  window.addEventListener('hashchange', () => { if (window.location.hash === CFG.adminHash) Admin.open(); });

  // Search
  document.getElementById('nav-search-inp')?.addEventListener('input', U.deb(e => {
    Products.state.search = e.target.value.trim(); Products.state.page = 1; Products.load();
  }, 400));

  // Sort
  document.getElementById('sort-select')?.addEventListener('change', e => {
    Products.state.sort = e.target.value; Products.state.page = 1; Products.load();
  });

  // Sidebar
  document.querySelector('.sidebar-overlay')?.addEventListener('click', () => UI.closeSidebar());
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.contains('open') ? UI.closeSidebar() : UI.openSidebar();
  });

  // Nav scroll glass
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').style.boxShadow = window.scrollY > 40 ? '0 4px 24px rgba(0,0,0,.5)' : 'none';
  }, { passive: true });

  // PWA
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; setTimeout(() => document.getElementById('pwa-banner')?.classList.add('show'), 4500); });
  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('pwa-banner')?.classList.remove('show'); });
  document.getElementById('pwa-dismiss')?.addEventListener('click', () => document.getElementById('pwa-banner')?.classList.remove('show'));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});

  // Handle password reset link (?token=...)
  const _resetToken = new URLSearchParams(window.location.search).get('token');
  if (_resetToken) {
    setTimeout(() => {
      const body = document.getElementById('auth-modal-body'); 
      Modal.open('auth-modal');
      if (!body) return;
      body.innerHTML = `<div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:1.8rem;margin-bottom:6px;">🔑</div>
        <div style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:4px;">Set New Password</div>
      </div>
      <div class="form-row">
        <div><label class="form-lbl">New Password</label><input id="reset-pw" type="password" placeholder="Min 8 chars, 1 uppercase, 1 number" style="margin-top:5px;"></div>
        <div><label class="form-lbl">Confirm Password</label><input id="reset-pw2" type="password" placeholder="Repeat password" style="margin-top:5px;" onkeydown="if(event.key==='Enter')UI._submitReset()"></div>
      </div>
      <button class="btn btn-gold" style="width:100%;margin-top:16px;" onclick="UI._submitReset()">🔐 Reset Password</button>`;
      UI._resetToken = _resetToken;
      history.replaceState({}, '', '/');
    }, 800);
  }
});