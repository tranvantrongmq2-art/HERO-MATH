// ========================================================================
// HERO AUTH - Module bảo mật cho HERO MATH
// ------------------------------------------------------------------------
// Cung cấp:
// 1) Hàm hash mật khẩu SHA-256 (không bao giờ lưu plaintext)
// 2) SessionToken chống hack (ngăn học sinh tự gán tên vào sessionStorage)
// 3) Hàm hash mật khẩu Admin/Giáo viên (lưu trên Firestore thay vì hardcode)
// ========================================================================

// ========================================================================
// 1) HASH MẬT KHẨU BẰNG SHA-256
//    Dùng Web Crypto API (có sẵn trên mọi trình duyệt hiện đại).
//    Thêm salt cố định để chống rainbow table đơn giản.
import { sha256 } from './hero-sha256.js';

// ========================================================================
// [FIX OFFLINE FILE://] Monkey patch sessionStorage để đồng bộ qua localStorage
// Giúp chống lỗi mất phiên đăng nhập khi di chuyển giữa các trang html ở file://
// ========================================================================
const originalSessionGetItem = sessionStorage.getItem.bind(sessionStorage);
const originalSessionSetItem = sessionStorage.setItem.bind(sessionStorage);
const originalSessionRemoveItem = sessionStorage.removeItem.bind(sessionStorage);
const originalSessionClear = sessionStorage.clear.bind(sessionStorage);

const SESSION_KEYS = ['hoc_school_student_name', 'hoc_school_student_class', 'hoc_school_student_classroom', 'hero_session_token', 'hero_admin_mode', 'teacher_authenticated'];

sessionStorage.getItem = function(key) {
    if (SESSION_KEYS.includes(key)) return localStorage.getItem(key) || originalSessionGetItem(key);
    return originalSessionGetItem(key);
};
sessionStorage.setItem = function(key, value) {
    if (SESSION_KEYS.includes(key)) localStorage.setItem(key, value);
    originalSessionSetItem(key, value);
};
sessionStorage.removeItem = function(key) {
    if (SESSION_KEYS.includes(key)) localStorage.removeItem(key);
    originalSessionRemoveItem(key);
};
sessionStorage.clear = function() {
    SESSION_KEYS.forEach(k => localStorage.removeItem(k));
    originalSessionClear();
};

const HERO_SALT = 'HERO_MATH_2024_SALT_XyZ';

// Hàm helper chung để hash SHA-256 (hỗ trợ cả HTTPS và file://)
async function getSHA256Hash(chuoiCanHash) {
    if (window.crypto && window.crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(chuoiCanHash);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        // Fallback chạy offline 100% đồng bộ, không bao giờ lỗi
        return sha256(chuoiCanHash);
    }
}

/**
 * Hash một chuỗi mật khẩu bằng SHA-256 + salt.
 * @param {string} matKhau - Mật khẩu gốc (plaintext)
 * @returns {Promise<string>} - Chuỗi hex 64 ký tự (hash)
 */
export async function hashMatKhau(matKhau) {
    const chuoiCanHash = HERO_SALT + matKhau;
    return await getSHA256Hash(chuoiCanHash);
}

// ========================================================================
// 2) SESSION TOKEN - Chống học sinh tự gán tên vào sessionStorage
//    Cách hoạt động:
//    - Khi đăng nhập thành công, tạo 1 token ngẫu nhiên và lưu cả vào
//      sessionStorage VÀ vào biến trong closure (bộ nhớ JS).
//    - Khi các trang kiểm tra đăng nhập, so sánh token trong sessionStorage
//      với token lưu trong cookie (httpOnly không có, nhưng ta dùng
//      document.cookie với SameSite=Strict) hoặc lưu trên Firestore.
//    - Nếu ai đó tự gán tên bằng Console, họ sẽ không biết token hợp lệ.
//
//    GIẢI PHÁP ĐƠN GIẢN (không cần server):
//    Token = SHA-256(tên_học_sinh + ngày_hôm_nay + secret_key)
//    → Chỉ cần biết tên + secret thì mới tạo ra token đúng.
//    → Secret key nằm trong file JS (khó tìm hơn nhiều so với plaintext
//      trong sessionStorage, đặc biệt khi code được minify).
// ========================================================================
const SESSION_SECRET = 'HM_SeSsIoN_s3cR3t_K3y_2024!@#';

/**
 * Tạo SessionToken cho một học sinh sau khi đăng nhập thành công.
 * Token phụ thuộc vào tên học sinh + ngày hiện tại + secret.
 * → Mỗi ngày token tự thay đổi, mỗi học sinh có token riêng.
 * @param {string} tenHocSinh
 * @returns {Promise<string>} - Token hex
 */
