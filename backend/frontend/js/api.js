'use strict';
/* ================================================================
   PA_MSIKA v4.0 — API CLIENT
   Connects frontend to FastAPI backend
   ================================================================ */

const API_BASE = '/api/v1';

const Api = {
  _token: null,
  _sessionId: null,

  init() {
    this._token = localStorage.getItem('pm_access_token');
    this._sessionId = localStorage.getItem('pm_session_id');
    if (!this._sessionId) {
      this._sessionId = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2,8);
      localStorage.setItem('pm_session_id', this._sessionId);
    }
  },

  setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('pm_access_token', token);
    else localStorage.removeItem('pm_access_token');
  },

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this._token) h['Authorization'] = 'Bearer ' + this._token;
    if (this._sessionId) h['X-Session-Id'] = this._sessionId;
    return h;
  },

  async _req(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const opts = { method, headers: this._headers(), signal: controller.signal, credentials: 'include' };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(API_BASE + path, opts);
      clearTimeout(timer);
      if (res.status === 401) {
        // Try refresh
        const refreshed = await this._refresh();
        if (refreshed) {
          // Retry with new token
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), 15000);
          opts.headers = this._headers();
          opts.signal = retryController.signal;
          const retry = await fetch(API_BASE + path, opts);
          clearTimeout(retryTimer);
          if (!retry.ok) {
            const err = await retry.json().catch(() => ({}));
            const detail = Array.isArray(err.detail)
              ? err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
              : (err.detail || 'Request failed');
            throw new Error(detail);
          }
          return retry.status === 204 ? null : retry.json();
        } else {
          this.setToken(null);
          throw new Error('Session expired');
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // FastAPI validation errors return detail as an array of objects
        const detail = Array.isArray(err.detail)
          ? err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
          : (err.detail || `HTTP ${res.status}`);
        throw new Error(detail);
      }
      return res.status === 204 ? null : res.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Request timed out — please try again');
      if (e instanceof TypeError) throw new Error('Network error — check your connection');
      throw e;
    }
  },

  async _refresh() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include', signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const data = await res.json();
      this.setToken(data.access_token);
      return true;
    } catch { return false; }
  },

  get: (path) => Api._req('GET', path),
  post: (path, body) => Api._req('POST', path, body),
  put: (path, body) => Api._req('PUT', path, body),
  patch: (path, body) => Api._req('PATCH', path, body),
  del: (path) => Api._req('DELETE', path),

  // ── Auth ──────────────────────────────────────────────────────
  async register(name, email, password, referredBy = null) {
    const body = { full_name: name, email, password };
    if (referredBy) body.referred_by = referredBy;
    const data = await this.post('/auth/register', body);
    this.setToken(data.access_token);
    return data;
  },

  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    this.setToken(data.access_token);
    return data;
  },

  async logout() {
    try { await this.post('/auth/logout'); } catch {}
    this.setToken(null);
  },

  async me() {
    return this.get('/auth/me');
  },

  // ── Products ──────────────────────────────────────────────────
  async products(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.per_page) q.set('per_page', params.per_page);
    if (params.search) q.set('search', params.search);
    if (params.category) q.set('category', params.category);
    if (params.subcategory) q.set('subcategory', params.subcategory);
    if (params.location) q.set('location', params.location);
    if (params.min_price != null) q.set('min_price', params.min_price);
    if (params.max_price != null) q.set('max_price', params.max_price);
    if (params.sort) q.set('sort', params.sort);
    return this.get('/products?' + q.toString());
  },

  async product(id) { return this.get('/products/' + id); },
  async hotProducts() { return this.get('/products/hot'); },
  async newProducts() { return this.get('/products/new'); },

  // Admin product management
  async createProduct(data) { return this.post('/admin/products', data); },
  async updateProduct(id, data) { return this.put('/admin/products/' + id, data); },
  async deleteProduct(id) { return this.del('/admin/products/' + id); },

  // ── Cart ──────────────────────────────────────────────────────
  async getCart() { return this.get('/cart'); },
  async addToCart(productId, quantity = 1) { return this.post('/cart/items', { product_id: productId, quantity }); },
  async updateCartItem(itemId, quantity) { return this.put('/cart/items/' + itemId, { quantity }); },
  async removeCartItem(itemId) { return this.del('/cart/items/' + itemId); },
  async clearCart() { return this.del('/cart'); },

  // ── Orders ────────────────────────────────────────────────────
  async createOrder(paymentMethod, contactInfo) {
    return this.post('/orders', { payment_method: paymentMethod, contact_info: contactInfo });
  },
  async createDirectOrder(items, paymentMethod, contactInfo, affiliateRef = null) {
    const body = {
      payment_method: paymentMethod,
      contact_info: contactInfo,
      items: items.map(i => ({ product_id: i.id || i.product_id, quantity: i.qty || i.quantity || 1 })),
    };
    if (affiliateRef) body.affiliate_ref = affiliateRef;
    return this.post('/orders/direct', body);
  },
  async myOrders() { return this.get('/orders'); },
  async deleteOrder(orderId) { return this.del('/orders/' + orderId); },
  async clearMyOrders() { return this.del('/orders'); },

  // ── Favorites ─────────────────────────────────────────────────
  async getFavorites() { return this.get('/favorites'); },
  async addFavorite(productId) { return this.post('/favorites/' + productId); },
  async removeFavorite(productId) { return this.del('/favorites/' + productId); },

  // ── Affiliate ─────────────────────────────────────────────────
  async joinAffiliate() { return this.post('/affiliate/join'); },
  async validateInvite(inviteId) { return this.get('/affiliate/validate-invite/' + inviteId); },
  async affiliateDashboard() { return this.get('/affiliate/dashboard'); },
  async referralLink(productId) { return this.get('/affiliate/referral-link/' + productId); },
  async trackClick(affiliateId, productId) {
    return this.post('/affiliate/click', { affiliate_id: affiliateId, product_id: productId });
  },
  async requestWithdrawal(amount, method, details) {
    return this.post('/affiliate/withdrawal', { amount, method, details });
  },
  async myWithdrawals() { return this.get('/affiliate/withdrawals'); },

  // ── Admin ─────────────────────────────────────────────────────
  async adminStats() { return this.get('/admin/stats'); },
  async adminOrders(params = {}) {
    const q = new URLSearchParams();
    if (params.per_page) q.set('per_page', params.per_page);
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('per_page', params.limit);
    return this.get('/admin/orders?' + q);
  },
  async adminUpdateOrder(id, status) { return this.patch('/admin/orders/' + id, { status }); },
  async adminDeleteOrder(id) { return this.del('/admin/orders/' + id); },
  async adminClearOrders() { return this.del('/admin/orders'); },
  async adminWithdrawals() { return this.get('/admin/withdrawals'); },
  async adminUpdateWithdrawal(id, status) { return this.patch('/admin/withdrawals/' + id, { status }); },
  async adminAffiliates() { return this.get('/admin/affiliates'); },
  // ── Reviews ───────────────────────────────────────────────
  async getReviews(productId) { return this.get('/reviews/' + productId); },
  async addReview(productId, rating, comment) { return this.post('/reviews/' + productId, { rating, comment }); },

  // ── Promo ─────────────────────────────────────────────────
  async validatePromo(code) { return this.get('/promo/validate/' + code); },
  async adminCreatePromo(data) { return this.post('/promo/admin/create', data); },
  async adminListPromos() { return this.get('/promo/admin/list'); },
  async adminDeletePromo(id) { return this.del('/promo/admin/' + id); },

  // ── Notifications ─────────────────────────────────────────
  async subscribeNotifications(subscription, userId) {
    return this.post('/notifications/subscribe', { subscription, user_id: userId || 'guest' });
  },
  async broadcastNotification(title, body, url) {
    return this.post('/notifications/broadcast', { title, body, url });
  },
  async notificationCount() { return this.get('/notifications/count'); },

  // ── Export ────────────────────────────────────────────────
  exportOrders(fmt) { window.open(API_BASE + '/admin/export/orders?fmt=' + fmt, '_blank'); },
  exportWithdrawals(fmt) { window.open(API_BASE + '/admin/export/withdrawals?fmt=' + fmt, '_blank'); },

};
