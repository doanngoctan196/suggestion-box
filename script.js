(function(){
  'use strict';

  var els = {
    tabs: document.getElementById('tabs'),
    adminTabBtn: document.getElementById('adminTabBtn'),
    viewSubmit: document.getElementById('view-submit'),
    viewAdmin: document.getElementById('view-admin'),
    form: document.getElementById('form'),
    anonChk: document.getElementById('anonChk'),
    idFields: document.getElementById('idFields'),
    msnv: document.getElementById('msnv'),
    hoten: document.getElementById('hoten'),
    ykien: document.getElementById('ykien'),
    imgBox: document.getElementById('imgBox'),
    vidBox: document.getElementById('vidBox'),
    imgInput: document.getElementById('imgInput'),
    vidInput: document.getElementById('vidInput'),
    imgPreviewWrap: document.getElementById('imgPreviewWrap'),
    vidPreviewWrap: document.getElementById('vidPreviewWrap'),
    imgPreview: document.getElementById('imgPreview'),
    vidPreview: document.getElementById('vidPreview'),
    submitBtn: document.getElementById('submitBtn'),
    formMsg: document.getElementById('formMsg'),
    adminLocked: document.getElementById('adminLocked'),
    adminContent: document.getElementById('adminContent'),
    adminList: document.getElementById('adminList'),
    countPill: document.getElementById('countPill'),
    exportCsvBtn: document.getElementById('exportCsvBtn')
  };

  var state = {
    imgFile: null,
    vidFile: null,
    db: null,
    assets: null,
    user: null,
    downloads: null,
    canEdit: false,
    unsub: null,
    lastDocs: []
  };

  var MAX_BYTES = 20 * 1024 * 1024;

  // ---------- tabs ----------
  els.tabs.addEventListener('click', function(e){
    var btn = e.target.closest('button[data-tab]');
    if(!btn) return;
    var tab = btn.getAttribute('data-tab');
    els.tabs.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b === btn); });
    els.viewSubmit.classList.toggle('active', tab === 'submit');
    els.viewAdmin.classList.toggle('active', tab === 'admin');
    if(tab === 'admin') ensureAdminSubscription();
  });

  // ---------- anonymous toggle ----------
  els.anonChk.addEventListener('change', function(){
    var anon = els.anonChk.checked;
    els.idFields.classList.toggle('hidden-fields', anon);
    els.msnv.disabled = anon;
    els.hoten.disabled = anon;
    if(anon){ els.msnv.value=''; els.hoten.value=''; }
  });

  // ---------- file pickers ----------
  function fmtSize(b){
    if(b < 1024*1024) return Math.round(b/1024) + ' KB';
    return (b/1024/1024).toFixed(1) + ' MB';
  }

  els.imgInput.addEventListener('change', function(){
    var f = els.imgInput.files[0];
    if(!f) return;
    if(f.size > MAX_BYTES){
      showMsg('formMsg','err','Ảnh vượt quá 20MB, vui lòng chọn ảnh khác.');
      els.imgInput.value = '';
      return;
    }
    state.imgFile = f;
    els.imgBox.classList.add('filled');
    var url = URL.createObjectURL(f);
    els.imgPreview.src = url;
    els.imgPreviewWrap.style.display = 'block';
  });

  els.vidInput.addEventListener('change', function(){
    var f = els.vidInput.files[0];
    if(!f) return;
    if(f.size > MAX_BYTES){
      showMsg('formMsg','err','Video vượt quá 20MB, vui lòng chọn video ngắn hơn hoặc nén lại.');
      els.vidInput.value = '';
      return;
    }
    state.vidFile = f;
    els.vidBox.classList.add('filled');
    var url = URL.createObjectURL(f);
    els.vidPreview.src = url;
    els.vidPreviewWrap.style.display = 'block';
  });

  document.querySelectorAll('.clear-file').forEach(function(btn){
    btn.addEventListener('click', function(){
      var which = btn.getAttribute('data-clear');
      if(which === 'img'){
        state.imgFile = null;
        els.imgInput.value = '';
        els.imgBox.classList.remove('filled');
        els.imgPreviewWrap.style.display = 'none';
        els.imgPreview.src = '';
      } else {
        state.vidFile = null;
        els.vidInput.value = '';
        els.vidBox.classList.remove('filled');
        els.vidPreviewWrap.style.display = 'none';
        els.vidPreview.src = '';
      }
    });
  });

  function showMsg(id, kind, text){
    var el = document.getElementById(id);
    el.textContent = text;
    el.className = 'msg show ' + kind;
  }
  function hideMsg(id){
    var el = document.getElementById(id);
    el.className = 'msg';
  }

  function escapeHtml(s){
    return (s || '').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ---------- capability init ----------
  async function initCapabilities(){
    try{
      state.db = await claude.use('db');
    }catch(e){ state.db = null; }
    try{
      state.assets = await claude.use('assets');
    }catch(e){ state.assets = null; }
    try{
      state.user = await claude.use('user');
    }catch(e){ state.user = null; }
    try{
      state.downloads = await claude.use('downloads');
    }catch(e){ state.downloads = null; }

    if(state.user){
      try{
        state.canEdit = await state.user.canEdit();
      }catch(e){ state.canEdit = false; }
    }
    els.adminTabBtn.style.display = state.canEdit ? '' : 'none';
  }

  // ---------- submit ----------
  els.form.addEventListener('submit', async function(e){
    e.preventDefault();
    hideMsg('formMsg');

    var text = els.ykien.value.trim();
    if(!text){
      showMsg('formMsg','err','Vui lòng nhập nội dung ý kiến.');
      return;
    }
    if(!state.db){
      showMsg('formMsg','err','Không thể kết nối kho dữ liệu. Vui lòng tải lại trang.');
      return;
    }

    var anon = els.anonChk.checked;
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = 'Đang gửi...';

    var payload = {
      anonymous: anon,
      msnv: anon ? null : (els.msnv.value.trim() || null),
      hoTen: anon ? null : (els.hoten.value.trim() || null),
      yKien: text,
      imageId: null,
      imageType: null,
      videoId: null,
      videoType: null,
      status: 'moi',
      createdAt: new Date().toISOString()
    };

    try{
      if(state.imgFile){
        if(!state.assets) throw {code:'no_assets', message:'Không có quyền tải tệp lên.'};
        var imgRes = await state.assets.upload(state.imgFile);
        payload.imageId = imgRes.id;
        payload.imageType = imgRes.contentType;
      }
      if(state.vidFile){
        if(!state.assets) throw {code:'no_assets', message:'Không có quyền tải tệp lên.'};
        var vidRes = await state.assets.upload(state.vidFile);
        payload.videoId = vidRes.id;
        payload.videoType = vidRes.contentType;
      }

      await state.db.collection('suggestions').add(payload);

      showMsg('formMsg','ok','Đã gửi ý kiến thành công. Cảm ơn bạn!');
      els.form.reset();
      state.imgFile = null; state.vidFile = null;
      els.imgBox.classList.remove('filled');
      els.vidBox.classList.remove('filled');
      els.imgPreviewWrap.style.display = 'none';
      els.vidPreviewWrap.style.display = 'none';
      els.idFields.classList.remove('hidden-fields');
      els.msnv.disabled = false; els.hoten.disabled = false;

    }catch(err){
      var code = err && err.code;
      var friendly = 'Có lỗi xảy ra, vui lòng thử lại.';
      if(code === 'too_large') friendly = 'Tệp quá lớn, vui lòng chọn tệp nhỏ hơn.';
      else if(code === 'unsupported_type') friendly = 'Định dạng tệp không được hỗ trợ (ảnh: JPG/PNG/WEBP/GIF, video: MP4/WEBM).';
      else if(code === 'not_granted' || code === 'no_assets') friendly = 'Bạn không có quyền tải ảnh/video lên. Ý kiến văn bản vẫn có thể gửi nếu bỏ tệp đính kèm.';
      else if(code === 'quota_exceeded' || code === 'quota_or_state') friendly = 'Hệ thống đã đầy dung lượng lưu trữ. Vui lòng báo quản lý.';
      else if(code === 'invalid_argument') friendly = 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại nội dung.';
      showMsg('formMsg','err', friendly);
      console.error('Submit error:', err);
    }finally{
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = 'Gửi ý kiến';
    }
  });

  // ---------- admin list ----------
  function ensureAdminSubscription(){
    if(!state.canEdit){
      els.adminLocked.style.display = 'block';
      els.adminContent.style.display = 'none';
      return;
    }
    els.adminLocked.style.display = 'none';
    els.adminContent.style.display = 'block';
    if(state.unsub || !state.db) return;

    try{
      state.unsub = state.db.collection('suggestions')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .onSnapshot(function(snap){
          renderAdminList(snap.docs);
        }, function(err){
          console.error('Admin subscription error:', err);
          els.adminList.innerHTML = '<div class="empty-state"><span class="ico">⚠️</span>Không thể tải danh sách ý kiến. Vui lòng tải lại trang.</div>';
        });
    }catch(e){
      console.error('Subscribe failed:', e);
    }
  }

  function timeAgo(iso){
    try{
      var d = new Date(iso);
      return d.toLocaleString('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
    }catch(e){ return ''; }
  }

  function renderAdminList(docs){
    state.lastDocs = docs;
    els.countPill.textContent = docs.length;
    if(docs.length === 0){
      els.adminList.innerHTML = '<div class="empty-state"><span class="ico">📭</span>Chưa có ý kiến nào được gửi.</div>';
      return;
    }
    var html = docs.map(function(doc){
      var d = doc.data() || {};
      var who = d.anonymous
        ? 'Ẩn danh <span class="tag">Anonymous</span>'
        : escapeHtml([d.msnv, d.hoTen].filter(Boolean).join(' — ') || 'Không rõ');
      var media = '';
      if(d.imageId){
        media += '<img src="/_blob/' + d.imageId + '" alt="Ảnh đính kèm" loading="lazy">';
      }
      if(d.videoId){
        media += '<video src="/_blob/' + d.videoId + '" controls preload="metadata"></video>';
      }
      var done = d.status === 'da_xu_ly';
      return '' +
        '<div class="sugg' + (done ? ' done' : '') + '" data-id="' + doc.id + '">' +
          '<div class="sugg-top">' +
            '<div class="sugg-who">' + who + '</div>' +
            '<div class="sugg-time">' + timeAgo(d.createdAt) + '</div>' +
          '</div>' +
          '<div class="sugg-text">' + escapeHtml(d.yKien) + '</div>' +
          '<div class="sugg-media">' + media + '</div>' +
          '<div class="sugg-actions">' +
            '<button type="button" class="mark-btn' + (done ? ' on' : '') + '" data-id="' + doc.id + '" data-done="' + (!done) + '">' +
              (done ? '✓ Đã xử lý' : 'Đánh dấu đã xử lý') +
            '</button>' +
          '</div>' +
        '</div>';
    }).join('');
    els.adminList.innerHTML = html;

    els.adminList.querySelectorAll('.mark-btn').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.getAttribute('data-id');
        var willBeDone = btn.getAttribute('data-done') === 'true';
        btn.disabled = true;
        try{
          await state.db.collection('suggestions').doc(id).update({
            status: willBeDone ? 'da_xu_ly' : 'moi'
          });
        }catch(e){
          console.error('Update status failed:', e);
        }finally{
          btn.disabled = false;
        }
      });
    });
  }

  // ---------- export CSV ----------
  function csvCell(v){
    var s = (v === null || v === undefined) ? '' : String(v);
    s = s.replace(/"/g, '""');
    return '"' + s + '"';
  }

  els.exportCsvBtn.addEventListener('click', async function(){
    if(!state.lastDocs || state.lastDocs.length === 0){
      alert('Chưa có ý kiến nào để xuất.');
      return;
    }
    if(!state.downloads){
      alert('Trình duyệt/phiên bản này chưa hỗ trợ tải file trực tiếp. Vui lòng thử trên trình duyệt Chrome mới nhất.');
      return;
    }
    var header = ['STT','Thời gian','MSNV','Họ tên','Ẩn danh','Ý kiến','Có ảnh đính kèm','Có video đính kèm','Trạng thái'];
    var rows = state.lastDocs.map(function(doc, i){
      var d = doc.data() || {};
      return [
        i + 1,
        timeAgo(d.createdAt),
        d.msnv || '',
        d.hoTen || '',
        d.anonymous ? 'Có' : 'Không',
        d.yKien || '',
        d.imageId ? 'Có' : 'Không',
        d.videoId ? 'Có' : 'Không',
        d.status === 'da_xu_ly' ? 'Đã xử lý' : 'Mới'
      ].map(csvCell).join(',');
    });
    var csv = '\uFEFF' + header.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
    var stamp = new Date().toISOString().slice(0,10);
    try{
      els.exportCsvBtn.disabled = true;
      await state.downloads.save({ filename: 'y-kien-xuong-may-' + stamp + '.csv', data: csv });
    }catch(e){
      console.error('Export CSV failed:', e);
      alert('Không thể tải file lúc này, vui lòng thử lại.');
    }finally{
      els.exportCsvBtn.disabled = false;
    }
  });

  // ---------- boot ----------
  initCapabilities();
})();
