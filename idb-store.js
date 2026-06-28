// IndexedDB Logout History Store
// 為 game-monitor.js 提供「被登出事件」持久化儲存 + 自訂時間清除
// Usage:
//   await LogoutDB.add(timestamp, mode)
//   const all = await LogoutDB.getAll()
//   const before = await LogoutDB.getBefore(date)
//   await LogoutDB.clearBefore(date)
//   await LogoutDB.clearAll()

(function (global) {
  const DB_NAME = 'gm-panel-db';
  const DB_VERSION = 1;
  const STORE = 'logout_history';

  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('ts', 'ts', { unique: false });
          console.log('[LogoutDB] Created store:', STORE);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return _dbPromise;
  }

  function tx(mode) {
    return openDB().then((db) => {
      const t = db.transaction(STORE, mode);
      return t.objectStore(STORE);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const LogoutDB = {
    /**
     * 新增一筆被登出事件
     * @param {number} ts - 時間戳（ms）
     * @param {string} mode - 模式（可選）
     */
    async add(ts, mode) {
      const store = await tx('readwrite');
      return reqToPromise(store.add({ ts: ts || Date.now(), mode: mode || 'unknown' }));
    },

    /**
     * 取得所有事件（依時間排序，最新在前）
     */
    async getAll() {
      const store = await tx('readonly');
      const all = await reqToPromise(store.getAll());
      return all.sort((a, b) => b.ts - a.ts);
    },

    /**
     * 取得指定日期之前的事件
     * @param {Date|number} before - Date 物件或時間戳
     */
    async getBefore(before) {
      const beforeTs = before instanceof Date ? before.getTime() : before;
      const all = await this.getAll();
      return all.filter((r) => r.ts < beforeTs);
    },

    /**
     * 取得指定日期之後的事件
     */
    async getAfter(after) {
      const afterTs = after instanceof Date ? after.getTime() : after;
      const all = await this.getAll();
      return all.filter((r) => r.ts >= afterTs);
    },

    /**
     * 清除所有事件
     */
    async clearAll() {
      const store = await tx('readwrite');
      return reqToPromise(store.clear());
    },

    /**
     * 清除指定日期及之前的記錄（保留之後的）
     * @param {Date|number} before
     */
    async clearBefore(before) {
      const beforeTs = before instanceof Date ? before.getTime() : before;
      const old = await this.getBefore(beforeTs);
      const store = await tx('readwrite');
      const promises = old.map((r) => reqToPromise(store.delete(r.id)));
      await Promise.all(promises);
      return old.length;
    },

    /**
     * 取得總數
     */
    async count() {
      const store = await tx('readonly');
      return reqToPromise(store.count());
    },

    /**
     * 取得最後一筆（最新被登出時間）
     */
    async last() {
      const all = await this.getAll();
      return all[0] || null;
    }
  };

  global.LogoutDB = LogoutDB;
  console.log('[LogoutDB] Module loaded. DB:', DB_NAME, 'Store:', STORE);
})(typeof window !== 'undefined' ? window : globalThis);
