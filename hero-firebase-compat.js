// ========================================================================
// HERO FIREBASE COMPAT - Math Hero Cloud Sync Layer (Vanilla JS)
// Hoạt động 100% không phụ thuộc ES module, tương thích cả giao thức
// file:/// (khi click mở trực tiếp từ máy tính) lẫn http/https (Live Server/Hosting).
// ========================================================================

(function(window) {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyAs2e77AADz0dCMEFUOFDhxBgJi_hjLfvg",
    authDomain: "on-tap-ts-toan9.firebaseapp.com",
    projectId: "on-tap-ts-toan9",
    storageBucket: "on-tap-ts-toan9.firebasestorage.app",
    messagingSenderId: "1049037745598",
    appId: "1:1049037745598:web:6384dedc2c13213ddb9def",
    measurementId: "G-J0YV0VZGH5"
  };

  const CAC_KEY_TOAN_CUC = [
    'math_hero_users_v2',
    'danh_sach_bai_hoc_ly_thuyet',
    'danh_sach_bai_hoc_ly_thuyet_da_xoa',
    'danh_sach_bo_de_trac_nghiem',
    'ngan_hang_de_trac_nghiem',
    'ngan_hang_de_trac_nghiem_da_xoa',
    'ngan_hang_de_boss',
    'ngan_hang_de_boss_da_xoa',
    'ngan_hang_de_vuot_ai',
    'ngan_hang_de_vuot_ai_da_xoa',
    'math_hero_marketplace',
    'math_hero_shop_items',
    'nhat_ky_dang_nhap',
    'so_luot_lam_bai_toi_da',
    'so_luot_boss_toi_da',
    'so_luot_vong_quay_toi_da',
    'so_luot_thach_dau_toi_da',
    'so_luot_vuot_ai_toi_da',
    'danh_sach_yeu_cau_quen_pass',
    'thong_tin_giao_vien_lien_he'
  ];

  const CAC_KEY_MANG_ID = [
    'ngan_hang_de_trac_nghiem',
    'danh_sach_bo_de_trac_nghiem',
    'danh_sach_bai_hoc_ly_thuyet',
    'ngan_hang_de_boss',
    'ngan_hang_de_vuot_ai',
    'danh_sach_yeu_cau_quen_pass'
  ];

  const CAC_TIEN_TO_DU_LIEU_HOC_SINH = [
    'exp_', 'coin_', 'da_quay_', 'avatar_', 'equipped_avatar_',
    'danh_hieu_chinh_', 'danh_hieu_da_mo_', 'khung_avatar_',
    'equipped_border_', 'ruong_do_', 'luot_lam_bai_', 'luot_boss_',
    'luot_vong_quay_', 'luot_thach_dau_', 'luot_vuot_ai_',
    'tien_trinh_vuot_ai_', 'ai_hien_tai_'
  ];

  const CAC_TIEN_TO_CAU_HINH_AI = [
    'ai_config_so_cau_', 'ai_config_thoi_gian_', 'ai_config_diem_qua_ai_',
    'ai_config_exp_thuong_', 'ai_config_coin_thuong_', 'ai_config_noi_dung_goi_y_'
  ];

  function laySafeDocId(ten) {
    return encodeURIComponent(String(ten || '').trim());
  }

  let db = null;
  function getDb() {
    if (db) return db;
    if (window.firebase && typeof window.firebase.initializeApp === 'function') {
      try {
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          window.firebase.initializeApp(firebaseConfig);
        }
        db = window.firebase.firestore();
        return db;
      } catch (e) {
        console.warn("[Hero Firebase Compat] Lỗi khởi tạo Firestore:", e);
      }
    }
    return null;
  }

  // Helper gộp mảng thông minh tôn trọng danh sách đã xóa (tombstones)
  function gopMangTheoId(localRaw, cloudRaw, key) {
    let localArr = [];
    let cloudArr = [];
    try { localArr = JSON.parse(localRaw); } catch(e) {}
    try { cloudArr = JSON.parse(cloudRaw); } catch(e) {}
    if (!Array.isArray(localArr)) localArr = [];
    if (!Array.isArray(cloudArr)) cloudArr = [];

    // Xóa bỏ cờ toàn cục gây lỗi chặn bài học
    if (key === 'danh_sach_bai_hoc_ly_thuyet') {
      localStorage.removeItem('hero_da_xoa_ly_thuyet');
    }

    let dsDaXoa = [];
    try {
      // Đọc đúng tombstone key cho ly_thuyet (tránh nhầm key)
      const rawDaXoa = (key === 'danh_sach_bai_hoc_ly_thuyet')
        ? localStorage.getItem('danh_sach_bai_hoc_ly_thuyet_da_xoa')
        : (localStorage.getItem((key || '') + '_da_xoa') || localStorage.getItem('hero_da_xoa_' + key));
      if (rawDaXoa) dsDaXoa = JSON.parse(rawDaXoa);
    } catch(e) {}
    const daXoaSet = new Set(Array.isArray(dsDaXoa) ? dsDaXoa : []);

    // Lọc bỏ triệt để các mục đã bị xóa theo Tombstone (cả ở Local lẫn Cloud)
    let daXoaTrenCloud = false;
    if (daXoaSet.size > 0) {
      const truocLocal = localArr.length;
      const truocCloud = cloudArr.length;
      localArr = localArr.filter(x => x && x.id && !daXoaSet.has(x.id));
      cloudArr = cloudArr.filter(x => x && x.id && !daXoaSet.has(x.id));
      if (cloudArr.length !== truocCloud || localArr.length !== truocLocal) {
        daXoaTrenCloud = true;
      }
    }

    if (cloudArr.length === 0) {
      return { merged: localArr, hasNewLocal: localArr.length > 0 || daXoaTrenCloud };
    }
    // Kể cả khi localArr rỗng, tombstone đã lọc cloudArr ở trên → an toàn tuyệt đối
    if (localArr.length === 0) {
      return { merged: cloudArr, hasNewLocal: daXoaTrenCloud };
    }

    const layMoc = (item) => (item && typeof item.capNhatLuc === 'number') ? item.capNhatLuc : 0;
    const cloudMap = new Map(cloudArr.filter(x => x && x.id).map(x => [x.id, x]));
    let hasNewLocal = daXoaTrenCloud;
    const merged = [];
    const daXuLy = new Set();

    localArr.forEach(item => {
      if (!item || !item.id) return;
      daXuLy.add(item.id);
      const cloudItem = cloudMap.get(item.id);

      if (!cloudItem) {
        merged.push(item);
        hasNewLocal = true;
      } else if (layMoc(item) > layMoc(cloudItem)) {
        merged.push(item);
        hasNewLocal = true;
      } else {
        merged.push(cloudItem);
      }
    });

    cloudArr.forEach(item => {
      if (item && item.id && !daXuLy.has(item.id)) {
        merged.push(item);
      }
    });

    return { merged, hasNewLocal };
  }

  function gopTaiKhoanHocSinh(localRaw, cloudRaw) {
    let localUsers = {};
    let cloudUsers = {};
    try { localUsers = JSON.parse(localRaw); } catch(e) {}
    try { cloudUsers = JSON.parse(cloudRaw); } catch(e) {}
    if (typeof localUsers !== 'object' || localUsers === null) localUsers = {};
    if (typeof cloudUsers !== 'object' || cloudUsers === null) cloudUsers = {};

    const merged = Object.assign({}, cloudUsers, localUsers);
    const hasNewLocal = Object.keys(localUsers).some(k => !cloudUsers[k]);
    return { merged, hasNewLocal };
  }

  // API Đồng Bộ
  const CompatSync = {
    isReady: function() {
      return !!getDb();
    },

    taiDuLieuTuMay: async function(tenHocSinh) {
      const firestore = getDb();
      if (!firestore || !tenHocSinh) return;
      try {
        const snap = await firestore.collection("mathhero_students").doc(laySafeDocId(tenHocSinh)).get();
        if (snap.exists) {
          const duLieu = snap.data() || {};
          Object.keys(duLieu).forEach(key => {
            if (key.startsWith('_')) return;
            localStorage.setItem(key, duLieu[key]);
          });
        }
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi tải dữ liệu học sinh:", loi);
      }
    },

    dayDuLieuLenMay: async function(tenHocSinh) {
      const firestore = getDb();
      if (!firestore || !tenHocSinh) return;
      try {
        const goiDuLieu = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const thuocVe = CAC_TIEN_TO_DU_LIEU_HOC_SINH.some(tt => key === tt + tenHocSinh);
          if (thuocVe) {
            goiDuLieu[key] = localStorage.getItem(key);
          }
        }
        goiDuLieu['_lop'] = sessionStorage.getItem('hoc_school_student_class') || '';
        goiDuLieu['_lopCuThe'] = sessionStorage.getItem('hoc_school_student_classroom') || '';
        goiDuLieu['_capNhatLanCuoi'] = new Date().toISOString();

        await firestore.collection("mathhero_students").doc(laySafeDocId(tenHocSinh)).set(goiDuLieu, { merge: true });
        console.log("[Hero Firebase Compat] Đã đẩy dữ liệu học sinh lên Cloud:", tenHocSinh);
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi đẩy dữ liệu học sinh:", loi);
      }
    },

    taiToanBoHocSinhTuMay: async function() {
      const firestore = getDb();
      if (!firestore) return [];
      try {
        const snapAll = await firestore.collection("mathhero_students").get();
        const ketQua = [];
        snapAll.forEach(docSnap => {
          ketQua.push({ id: decodeURIComponent(docSnap.id), data: docSnap.data() });
        });
        return ketQua;
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi tải toàn bộ học sinh:", loi);
        return [];
      }
    },

    xoaHocSinhTrenMay: async function(tenHocSinh) {
      const firestore = getDb();
      if (!firestore || !tenHocSinh) return;
      try {
        await firestore.collection("mathhero_students").doc(laySafeDocId(tenHocSinh)).delete();
        console.log("[Hero Firebase Compat] Đã xóa học sinh trên Cloud:", tenHocSinh);
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi xóa học sinh:", loi);
      }
    },

    taiCauHinhToanCuc: async function() {
      const firestore = getDb();
      if (!firestore) return;
      try {
        // GIAI ĐOẠN 1: Tải và gộp tất cả các Tombstone key (*_da_xoa) TRƯỚC TIÊN
        // Đảm bảo local đã có đầy đủ danh sách ID đã xóa trước khi gộp dữ liệu
        const tombstoneKeys = CAC_KEY_TOAN_CUC.filter(k => k.endsWith('_da_xoa'));
        await Promise.all(tombstoneKeys.map(async (key) => {
          try {
            const snap = await firestore.collection("mathhero_global").doc(key).get();
            const localVal = localStorage.getItem(key);
            let localArr2 = [];
            let cloudArr2 = [];
            try { localArr2 = JSON.parse(localVal || '[]'); } catch(e2) {}
            if (snap.exists && snap.data().value !== undefined) {
              try { cloudArr2 = JSON.parse(snap.data().value || '[]'); } catch(e2) {}
            }
            if (!Array.isArray(localArr2)) localArr2 = [];
            if (!Array.isArray(cloudArr2)) cloudArr2 = [];
            const unionSet = new Set([...localArr2, ...cloudArr2]);
            const mergedArr = Array.from(unionSet);

            localStorage.setItem(key, JSON.stringify(mergedArr));
            if (mergedArr.length !== cloudArr2.length || localArr2.some(id => !cloudArr2.includes(id))) {
              CompatSync.dayCauHinhToanCuc(key).catch(function() {});
            }
          } catch(e) {}
        }));

        // GIAI ĐOẠN 2: Tải và gộp các key cấu hình và mảng dữ liệu
        const dataKeys = CAC_KEY_TOAN_CUC.filter(k => !k.endsWith('_da_xoa'));
        const promises = dataKeys.map(async (key) => {
          try {
            const snap = await firestore.collection("mathhero_global").doc(key).get();
            const localVal = localStorage.getItem(key);

            if (snap.exists && snap.data().value !== undefined) {
              const cloudVal = snap.data().value;
              if (CAC_KEY_MANG_ID.includes(key)) {
                const { merged, hasNewLocal } = gopMangTheoId(localVal, cloudVal, key);
                localStorage.setItem(key, JSON.stringify(merged));
                if (hasNewLocal) {
                  CompatSync.dayCauHinhToanCuc(key).catch(function() {});
                }
              } else if (key === 'math_hero_users_v2') {
                const { merged, hasNewLocal } = gopTaiKhoanHocSinh(localVal, cloudVal);
                localStorage.setItem(key, JSON.stringify(merged));
                if (hasNewLocal) {
                  CompatSync.dayCauHinhToanCuc(key).catch(function() {});
                }
              } else {
                localStorage.setItem(key, cloudVal);
              }
            } else {
              if (localVal && localVal.trim() && localVal !== '[]' && localVal !== '{}') {
                CompatSync.dayCauHinhToanCuc(key).catch(function() {});
              }
            }
          } catch(e) {}
        });

        await Promise.all(promises);

        // Nạp ai_config_tat_ca
        try {
          const snapAi = await firestore.collection("mathhero_global").doc("ai_config_tat_ca").get();
          if (snapAi.exists) {
            const duLieuAi = snapAi.data() || {};
            Object.keys(duLieuAi).forEach(k => {
              if (k === '_capNhatLanCuoi') return;
              localStorage.setItem(k, duLieuAi[k]);
            });
          }
        } catch(e){}

        console.log("[Hero Firebase Compat] Đã đồng bộ cấu hình Cloud thành công.");
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi tải cấu hình toàn cục:", loi);
      }
    },

    dayCauHinhToanCuc: async function(tenKey) {
      const firestore = getDb();
      if (!firestore || !tenKey) return;
      try {
        const laKeyAiConfig = CAC_TIEN_TO_CAU_HINH_AI.some(tt => tenKey.startsWith(tt));
        if (laKeyAiConfig) {
          const payload = {};
          payload[tenKey] = localStorage.getItem(tenKey);
          payload['_capNhatLanCuoi'] = new Date().toISOString();
          await firestore.collection("mathhero_global").doc("ai_config_tat_ca").set(payload, { merge: true });
        } else {
          await firestore.collection("mathhero_global").doc(tenKey).set({
            value: localStorage.getItem(tenKey),
            _capNhatLanCuoi: new Date().toISOString()
          });
        }
        console.log("[Hero Firebase Compat] Đã đẩy cấu hình lên Cloud:", tenKey);
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi đẩy cấu hình lên Cloud:", tenKey, loi);
      }
    },

    // Ghi đè thẳng Firebase với giá trị tùy chỉnh (BYPASS localStorage & merge)
    // Dùng để xóa trắng dữ liệu cũ không phải do mình tạo
    forceGhiDeFirebase: async function(collection, docId, data) {
      const firestore = getDb();
      if (!firestore) throw new Error('Firebase chưa sẵn sàng');
      await firestore.collection(collection).doc(docId).set(data);
      console.log('[Hero Firebase Compat] Force ghi đè Firebase:', collection, '/', docId);
    },

    // Ghi nhật ký hoạt động (luyện tập, boss, vượt ải) tương thích hoàn toàn
    ghiNhatKyHoatDong: async function(tenHocSinh, loaiHoatDong, soCauDung, soCauSai, expNhan) {
      if (!tenHocSinh) return;
      const firestore = getDb();
      if (!firestore) return;
      try {
        const homNayISO = new Date().toISOString().slice(0, 10);
        const lop = sessionStorage.getItem('hoc_school_student_class') || localStorage.getItem('hoc_school_student_class') || '';
        const lopCuThe = sessionStorage.getItem('hoc_school_student_classroom') || localStorage.getItem('hoc_school_student_classroom') || '';
        const docId = laySafeDocId(tenHocSinh) + '_' + homNayISO;
        const inc = firebase.firestore.FieldValue.increment;

        const capNhat = {
          ten: tenHocSinh,
          lop,
          lopCuThe,
          ngay: homNayISO,
          soCauDung: inc(Math.max(0, soCauDung || 0)),
          soCauSai: inc(Math.max(0, soCauSai || 0)),
          expNhan: inc(Math.max(0, expNhan || 0)),
          soLuot: inc(1),
          _capNhatLanCuoi: new Date().toISOString()
        };
        if (loaiHoatDong) {
          capNhat['soLuot_' + loaiHoatDong] = inc(1);
        }

        await firestore.collection("mathhero_activity_log").doc(docId).set(capNhat, { merge: true });
        console.log("[Hero Firebase Compat] Đã ghi nhật ký hoạt động:", tenHocSinh, loaiHoatDong);
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi khi ghi nhật ký hoạt động:", loi);
      }
    },

    taiNhatKyHoatDong: async function(tuNgayISO, denNgayISO) {
      const firestore = getDb();
      if (!firestore) return [];
      try {
        const snap = await firestore.collection("mathhero_activity_log")
          .where("ngay", ">=", tuNgayISO)
          .where("ngay", "<=", denNgayISO)
          .get();
        const ketQua = [];
        snap.forEach(docSnap => ketQua.push(docSnap.data()));
        return ketQua;
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi khi tải nhật ký hoạt động:", loi);
        return [];
      }
    },

    taiBaiTuLuanTrongKhoang: async function(tuNgayISO, denNgayISO) {
      const firestore = getDb();
      if (!firestore) return [];
      try {
        const tuISOFull = tuNgayISO + 'T00:00:00.000Z';
        const denISOFull = denNgayISO + 'T23:59:59.999Z';
        const snap = await firestore.collection("bai_tap_tu_luan")
          .where("thoiGianNop", ">=", tuISOFull)
          .where("thoiGianNop", "<=", denISOFull)
          .get();
        const ketQua = [];
        snap.forEach(docSnap => ketQua.push(docSnap.data()));
        return ketQua;
      } catch (loi) {
        console.warn("[Hero Firebase Compat] Lỗi khi tải bài tập tự luận:", loi);
        return [];
      }
    }
  };

  // Gán vào biến toàn cục window
  window.HeroFirebaseCompat = CompatSync;
  if (!window.FirebaseSync) {
    window.FirebaseSync = CompatSync;
    window.firebaseSyncSan = true;
  }

  // Tự động nạp mô-đun AI Studio nâng cao cho trang Quản Trị (admin.html)
  if (typeof document !== 'undefined') {
    const href = (window.location && window.location.href) ? window.location.href.toLowerCase() : '';
    const isTrangAdmin = href.includes('admin') || 
                         (typeof document.title === 'string' && document.title.toLowerCase().includes('quản trị')) ||
                         !!document.getElementById('khu-ai-studio');
    if (isTrangAdmin) {
      if (document.readyState === 'loading') {
        // Dùng document.write để script nạp ĐỒNG BỘ ngay trong <head>, đảm bảo toàn bộ hàm AI Studio sẵn sàng trước khi body tải xong
        document.write('<script id="hero-ai-studio-script" src="./hero-ai-studio.js"><\/script>');
      } else if (!document.getElementById('hero-ai-studio-script')) {
        const sc = document.createElement('script');
        sc.id = 'hero-ai-studio-script';
        sc.src = './hero-ai-studio.js';
        (document.head || document.documentElement).appendChild(sc);
      }
    }
  }
})(window);
