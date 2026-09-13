# ========================================================================
# Script: fix_admin.ps1
# Mục đích: Sửa lỗi cú pháp, ký tự lỗi UTF-8 và hoàn thiện tính năng AI tự động đọc tên bài học từ ảnh SGK
# ========================================================================

$ErrorActionPreference = 'Stop'
$targetPath = Join-Path $PSScriptRoot 'admin.html'

if (!(Test-Path $targetPath)) {
    Write-Error "Không tìm thấy file: $targetPath"
    exit 1
}

Write-Host "Đang đọc nội dung file admin.html..."
$bytes = [System.IO.File]::ReadAllBytes($targetPath)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false, $false)
$content = $utf8NoBom.GetString($bytes)

Write-Host "Kích thước file ban đầu: $($content.Length) ký tự"

# 1. Thêm id="btn-ai-doc-ten-bai" cho nút bấm AI Đọc Tên Bài nếu chưa có
$oldBtnPattern = '<button type="button" onclick="tuDongDocTenBaiTuAnh()"'
$newBtnPattern = '<button type="button" id="btn-ai-doc-ten-bai" onclick="tuDongDocTenBaiTuAnh()"'
if ($content.Contains($oldBtnPattern) -and !$content.Contains('id="btn-ai-doc-ten-bai"')) {
    $content = $content.Replace($oldBtnPattern, $newBtnPattern)
    Write-Host "-> Đã bổ sung id='btn-ai-doc-ten-bai' cho nút AI Đọc Tên Bài"
}

# 2. Cập nhật hàm themAnhVaoGallery để gọi tự động đọc tên bài với debounce 400ms
$oldGalleryPush = @"
                await luuDanhSachAnhVaoBoNho();
                renderGalleryAnh();
                
                if (danhSachAnhSgk.length === 1) {
                    const inp = document.getElementById('ai-studio-ten-chude');
                    if (inp && !inp.value.trim()) {
                        setTimeout(() => {
                            if (!inp.value.trim() && typeof window.tuDongDocTenBaiTuAnh === 'function') {
                                window.tuDongDocTenBaiTuAnh(true);
                            }
                        }, 500);
                    }
                }
"@

$newGalleryPush = @"
                await luuDanhSachAnhVaoBoNho();
                renderGalleryAnh();
                
                // Tự động kích hoạt AI đọc tên bài học từ ảnh với debounce (chờ nạp hết batch ảnh)
                const inpChude = document.getElementById('ai-studio-ten-chude');
                if (inpChude && (!inpChude.value.trim() || inpChude.dataset.aiAutoFilled === 'true')) {
                    if (window._aiDocTenTimer) clearTimeout(window._aiDocTenTimer);
                    window._aiDocTenTimer = setTimeout(() => {
                        if (typeof window.tuDongDocTenBaiTuAnh === 'function') {
                            window.tuDongDocTenBaiTuAnh(true);
                        }
                    }, 400);
                }
"@

if ($content.Contains($oldGalleryPush)) {
    $content = $content.Replace($oldGalleryPush, $newGalleryPush)
    Write-Host "-> Đã nâng cấp hàm themAnhVaoGallery với debounce thông minh"
}

# 3. Tìm vị trí khối code bị hỏng từ cuối nút xóa ảnh trong gallery đến trước window.thucThiTaoNoiDungAI
$startMarker = @"
                    <button type="button" class="btn-del-thumb" onclick="xoaAnhKhoiGallery(`${idx})" title="Xóa ảnh này">
                        <i class="fa-solid fa-xmark"></i>
"@
$endMarker = "        window.thucThiTaoNoiDungAI = async function() {"

$startIdx = $content.IndexOf($startMarker)
$endIdx = $content.IndexOf($endMarker)

