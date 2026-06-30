// ========================================================================
// FIREBASE SYNC LAYER - MATH HERO (Mức 1: đồng bộ localStorage <-> Firestore)
// ------------------------------------------------------------------------
// File này KHÔNG thay thế localStorage. Mọi hàm game cũ (exp_, coin_,
// luot_lam_bai_, ruong_do_, ...) vẫn đọc/ghi localStorage như trước,
// không cần sửa logic game. File này làm 4 việc:
//
//   DỮ LIỆU THEO TỪNG HỌC SINH (exp, coin, lượt chơi, rương đồ...):
//   1) taiDuLieuTuMay(tenHocSinh)   -> kéo dữ liệu Firestore VỀ localStorage
//      (gọi lúc đăng nhập xong, TRƯỚC khi sang trang index.html)
//   2) dayDuLieuLenMay(tenHocSinh)  -> gom localStorage của học sinh đó,
//      ĐẨY LÊN Firestore (gọi sau khi cộng EXP/Xu, dùng vật phẩm, v.v.)
//
//   DỮ LIỆU TOÀN CỤC (ngân hàng đề, cấu hình giáo viên, shop, marketplace...):
//   3) taiCauHinhToanCuc()          -> kéo TẤT CẢ dữ liệu toàn cục về localStorage
//      (gọi ở đầu mỗi trang, TRƯỚC khi trang đọc localStorage để hiển thị/lọc đề)
//   4) dayCauHinhToanCuc(tenKey)    -> đẩy 1 key toàn cục cụ thể lên Firestore
//      (gọi ngay sau khi giáo viên lưu đề/cấu hình/shop ở admin.html, cua-hang.html)
// ========================================================================

// !!! CONFIG THẬT - Project "ON TAP TS TOAN9" (dùng GỘP CHUNG cho cả Math Hero) !!!
// Lưu ý: dùng collection riêng "mathhero_students" (không phải "students") để KHÔNG
// trộn lẫn với các collection ôn thi Toán 9 đã có sẵn (question_sets, questions, results, reviews, study_docs).
const firebaseConfig = {
  apiKey: "AIzaSyAs2e77AADz0dCMEFUOFDhxBgJi_hjLfvg",
  authDomain: "on-tap-ts-toan9.firebaseapp.com",
  projectId: "on-tap-ts-toan9",
  storageBucket: "on-tap-ts-toan9.firebasestorage.app",
  messagingSenderId: "1049037745598",
  appId: "1:1049037745598:web:6384dedc2c13213ddb9def",
  measurementId: "G-J0YV0VZGH5"
};

// ------------------------------------------------------------------------
// Khởi tạo Firebase (dùng CDN module, không cần npm/build tool)
// ------------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, getDocs, collection, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// ------------------------------------------------------------------------
// DANH SÁCH CÁC KEY localStorage TOÀN CỤC (không gắn theo học sinh cụ thể).
// Đây là dữ liệu/cấu hình do GIÁO VIÊN tạo ra (ngân hàng đề, số lượt tối đa,
// shop, marketplace, nhật ký đăng nhập...), cần giống nhau trên MỌI máy.
// Mỗi key này được lưu thành 1 document RIÊNG trong collection "mathhero_global"
// (tách riêng từng key, không gộp 1 document, để tránh chạm giới hạn 1MB/document
// của Firestore khi ngân hàng đề có nhiều câu hỏi).
// ------------------------------------------------------------------------
const CAC_KEY_TOAN_CUC = [
  'math_hero_users_v2',
  'danh_sach_bai_hoc_ly_thuyet',
  'danh_sach_bo_de_trac_nghiem',
  'ngan_hang_de_trac_nghiem',
  'ngan_hang_de_boss',
  'ngan_hang_de_vuot_ai',
  'math_hero_marketplace',
  'math_hero_shop_items',
  'nhat_ky_dang_nhap',
  'so_luot_lam_bai_toi_da',
  'so_luot_boss_toi_da',
  'so_luot_vong_quay_toi_da',
  'so_luot_thach_dau_toi_da',
  'so_luot_vuot_ai_toi_da'
];