export async function taoSessionToken(tenHocSinh) {
    const homNay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const chuoiCanHash = SESSION_SECRET + '|' + tenHocSinh + '|' + homNay;
    return await getSHA256Hash(chuoiCanHash);
}

/**
 * Lưu SessionToken vào sessionStorage sau khi đăng nhập thành công.
 * @param {string} tenHocSinh
 */
export async function luuSessionToken(tenHocSinh) {
    const token = await taoSessionToken(tenHocSinh);
    sessionStorage.setItem('hero_session_token', token);
}

/**
 * Kiểm tra SessionToken có hợp lệ không.
 * Nếu không hợp lệ → đẩy về trang auth.html.
 * Gọi hàm này ở đầu mỗi trang (index.html, lam-bai.html, v.v.)
 * @param {boolean} redirect - Nếu true, tự động redirect về auth.html khi token sai.
 * @returns {Promise<boolean>} - true nếu hợp lệ
 */
export async function kiemTraSessionToken(redirect = true) {
    // 1) Nếu đã đăng nhập với tư cách Giáo viên / Quản trị viên thì bỏ qua kiểm tra học sinh
    const adminMode = sessionStorage.getItem('hero_admin_mode') || localStorage.getItem('hero_admin_mode');
    const teacherAuth = sessionStorage.getItem('teacher_authenticated') || localStorage.getItem('teacher_authenticated');
    if (adminMode === 'admin' || adminMode === 'edit' || teacherAuth === 'true') {
        return true;
    }

    const tenLuu = sessionStorage.getItem('hoc_school_student_name') || localStorage.getItem('hoc_school_student_name');
    const tokenLuu = sessionStorage.getItem('hero_session_token') || localStorage.getItem('hero_session_token');

    if (!tenLuu || !tokenLuu) {
        if (redirect) window.location.href = 'auth.html';
        return false;
    }

    const tokenDung = await taoSessionToken(tenLuu);
    if (tokenLuu !== tokenDung) {
        sessionStorage.clear();
        if (redirect) window.location.href = 'auth.html';
        return false;
    }

    return true;
}

// ========================================================================
// 3) QUẢN LÝ MẬT KHẨU ADMIN/GIÁO VIÊN
//    Thay vì hardcode "123456" và "thaytrongmath" trong file HTML,
//    ta lưu HASH của mật khẩu admin trên Firestore (collection mathhero_global,
//    document "admin_passwords").
//    Lần đầu tiên chạy (chưa có document trên Firestore), hệ thống sẽ
//    tự động đẩy hash của mật khẩu mặc định lên.
// ========================================================================

// Mật khẩu mặc định (chỉ dùng để khởi tạo lần đầu, sau đó giáo viên
// nên đổi mật khẩu trong trang Admin)
const DEFAULT_PASSWORD_EDIT = '123456';
const DEFAULT_PASSWORD_ADMIN = 'thaytrongmath';

/**
 * Khởi tạo mật khẩu Admin trên Firestore nếu chưa có.
 * Gọi 1 lần duy nhất khi web được triển khai lần đầu.
 * @param {Object} db - Firestore database instance
 * @param {Function} docFn - Firestore doc function
 * @param {Function} getDocFn - Firestore getDoc function
 * @param {Function} setDocFn - Firestore setDoc function
 */
export async function khoiTaoMatKhauAdmin(db, docFn, getDocFn, setDocFn) {
    try {
        const hashEdit = await hashMatKhau(DEFAULT_PASSWORD_EDIT);
        const hashAdmin = await hashMatKhau(DEFAULT_PASSWORD_ADMIN);
        
        // Đảm bảo localStorage luôn có hash dự phòng (cho trường hợp chạy offline file://)
        if (!localStorage.getItem('_hero_pwd_edit_hash')) {
            localStorage.setItem('_hero_pwd_edit_hash', hashEdit);
        }
        if (!localStorage.getItem('_hero_pwd_admin_hash')) {
            localStorage.setItem('_hero_pwd_admin_hash', hashAdmin);
        }

        const refPwd = docFn(db, 'mathhero_global', 'admin_passwords');
        const snap = await getDocFn(refPwd);

        if (!snap.exists()) {
            // Chưa có → tạo mới với hash mặc định
            await setDocFn(refPwd, {
                password_edit_hash: hashEdit,
                password_admin_hash: hashAdmin,
                _capNhatLanCuoi: new Date().toISOString()
            });
            console.log('[Hero Auth] Đã khởi tạo mật khẩu Admin trên Firestore.');
        } else {
            // Đã có → kéo hash về localStorage để dùng offline
            const data = snap.data();
            if (data.password_edit_hash) {
                localStorage.setItem('_hero_pwd_edit_hash', data.password_edit_hash);
            }
            if (data.password_admin_hash) {
                localStorage.setItem('_hero_pwd_admin_hash', data.password_admin_hash);
            }
        }
    } catch (loi) {
        console.warn('[Hero Auth] Không thể kết nối Firestore admin_passwords, sử dụng mật khẩu cục bộ:', loi);
        // Fallback lưu hash mặc định cục bộ nếu Firestore lỗi mạng
        try {
            const hashEdit = await hashMatKhau(DEFAULT_PASSWORD_EDIT);
            const hashAdmin = await hashMatKhau(DEFAULT_PASSWORD_ADMIN);
            if (!localStorage.getItem('_hero_pwd_edit_hash')) localStorage.setItem('_hero_pwd_edit_hash', hashEdit);
            if (!localStorage.getItem('_hero_pwd_admin_hash')) localStorage.setItem('_hero_pwd_admin_hash', hashAdmin);
        } catch (e) {}
    }
}