if ($startIdx -ge 0 -and $endIdx -gt $startIdx) {
    Write-Host "-> Tìm thấy vùng code bị lỗi (Vị trí $startIdx đến $endIdx)"

    $cleanBlock = @"
                    <button type="button" class="btn-del-thumb" onclick="xoaAnhKhoiGallery(`${idx})" title="Xóa ảnh này">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `).join('');
        }

        // Xem trước ảnh phóng to (Lightbox)
        window.xemThuAnhPhongTo = function(base64) {
            const modal = document.getElementById('modal-lightbox-anh');
            const img = document.getElementById('lightbox-img-full');
            if (modal && img) {
                img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
                modal.style.display = 'flex';
            }
        };

        window.dongLightboxAnh = function() {
            const modal = document.getElementById('modal-lightbox-anh');
            if (modal) modal.style.display = 'none';
        };

        window.kichHoatChonNhieuFile = function() {
            document.getElementById('inp-admin-ai-files')?.click();
        };

        // ========================================================================
        // HÀM TỰ ĐỘNG ĐỌC TÊN BÀI HỌC / CHỦ ĐỀ TỪ ẢNH SGK BẰNG AI GEMINI
        // Giáo viên chỉ cần chọn Khối lớp và dán ảnh bài học, AI tự đặt tên chính xác!
        // ========================================================================
        window.tuDongDocTenBaiTuAnh = async function(isAuto = false) {
            const inp = document.getElementById('ai-studio-ten-chude');
            const btn = document.getElementById('btn-ai-doc-ten-bai') || document.querySelector('button[onclick*="tuDongDocTenBaiTuAnh"]');
            const khoiSelect = document.getElementById('ai-studio-khoi');
            const khoi = khoiSelect ? khoiSelect.value : 'THCS';

            if (!danhSachAnhSgk || danhSachAnhSgk.length === 0) {
                if (!isAuto) {
                    showToast('Thầy/Cô vui lòng dán (Ctrl+V) hoặc nạp ít nhất 1 ảnh trang sách giáo khoa có chứa tên bài học trước!', 'warning');
                }
                return null;
            }

            const apiKey = layApiKeyGeminiAdmin();
            if (!apiKey) {
                if (!isAuto) {
                    hienThiModalNhapApiKeyAdmin();
                }
                return null;
            }

            // Nếu người dùng đã tự gõ thủ công và đang ở chế độ tự động, giữ nguyên
            if (isAuto && inp && inp.value.trim() && inp.dataset.aiAutoFilled !== 'true') {
                return inp.value.trim();
            }

            const originalBtnHtml = btn ? btn.innerHTML : '';
            const originalPlaceholder = inp ? inp.placeholder : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI đang đọc tên...';
            }
            if (inp) {
                inp.placeholder = `🤖 Đang phân tích tên bài học từ ảnh SGK (${khoi})...`;
                if (!inp.value.trim() || inp.dataset.aiAutoFilled === 'true') {
                    inp.style.borderColor = '#3498db';
                    inp.style.boxShadow = '0 0 10px rgba(52, 152, 219, 0.4)';
                }
            }

            try {
                // Đọc 1-2 trang ảnh đầu tiên để nhận diện bài học
                const anhKiemTra = danhSachAnhSgk.slice(0, 2);
                const parts = [
                    {
                        text: `Bạn là chuyên gia sư phạm Toán học Việt Nam.
Nhiệm vụ: Hãy quan sát kỹ hình ảnh trang sách giáo khoa Toán đính kèm (dành cho ${khoi}) và trích xuất CHÍNH XÁC "TÊN BÀI HỌC / TÊN CHỦ ĐỀ".

Quy tắc xuất kết quả:
1. CHỈ TRẢ VỀ DUY NHẤT một dòng ngắn gọn chứa Tên bài học.
2. Định dạng chuẩn: "Bài [Số]: [Tên bài]" (Ví dụ: "Bài 1: Tập hợp các số hữu tỉ", "Bài 3: Định lý Pythagoras", "Bài 2: Hình chóp tam giác đều"). Nếu là bài ôn tập/thực hành thì ghi đúng như SGK (Ví dụ: "Bài tập cuối chương 2", "Hoạt động thực hành và trải nghiệm").
3. KHÔNG thêm bất kỳ lời dẫn, giải thích, định dạng markdown (\`\`\`), dấu ngoặc kép hay ký tự thừa nào khác.`
                    }
                ];

                for (const img of anhKiemTra) {
                    let cleanBase64 = img.base64;
                    if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1];
                    parts.push({
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: cleanBase64
                        }
                    });
                }

                const modelName = (typeof GEMINI_MODEL_ADMIN !== 'undefined' && GEMINI_MODEL_ADMIN) ? GEMINI_MODEL_ADMIN : "gemini-2.0-flash";
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: parts }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 100
                        }
                    })
                });

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    throw new Error(errJson.error?.message || `HTTP ${response.status}`);
                }

                const resData = await response.json();
                let tenTrichXuat = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

                tenTrichXuat = tenTrichXuat.replace(/^["'`*#]+|["'`*#]+$/g, '').trim();
                tenTrichXuat = tenTrichXuat.replace(/^(Tên bài học|Chủ đề|Tên bài|Bài học):\s*/i, '').trim();

                if (tenTrichXuat && inp) {
                    inp.value = tenTrichXuat;
                    inp.dataset.aiAutoFilled = 'true';
                    inp.style.borderColor = '#2ecc71';
                    inp.style.boxShadow = '0 0 12px rgba(46, 204, 113, 0.6)';
                    setTimeout(() => {
                        if (inp) {
                            inp.style.borderColor = '#2c3a57';
                            inp.style.boxShadow = 'none';
                        }
                    }, 3000);
                    showToast(`🎯 AI đã nhận diện bài học: "${tenTrichXuat}" (${khoi})`, 'success');
                    return tenTrichXuat;
                } else {
                    if (!isAuto) {
                        showToast('AI chưa nhận diện rõ tên bài từ ảnh này. Thầy/Cô có thể gõ trực tiếp nhé!', 'warning');
                    }
                    return null;
                }
            } catch (err) {
                console.warn("[tuDongDocTenBaiTuAnh] Lỗi đọc tên:", err);
                if (!isAuto) {
                    showToast(`Không thể đọc tên bài từ ảnh: ${err.message}`, 'error');
                }
                return null;
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
                if (inp) {
                    inp.placeholder = originalPlaceholder;
                }
            }
        };

        // Khởi tạo sự kiện Kéo thả Dropzone và Dán ảnh Clipboard (Ctrl + V)
        function khoiTaoSuKienDropzoneVaPaste() {
            const dropzone = document.getElementById('admin-ai-dropzone');
            if (dropzone) {
                ['dragenter', 'dragover'].forEach(eventName => {
                    dropzone.addEventListener(eventName, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.add('dragover');
                    }, false);
                });

                ['dragleave', 'drop'].forEach(eventName => {
                    dropzone.addEventListener(eventName, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.remove('dragover');
                    }, false);
                });

                dropzone.addEventListener('drop', async (e) => {
                    const dt = e.dataTransfer;
                    const files = dt ? Array.from(dt.files) : [];
                    const imageFiles = files.filter(f => f.type.startsWith('image/'));
                    if (imageFiles.length === 0) {
                        showToast('Không tìm thấy file hình ảnh nào!', 'warning');
                        return;
                    }
                    showToast(`Đang nạp ${imageFiles.length} ảnh SGK...`, 'info');
                    for (let i = 0; i < imageFiles.length; i++) {
                        await themAnhVaoGallery(imageFiles[i], `Ảnh SGK ${danhSachAnhSgk.length + 1}`);
                    }
                });
            }

            // Lắng nghe sự kiện Paste toàn cục khi đang ở trang Admin
            window.addEventListener('paste', async (e) => {
                const khuAi = document.getElementById('khu-ai-studio');
                const isAiVisible = khuAi && khuAi.offsetParent !== null;

                const targetTag = e.target ? e.target.tagName.toLowerCase() : '';
                const isOtherInput = (targetTag === 'input' || targetTag === 'textarea') && e.target.id !== 'ai-studio-ten-chude' && e.target.id !== 'ai-studio-mota';

                const clipboardData = e.clipboardData || window.clipboardData;
                if (!clipboardData) return;

                const items = clipboardData.items;
                if (!items) return;

                const imageFiles = [];
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if (file) imageFiles.push(file);
                    }
                }

                if (imageFiles.length > 0) {
                    if (isAiVisible || document.activeElement === dropzone || !isOtherInput) {
                        e.preventDefault();
                        showToast(`📋 Đã nhận diện ${imageFiles.length} ảnh từ Clipboard! Đang nạp...`, 'info');
                        for (let i = 0; i < imageFiles.length; i++) {
                            await themAnhVaoGallery(imageFiles[i], `Ảnh Dán ${danhSachAnhSgk.length + 1} (${new Date().toLocaleTimeString('vi-VN')})`);
                        }
                    }
                }
            });

            // Khi người dùng tự tay sửa tên bài, hủy đánh dấu auto để AI không ghi đè
            const inpTen = document.getElementById('ai-studio-ten-chude');
            if (inpTen) {
                inpTen.addEventListener('input', () => {
                    inpTen.dataset.aiAutoFilled = 'false';
                });
            }

            // Khi giáo viên thay đổi Khối lớp và đang có ảnh SGK, tự động cập nhật lại tên bài học
            const selKhoi = document.getElementById('ai-studio-khoi');
            if (selKhoi) {
                selKhoi.addEventListener('change', () => {
                    if (danhSachAnhSgk && danhSachAnhSgk.length > 0) {
                        const inp = document.getElementById('ai-studio-ten-chude');
                        if (inp && (!inp.value.trim() || inp.dataset.aiAutoFilled === 'true')) {
                            showToast(`Đã đổi sang ${selKhoi.value}. AI đang cập nhật lại tên bài học...`, 'info');
                            window.tuDongDocTenBaiTuAnh(true);
                        }
                    }
                });
            }
        }