// ------------------------------------------------------------------------
// DANH SÁCH CÁC TIỀN TỐ KEY localStorage thuộc về 1 học sinh cụ thể.
// Mỗi key thực tế trong localStorage có dạng: tienTo + tenHocSinh
// (ví dụ "exp_Trần Văn Trong"). Khi đồng bộ, ta quét đúng các tiền tố này.
// (Cập nhật theo toàn bộ dự án thực tế, gồm cả hệ thống Boss, Vòng Quay,
//  Thách Đấu Đối Kháng, Vượt Ải Tuần và các thẻ đặc quyền của từng hệ thống.)
// ------------------------------------------------------------------------
const CAC_TIEN_TO_DU_LIEU_HOC_SINH = [
  // EXP & Xu (lõi hệ thống điểm số)
  'exp_', 'coin_',
  // Lượt chơi mỗi ngày/mỗi tuần theo từng chế độ
  'luot_lam_bai_', 'luot_boss_', 'luot_vong_quay_', 'luot_thach_dau_', 'luot_vuot_ai_',
  // Cờ cũ tương thích ngược (vòng quay đời đầu)
  'da_quay_',
  // Rương đồ vật phẩm cá nhân (mua từ Cửa Hàng)
  'ruong_do_',
  // Thẻ đặc quyền dùng cho "Nhiệm Vụ Hôm Nay" (lam-bai.html)
  'hero_x2exp_stack_', 'hero_5050_stack_', 'hero_rutgon_stack_', 'hero_cohoi2_stack_',
  'hero_x2exp_', 'hero_5050_', 'hero_rutgon_', 'hero_cohoi2_',
  // Thẻ đặc quyền dùng riêng cho "Vượt Ải Tuần" (vuot-ai-tuan.html)
  'va_khienmiensai_', 'va_khoidau_', 'va_mientruluot_', 'va_nhandoi_', 'va_tangthoigian_',
  // Trạng thái đã vượt qua từng Ải (Vượt Ải Tuần) - tiền tố dạng tuan1_aiX_clear_
  'tuan1_ai1_clear_', 'tuan1_ai2_clear_', 'tuan1_ai3_clear_'
];

// Tiền tố riêng cho cấu hình mỗi "Ải" (ai_config_so_cau_1, ai_config_thoi_gian_2,...).
// Đây KHÔNG gắn theo học sinh, mà theo số thứ tự Ải -> coi là toàn cục,
// nhưng vì số lượng Ải có thể thay đổi (không cố định danh sách key), ta xử lý
// riêng bằng cách quét theo TIỀN TỐ ngay trong lúc đồng bộ toàn cục (xem dưới).
const CAC_TIEN_TO_CAU_HINH_AI = ['ai_config_so_cau_', 'ai_config_thoi_gian_'];

// Tên document Firestore an toàn không chứa dấu "/" (Firestore cấm ký tự này trong ID)
function laySafeDocId(tenHocSinh) {
  return encodeURIComponent(tenHocSinh);
}

