/**
 * hero-storage.js
 * Wrapper IndexedDB siêu nhẹ, thay thế localStorage để lưu trữ mượt mà không giới hạn 5MB.
 * Dùng Native IndexedDB API với Promises.
 */

const DB_NAME = 'HeroMathDB';
const STORE_NAME = 'HeroStore';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject(event.target.error);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
}

/**
 * Lưu dữ liệu vào IndexedDB
 * @param {string} key 
 * @param {any} value - Có thể là chuỗi hoặc object (không cần stringify)
 */
export async function luuDuLieu(key, value) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => {
                // Duy trì bản sao trong localStorage dự phòng để các trang khác đọc được tức thì
                try {
                    const rawVal = typeof value === 'string' ? value : JSON.stringify(value);
                    if (window.__originalSetItem) window.__originalSetItem(key, rawVal);
                    else Storage.prototype.setItem.call(localStorage, key, rawVal);
                } catch(e){}
                resolve(true);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error(`[Hero Storage] Lỗi lưu ${key}:`, err);
        // Fallback: Lưu vào localStorage gốc, tránh vòng lặp đệ quy của monkey patch
        try {
            const rawVal = typeof value === 'string' ? value : JSON.stringify(value);
            if (window.__originalSetItem) window.__originalSetItem(key, rawVal);
            else Storage.prototype.setItem.call(localStorage, key, rawVal);
        } catch(e){}
    }
}

/**
 * Đọc dữ liệu từ IndexedDB
 * @param {string} key 
 * @returns {any} Dữ liệu đã lưu
 */
export async function docDuLieu(key) {
    function readLs() {
        let lsValue = null;
        try {
            lsValue = window.__originalGetItem ? window.__originalGetItem(key) : Storage.prototype.getItem.call(localStorage, key);
        } catch(e) {}
        if (lsValue) {
            try { return JSON.parse(lsValue); } 
            catch(e) { return lsValue; }
        }
        return null;
    }

    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => {
                if (request.result !== undefined) {
                    resolve(request.result);
                } else {
                    resolve(readLs());
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error(`[Hero Storage] Lỗi đọc ${key}:`, err);
        return readLs();
    }
}

/**
 * Xóa dữ liệu
 * @param {string} key 
 */
export async function xoaDuLieu(key) {
    function removeLs() {
        try {
            if (window.__originalRemoveItem) window.__originalRemoveItem(key);
            else Storage.prototype.removeItem.call(localStorage, key);
        } catch(e){}
    }

    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => {
                removeLs();
                resolve(true);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        removeLs();
    }
}