"@

    $content = $content.Substring(0, $startIdx) + $cleanBlock + $content.Substring($endIdx)
    Write-Host "-> Đã thay thế thành công vùng code bị lỗi bằng khối hàm hoàn chỉnh!"
} else {
    Write-Host "CẢNH BÁO: Không khớp marker vùng lỗi, kiểm tra lại!"
}

# 4. Thay thế model sai gemini-3.6-flash thành model chuẩn gemini-2.0-flash
if ($content.Contains('gemini-3.6-flash')) {
    $content = $content.Replace('gemini-3.6-flash', 'gemini-2.0-flash')
    Write-Host "-> Đã sửa các endpoint gemini-3.6-flash thành gemini-2.0-flash"
}

# 5. Bổ sung tự động đọc tên bài khi bấm nút Tạo nội dung nếu giáo viên để trống tên
$oldCheckTenTatCa = @"
            const khoi = document.getElementById('ai-studio-khoi').value;
            const tenChuDe = document.getElementById('ai-studio-ten-chude').value.trim();
            const moTaThem = document.getElementById('ai-studio-mota').value.trim();

            if (!tenChuDe) {
                showToast("Thầy vui lòng nhập Tên Bài Học / Chủ Đề SGK!", "warning");
                document.getElementById('ai-studio-ten-chude').focus();
                return;
            }