// ========================================================================
// 1) KÉO DỮ LIỆU TỪ FIRESTORE VỀ localStorage
//    Gọi ngay sau khi đăng nhập/đăng ký thành công, TRƯỚC khi chuyển trang.
// ========================================================================
export async function taiDuLieuTuMay(tenHocSinh) {
  if (!tenHocSinh) return;
  try {
    const refHocSinh = doc(db, "mathhero_students", laySafeDocId(tenHocSinh));
    const snap = await getDoc(refHocSinh);

    if (!snap.exists()) {
      // Học sinh mới hoàn toàn trên Firestore (lần đầu đồng bộ) -> không có gì để kéo về, giữ nguyên localStorage hiện tại.
      return;
    }

    const duLieu = snap.data();
    // duLieu có dạng { "exp_Trần Văn Trong": 120, "coin_Trần Văn Trong": 80, "ruong_do_...": "[...]", ... }
    Object.keys(duLieu).forEach(key => {
      // Bỏ qua field metadata nội bộ (nếu có)
      if (key === '_capNhatLanCuoi') return;
      localStorage.setItem(key, duLieu[key]);
    });

    console.log("[Firebase Sync] Đã tải dữ liệu của", tenHocSinh, "về máy.");
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi tải dữ liệu:", loi);
    // Lỗi mạng/Firestore -> không chặn học sinh, vẫn cho chơi tiếp với dữ liệu localStorage hiện có.
  }
}

// ========================================================================
// 2) ĐẨY DỮ LIỆU TỪ localStorage LÊN FIRESTORE
//    Gọi sau mỗi hành động quan trọng: cộng EXP/Xu, dùng vật phẩm,
//    mua/bán trên chợ, hết lượt làm bài, v.v.
// ========================================================================
export async function dayDuLieuLenMay(tenHocSinh) {
  if (!tenHocSinh) return;
  try {
    const goiDuLieu = {};

    // Quét toàn bộ localStorage, chỉ lấy các key thuộc đúng học sinh này
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const thuocVeHocSinhNay = CAC_TIEN_TO_DU_LIEU_HOC_SINH.some(tienTo => key === tienTo + tenHocSinh);
      if (thuocVeHocSinhNay) {
        goiDuLieu[key] = localStorage.getItem(key);
      }
    }

    // Ghi thêm thông tin lớp/khối hiện tại (để admin/bảng xếp hạng tra cứu được)
    goiDuLieu['_lop'] = sessionStorage.getItem('hoc_school_student_class') || '';
    goiDuLieu['_lopCuThe'] = sessionStorage.getItem('hoc_school_student_classroom') || '';
    goiDuLieu['_capNhatLanCuoi'] = new Date().toISOString();

    const refHocSinh = doc(db, "mathhero_students", laySafeDocId(tenHocSinh));
    await setDoc(refHocSinh, goiDuLieu, { merge: true });

    console.log("[Firebase Sync] Đã đẩy dữ liệu của", tenHocSinh, "lên máy chủ.");
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi đẩy dữ liệu:", loi);
    // Lỗi mạng -> dữ liệu vẫn an toàn trong localStorage, lần đồng bộ sau sẽ thử lại.
  }
}

// ========================================================================
// 3) (Dùng cho bang-xep-hang.html / admin.html) TẢI TOÀN BỘ HỌC SINH
//    Vì 1 máy chỉ có localStorage của riêng học sinh đó, các trang cần
//    xem TẤT CẢ học sinh (bảng xếp hạng, quản trị) phải gọi hàm này để
//    lấy danh sách đầy đủ từ Firestore, KHÔNG dùng localStorage.
// ========================================================================
export async function taiToanBoHocSinhTuMay() {
  try {
    const snapAll = await getDocs(collection(db, "mathhero_students"));
    const ketQua = [];
    snapAll.forEach(docSnap => {
      ketQua.push({ id: decodeURIComponent(docSnap.id), data: docSnap.data() });
    });
    return ketQua;
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi tải toàn bộ học sinh:", loi);
    return [];
  }
}