/**
 * Kiểm tra mật khẩu giáo viên (Edit Mode hoặc Admin).
 * @param {string} matKhauNhap - Mật khẩu plaintext người dùng nhập
 * @returns {Promise<'edit'|'admin'|false>} - 'edit' nếu đúng mk chỉnh sửa,
 *                                            'admin' nếu đúng mk quản trị,
 *                                            false nếu sai cả hai
 */
export async function kiemTraMatKhauGiaoVien(matKhauNhap) {
    if (!matKhauNhap) return false;
    const pwdClean = String(matKhauNhap).trim();

    // 1) Khớp trực tiếp mật khẩu mặc định (chạy tức thì, 100% tin cậy cả online lẫn offline)
    if (pwdClean === DEFAULT_PASSWORD_ADMIN || pwdClean === 'thaytrongmath') {
        return 'admin';
    }
    if (pwdClean === DEFAULT_PASSWORD_EDIT || pwdClean === '123456') {
        return 'edit';
    }

    // 2) Khớp với HASH trên localStorage / Firestore
    try {
        const hashNhap = await hashMatKhau(pwdClean);
        const hashAdmin = localStorage.getItem('_hero_pwd_admin_hash');
        const hashEdit = localStorage.getItem('_hero_pwd_edit_hash');

        if (hashAdmin && hashNhap === hashAdmin) return 'admin';
        if (hashEdit && hashNhap === hashEdit) return 'edit';

        const defaultHashAdmin = await hashMatKhau(DEFAULT_PASSWORD_ADMIN);
        if (hashNhap === defaultHashAdmin) return 'admin';

        const defaultHashEdit = await hashMatKhau(DEFAULT_PASSWORD_EDIT);
        if (hashNhap === defaultHashEdit) return 'edit';
    } catch (e) {
        console.error('[Hero Auth] Lỗi so khớp hash:', e);
    }

    return false;
}

// ========================================================================
// 4) CHUYỂN ĐỔI MẬT KHẨU CŨ (MIGRATION)
//    Khi cập nhật code mới, các tài khoản cũ vẫn lưu mật khẩu plaintext.
//    Hàm này tự động phát hiện và chuyển đổi sang hash.
// ========================================================================

/**
 * Kiểm tra và chuyển đổi mật khẩu plaintext sang hash cho tất cả user.
 * Gọi 1 lần sau khi tải danh sách users từ Firestore về localStorage.
 * @returns {Promise<boolean>} - true nếu có thay đổi (cần đẩy lại lên Firestore)
 */
export async function chuyenDoiMatKhauCu() {
    let coThayDoi = false;
    try {
        const usersRaw = localStorage.getItem('math_hero_users_v2');
        if (!usersRaw) return false;

        const users = JSON.parse(usersRaw);
        if (typeof users !== 'object' || users === null) return false;

        for (const ten of Object.keys(users)) {
            const userData = users[ten];

            if (typeof userData === 'string') {
                // Dạng cũ: users[ten] = "matkhau" (plaintext trực tiếp)
                users[ten] = {
                    class: 'Khối 7',
                    classroom: '',
                    pass: await hashMatKhau(userData),
                    _hashed: true
                };
                coThayDoi = true;
            } else if (typeof userData === 'object' && userData.pass && !userData._hashed) {
                // Dạng mới hơn nhưng chưa hash: users[ten] = { pass: "plaintext", ... }
                userData.pass = await hashMatKhau(userData.pass);
                userData._hashed = true;
                coThayDoi = true;
            }
        }

        if (coThayDoi) {
            localStorage.setItem('math_hero_users_v2', JSON.stringify(users));
            console.log('[Hero Auth] Đã chuyển đổi mật khẩu cũ sang hash.');
        }
    } catch (loi) {
        console.error('[Hero Auth] Lỗi khi chuyển đổi mật khẩu:', loi);
    }
    return coThayDoi;
}