"@

$newCheckTenTatCa = @"
            const khoi = document.getElementById('ai-studio-khoi').value;
            let tenChuDe = document.getElementById('ai-studio-ten-chude').value.trim();
            const moTaThem = document.getElementById('ai-studio-mota').value.trim();

            if (!tenChuDe) {
                if (danhSachAnhSgk.length > 0 && typeof window.tuDongDocTenBaiTuAnh === 'function') {
                    showToast('Đang nhận diện tên bài học từ ảnh SGK...', 'info');
                    tenChuDe = await window.tuDongDocTenBaiTuAnh(true) || '';
                }
                if (!tenChuDe) {
                    showToast("Thầy vui lòng dán ảnh SGK hoặc nhập Tên Bài Học / Chủ Đề!", "warning");
                    document.getElementById('ai-studio-ten-chude').focus();
                    return;
                }
            }
"@

if ($content.Contains($oldCheckTenTatCa)) {
    $content = $content.Replace($oldCheckTenTatCa, $newCheckTenTatCa)
    Write-Host "-> Đã bổ sung fallback tự động nhận diện tên bài cho goiGeminiTaoTatCa4Muc"
}

$oldCheckTenDonLe = @"
            const khoi = document.getElementById('ai-studio-khoi').value;
            const tenChuDe = document.getElementById('ai-studio-ten-chude').value.trim();
            const moTaThem = document.getElementById('ai-studio-mota').value.trim();

            if (!tenChuDe) {
                showToast("Thầy vui lòng nhập Tên Bài Học / Chủ Đề!", "warning");
                document.getElementById('ai-studio-ten-chude').focus();
                return;
            }
"@

$newCheckTenDonLe = @"
            const khoi = document.getElementById('ai-studio-khoi').value;
            let tenChuDe = document.getElementById('ai-studio-ten-chude').value.trim();
            const moTaThem = document.getElementById('ai-studio-mota').value.trim();

            if (!tenChuDe) {
                if (danhSachAnhSgk.length > 0 && typeof window.tuDongDocTenBaiTuAnh === 'function') {
                    showToast('Đang nhận diện tên bài học từ ảnh SGK...', 'info');
                    tenChuDe = await window.tuDongDocTenBaiTuAnh(true) || '';
                }
                if (!tenChuDe) {
                    showToast("Thầy vui lòng dán ảnh SGK hoặc nhập Tên Bài Học / Chủ Đề!", "warning");
                    document.getElementById('ai-studio-ten-chude').focus();
                    return;
                }
            }
"@

if ($content.Contains($oldCheckTenDonLe)) {
    $content = $content.Replace($oldCheckTenDonLe, $newCheckTenDonLe)
    Write-Host "-> Đã bổ sung fallback tự động nhận diện tên bài cho goiGeminiTaoDonLe"
}

# 6. Lưu file lại dưới dạng UTF-8 có BOM để đảm bảo 100% tương thích charset
$utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($targetPath, $content, $utf8WithBom)

Write-Host "HOÀN THÀNH: Đã lưu admin.html thành công dưới định dạng UTF-8 chuẩn!"