// ========================================================================
// 4) KÉO TOÀN BỘ DỮ LIỆU/CẤU HÌNH TOÀN CỤC VỀ localStorage
//    (ngân hàng đề, số lượt tối đa, shop, marketplace, nhật ký đăng nhập...)
//    Gọi ở ĐẦU MỖI TRANG (trước khi trang đó đọc localStorage để hiển thị),
//    để đảm bảo máy đang mở luôn có dữ liệu mới nhất giáo viên đã nạp ở máy khác.
// ========================================================================
export async function taiCauHinhToanCuc() {
  try {
    // 4a) Các key cố định (ngân hàng đề, shop, cấu hình lượt...)
    const promises = CAC_KEY_TOAN_CUC.map(async (key) => {
      const refKey = doc(db, "mathhero_global", key);
      const snap = await getDoc(refKey);
      if (snap.exists() && snap.data().value !== undefined) {
        localStorage.setItem(key, snap.data().value);
      }
    });
    await Promise.all(promises);

    // 4b) Các key động theo số Ải (ai_config_so_cau_1, ai_config_thoi_gian_2, ...)
    // Lưu trong 1 document riêng "ai_config_tat_ca" dạng map { "ai_config_so_cau_1": "10", ... }
    const refAiConfig = doc(db, "mathhero_global", "ai_config_tat_ca");
    const snapAi = await getDoc(refAiConfig);
    if (snapAi.exists()) {
      const duLieuAi = snapAi.data();
      Object.keys(duLieuAi).forEach(key => {
        if (key === '_capNhatLanCuoi') return;
        localStorage.setItem(key, duLieuAi[key]);
      });
    }

    console.log("[Firebase Sync] Đã tải cấu hình toàn cục về máy.");
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi tải cấu hình toàn cục:", loi);
    // Lỗi mạng -> vẫn cho trang chạy tiếp với dữ liệu localStorage hiện có (có thể cũ).
  }
}

// ========================================================================
// 5) ĐẨY 1 KEY TOÀN CỤC CỤ THỂ LÊN FIRESTORE
//    Gọi ngay sau khi giáo viên lưu thay đổi ở admin.html / cua-hang.html
//    (ví dụ sau khi luuBoDeKieuVanBan(), luuSoLuotLamBai(), luuBangGiaMoi()...).
//    Tham số tenKey phải là 1 trong CAC_KEY_TOAN_CUC, hoặc 1 key động dạng
//    "ai_config_so_cau_X" / "ai_config_thoi_gian_X" (sẽ tự định tuyến đúng chỗ).
// ========================================================================
export async function dayCauHinhToanCuc(tenKey) {
  if (!tenKey) return;
  try {
    const laKeyAiConfig = CAC_TIEN_TO_CAU_HINH_AI.some(tienTo => tenKey.startsWith(tienTo));

    if (laKeyAiConfig) {
      // Ghi merge vào document chung "ai_config_tat_ca"
      const refAiConfig = doc(db, "mathhero_global", "ai_config_tat_ca");
      await setDoc(refAiConfig, {
        [tenKey]: localStorage.getItem(tenKey),
        _capNhatLanCuoi: new Date().toISOString()
      }, { merge: true });
    } else {
      // Ghi vào document riêng của đúng key đó
      const refKey = doc(db, "mathhero_global", tenKey);
      await setDoc(refKey, {
        value: localStorage.getItem(tenKey),
        _capNhatLanCuoi: new Date().toISOString()
      });
    }

    console.log("[Firebase Sync] Đã đẩy cấu hình toàn cục:", tenKey);
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi đẩy cấu hình toàn cục:", tenKey, loi);
  }
}

// ========================================================================
// 6) XÓA HOÀN TOÀN 1 HỌC SINH TRÊN FIRESTORE
//    Gọi khi giáo viên bấm "Xóa học sinh" ở admin.html / cua-hang.html.
// ========================================================================
export async function xoaHocSinhTrenMay(tenHocSinh) {
  if (!tenHocSinh) return;
  try {
    const refHocSinh = doc(db, "mathhero_students", laySafeDocId(tenHocSinh));
    await deleteDoc(refHocSinh);
    console.log("[Firebase Sync] Đã xóa học sinh trên máy chủ:", tenHocSinh);
  } catch (loi) {
    console.error("[Firebase Sync] Lỗi khi xóa học sinh:", loi);
  }
}
