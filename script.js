(function(){
  "use strict";

  var THEME_KEY = "psucac_v2_theme";
  var THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  var PAGE_SIZE = 8;
  var BUCKET = "intern-photos";
  var MAX_MB = 2;

  var state = {
    records: [], activeYear: "all", editingId: null, editPass: null,
    search: "", deptFilter: "", view: "grid", page: 1
  };
  var pendingPhotoUrl = null;

  function safeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function safeSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (s||"").toString().replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  function showBanner(msg){ var b = el("connBanner"); b.textContent = msg; b.style.display = "block"; }
  function hideBanner(){ el("connBanner").style.display = "none"; }
 function showLoading(){
    var ls = el("loadingState");
    if (ls) ls.style.display = "flex";
    var g = el("grid");
    if (g) g.style.display = "none";
  }
  function hideLoading(){
    var ls = el("loadingState");
    if (ls) ls.style.display = "none";
    var g = el("grid");
    if (g) g.style.display = "";
  }
  /* ---------------- ส่วนติดต่อ Supabase ---------------- */
  function fromRow(x){
    return {
      id: String(x.id),
      name: x.full_name, dept: x.major, uni: x.university,
      school: x.previous_school, start: x.start_date, end: x.end_date,
      unit: x.workplace, year: x.intern_year,
      tasks: x.responsibilities, feeling: x.reflection,
      photoUrl: x.photo_url
    };
  }

  async function loadAll(){
    showLoading();
    var res = await db.from("interns").select("*").order("created_at", { ascending: false });
    if (res.error){ hideLoading(); showBanner("การเชื่อมต่อมีปัญหา: " + res.error.message); return; }
    state.records = res.data.map(fromRow);
    hideBanner();
    render();
    hideLoading();
  }
  async function uploadPhoto(file){
    var ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    var path = crypto.randomUUID() + "." + ext;
    var up = await db.storage.from(BUCKET).upload(path, file);
    if (up.error) throw up.error;
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /* ---------------- หน้าต่างถามรหัสผ่าน ---------------- */
  var passDialog = el("passDialog");
  function askPassword(title){
    return new Promise(function(resolve){
      var done = false;
      var passForm = el("passForm");
      var cancelBtn = el("passCancel");
      el("passTitle").textContent = title;
      el("passInput").value = "";

      function cleanup(){
        passForm.removeEventListener("submit", onSubmit);
        cancelBtn.removeEventListener("click", onCancel);
        passDialog.removeEventListener("cancel", onCancel);
      }
      function finish(v){
        if (done) return;
        done = true;
        cleanup();
        if (passDialog.open) passDialog.close();
        resolve(v);
      }
      function onSubmit(e){ e.preventDefault(); finish(el("passInput").value); }
      function onCancel(){ finish(null); }

      passForm.addEventListener("submit", onSubmit);
      cancelBtn.addEventListener("click", onCancel);
      passDialog.addEventListener("cancel", onCancel);
      passDialog.showModal();
      el("passInput").focus();
    });
  }

  async function removeRecord(id, pass){
    var res = await db.rpc("delete_intern", { p_id: Number(id), p_pass: pass });
    if (res.error){ alert("ลบไม่สำเร็จ: " + res.error.message); return; }
    if (res.data !== true){ alert("รหัสผ่านไม่ถูกต้อง"); return; }
    await loadAll();
  }

  async function requestDelete(id){
    if (!confirm("ลบรายชื่อนี้ออกจากทำเนียบหรือไม่?")) return;
    var pass = await askPassword("กรอกรหัสผ่านเพื่อลบการ์ดนี้");
    if (pass === null) return;
    await removeRecord(id, pass);
  }

  async function requestEdit(record){
    var pass = await askPassword("กรอกรหัสผ่านเพื่อแก้ไขการ์ดนี้");
    if (pass === null) return;
    var res = await db.rpc("check_intern_password", { p_id: Number(record.id), p_pass: pass });
    if (res.error){ alert("ตรวจรหัสไม่สำเร็จ: " + res.error.message); return; }
    if (res.data !== true){ alert("รหัสผ่านไม่ถูกต้อง"); return; }
    openDialog(record, pass);
  }

  /* ---------------- ส่วนแสดงผล ---------------- */
  function initials(name){
    var clean = (name||"").replace(/^(นาย|นางสาว|นาง)\s*/,"").trim();
    var parts = clean.split(/\s+/);
    return (parts[0]?parts[0][0]:"?") + (parts[1]?parts[1][0]:"");
  }
  function placeholderPhoto(name, seed){
    var colors = ["#1B68D1","#2D7DE0","#0F4FA8","#3B8CE6","#124685","#1974C4"];
    var c = colors[(seed||0)%colors.length];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">' +
      '<rect width="200" height="160" fill="'+c+'"/>' +
      '<text x="100" y="94" font-family="Noto Sans Thai, sans-serif" font-size="46" fill="#fff" text-anchor="middle" font-weight="600">'+initials(name)+'</text>' +
      '</svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
  function photoSrc(r){ return r.photoUrl ? r.photoUrl : placeholderPhoto(r.name, 0); }

  function toThaiDate(iso){
    if (!iso) return "-";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return "-";
    return d.getDate() + " " + THAI_MONTHS[d.getMonth()] + " " + (d.getFullYear()+543);
  }
  function durationText(startIso, endIso){
    var s = new Date(startIso+"T00:00:00"), e = new Date(endIso+"T00:00:00");
    if (isNaN(s)||isNaN(e)||e<s) return "-";
    var days = Math.round((e-s)/86400000)+1;
    var weeks = Math.round(days/7);
    if (days >= 60){ return Math.round(days/30) + " เดือน (" + weeks + " สัปดาห์)"; }
    return weeks + " สัปดาห์";
  }

  function getYears(){
    var set = {};
    state.records.forEach(function(r){ set[r.year] = (set[r.year]||0)+1; });
    return Object.keys(set).map(Number).sort(function(a,b){return b-a;}).map(function(y){return {year:y,count:set[y]};});
  }

  function getFilteredList(){
    var years = getYears();
    var maxYear = years.length ? years[0].year : null;
    var list = state.records.slice();
    if (state.activeYear !== "all"){
      list = list.filter(function(r){ return r.year === state.activeYear; });
    }
    if (state.deptFilter){
      list = list.filter(function(r){ return r.dept === state.deptFilter; });
    }
    if (state.search){
      var s = state.search.toLowerCase();
      list = list.filter(function(r){
        return (r.name||"").toLowerCase().indexOf(s) > -1 || (r.dept||"").toLowerCase().indexOf(s) > -1;
      });
    }
    list.sort(function(a,b){ return (a.name||"").localeCompare(b.name||"", "th"); });
    return { list: list, maxYear: maxYear };
  }

  function renderChips(){
    var years = getYears();
    var total = state.records.length;
    var row = el("chipRow");
    var html = '<div class="chip' + (state.activeYear==="all"?' active':'') + '" data-chip="all">ทั้งหมด (' + total + ')</div>';
    years.forEach(function(y){
      html += '<div class="chip' + (state.activeYear===y.year?' active':'') + '" data-chip="' + y.year + '">รุ่น ' + y.year + ' (' + y.count + ')</div>';
    });
    row.innerHTML = html;
    row.querySelectorAll("[data-chip]").forEach(function(chip){
      chip.addEventListener("click", function(){
        var v = chip.getAttribute("data-chip");
        state.activeYear = v === "all" ? "all" : Number(v);
        state.page = 1;
        syncYearSelect();
        render();
      });
    });
  }

  function renderFilterOptions(){
    var depts = Array.from(new Set(state.records.map(function(r){ return r.dept; }).filter(Boolean))).sort();
    var deptSel = el("deptFilter");
    var curDept = state.deptFilter;
    deptSel.innerHTML = '<option value="">🎓 ทุกสาขา</option>' + depts.map(function(d){ return '<option value="'+esc(d)+'">'+esc(d)+'</option>'; }).join("");
    deptSel.value = curDept;

    var years = getYears();
    syncYearSelect(years);
  }
  function syncYearSelect(years){
    years = years || getYears();
    var sel = el("yearFilterSelect");
    sel.innerHTML = '<option value="">📅 ทุกปี</option>' + years.map(function(y){ return '<option value="'+y.year+'">รุ่น '+y.year+'</option>'; }).join("");
    sel.value = state.activeYear === "all" ? "" : String(state.activeYear);
  }

  function infoRow(icon, label, value, clip){
    return '<div class="s-info-row"><span class="ico">'+icon+'</span><span class="txt"><span class="lbl">'+label+'</span><span class="val'+(clip?' clip':'')+'">'+value+'</span></span></div>';
  }

  function cardHtml(r, isCurrentYear, idx){
    var tasksShort = r.tasks ? esc(r.tasks) : '-';
    return (
      '<div class="s-card" data-id="'+r.id+'">' +
        '<div class="s-card-top">' +
          '<span class="s-card-badge">รุ่น '+r.year+'</span>' +
          '<div class="s-card-menu-wrap">' +
            '<button type="button" class="s-card-menu-btn" data-menu-toggle="'+r.id+'">⋯</button>' +
            '<div class="s-card-menu" id="menu-'+r.id+'">' +
              '<button type="button" data-view="'+r.id+'">👁️ ดูรายละเอียด</button>' +
              '<button type="button" data-edit="'+r.id+'">✎ แก้ไข</button>' +
              '<button type="button" class="danger" data-remove="'+r.id+'">🗑️ ลบ</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="s-card-photo"><img src="'+photoSrc(r)+'" alt="'+esc(r.name)+'" loading="lazy"></div>' +
        '<div class="s-card-body">' +
          '<h3 class="s-card-name">'+esc(r.name)+'</h3>' +
          '<div class="s-card-role">นักศึกษาฝึกงาน</div>' +
          '<div class="s-info-grid">' +
            infoRow('🎓','สาขา', esc(r.dept)) +
            infoRow('🏛️','มหาวิทยาลัย', esc(r.uni)) +
            infoRow('📅','ช่วงเวลาฝึกงาน', toThaiDate(r.start)+' – '+toThaiDate(r.end)) +
            infoRow('📍','หน่วยงานที่ฝึก', esc(r.unit)) +
            infoRow('🗓️','ปีที่ฝึกงาน (พ.ศ.)', r.year) +
            infoRow('📝','งานที่ได้รับมอบหมาย', tasksShort, true) +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function detailHtml(r, seq){
    return (
      '<div class="detail-photo">' +
        '<img src="'+photoSrc(r)+'" alt="'+esc(r.name)+'">' +
        '<div class="detail-photo-fade"></div>' +
        '<span class="s-card-badge" style="position:absolute;top:14px;left:16px;">รุ่น '+r.year+'</span>' +
        '<div class="detail-name">'+esc(r.name)+'</div>' +
      '</div>' +
      '<div class="detail-body">' +
        '<p class="detail-id">รหัส · PSU-'+r.year+'-'+String(seq).padStart(2,'0')+'</p>' +
        '<div class="detail-meta">' +
          '<div class="s-info-row"><span class="ico">🎓</span><span class="val">สาขา <b>'+esc(r.dept)+'</b></span></div>' +
          '<div class="s-info-row"><span class="ico">🏛️</span><span class="val">'+esc(r.uni)+'</span></div>' +
          (r.school ? '<div class="s-info-row"><span class="ico">🏫</span><span class="val">มาจาก <b>'+esc(r.school)+'</b></span></div>' : '') +
          '<div class="s-info-row"><span class="ico">📅</span><span class="val">'+toThaiDate(r.start)+' – '+toThaiDate(r.end)+'<br><b>'+durationText(r.start,r.end)+'</b></span></div>' +
          '<div class="s-info-row"><span class="ico">📍</span><span class="val">'+esc(r.unit)+'</span></div>' +
        '</div>' +
        (r.tasks ? '<div class="tasks-box"><span class="label">งานที่ได้รับผิดชอบ</span>'+esc(r.tasks)+'</div>' : '') +
        (r.feeling ? '<div class="quote-box"><span class="label">ความรู้สึกวันที่ฝึกงานจบ</span>"'+esc(r.feeling)+'"</div>' : '') +
      '</div>' +
      '<div class="detail-foot">' +
        '<button type="button" class="btn btn-ghost" data-detail-edit="'+r.id+'">✎ แก้ไข</button>' +
        '<button type="button" class="btn btn-ghost" style="color:var(--danger);border-color:var(--danger);" data-detail-remove="'+r.id+'">🗑️ ลบ</button>' +
      '</div>'
    );
  }

  function render(){
    renderChips();
    renderFilterOptions();

    var result = getFilteredList();
    var fullList = result.list;
    var maxYear = result.maxYear;
    var totalPages = Math.max(1, Math.ceil(fullList.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    var startIdx = (state.page - 1) * PAGE_SIZE;
    var pageList = fullList.slice(startIdx, startIdx + PAGE_SIZE);

    var grid = el("grid");
    grid.className = "grid2" + (state.view === "list" ? " list-mode" : "");

    if (!pageList.length){
      grid.innerHTML = '<div class="empty-state">' +
        '<div class="mark">🌱</div><h3>ไม่พบรายชื่อ</h3>' +
        '<p>ลองเปลี่ยนคำค้นหา หรือกด "เพิ่มข้อมูลเด็กฝึกงาน" เพื่อเริ่มบันทึกคนแรก</p></div>';
      el("pager").innerHTML = "";
      return;
    }

    grid.innerHTML = pageList.map(function(r, i){ return cardHtml(r, r.year === maxYear, startIdx + i + 1); }).join("");
    wireCardEvents(grid);
    renderPager(totalPages);
  }

  function renderPager(totalPages){
    var pager = el("pager");
    if (totalPages <= 1){ pager.innerHTML = ""; return; }
    var html = '<button type="button" data-page="prev" '+(state.page===1?'disabled':'')+'>‹</button>';
    for (var p = 1; p <= totalPages; p++){
      html += '<button type="button" class="'+(p===state.page?'active':'')+'" data-page="'+p+'">'+p+'</button>';
    }
    html += '<button type="button" data-page="next" '+(state.page===totalPages?'disabled':'')+'>›</button>';
    pager.innerHTML = html;
    pager.querySelectorAll("[data-page]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var v = btn.getAttribute("data-page");
        if (v === "prev") state.page = Math.max(1, state.page - 1);
        else if (v === "next") state.page = state.page + 1;
        else state.page = parseInt(v, 10);
        render();
        window.scrollTo({top:0, behavior:"smooth"});
      });
    });
  }

  function closeAllMenus(){
    document.querySelectorAll(".s-card-menu.open").forEach(function(m){ m.classList.remove("open"); });
  }

  function wireCardEvents(grid){
    grid.querySelectorAll("[data-menu-toggle]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        var id = btn.getAttribute("data-menu-toggle");
        var menu = el("menu-" + id);
        var wasOpen = menu.classList.contains("open");
        closeAllMenus();
        if (!wasOpen) menu.classList.add("open");
      });
    });
    grid.querySelectorAll("[data-view]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation(); closeAllMenus();
        openDetail(btn.getAttribute("data-view"));
      });
    });
    grid.querySelectorAll("[data-edit]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation(); closeAllMenus();
        var record = state.records.find(function(r){ return r.id === btn.getAttribute("data-edit"); });
        if (record) requestEdit(record);
      });
    });
    grid.querySelectorAll("[data-remove]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation(); closeAllMenus();
        requestDelete(btn.getAttribute("data-remove"));
      });
    });
    grid.querySelectorAll(".s-card").forEach(function(cardEl){
      cardEl.addEventListener("click", function(){
        openDetail(cardEl.getAttribute("data-id"));
      });
    });
  }
  document.addEventListener("click", closeAllMenus);

  var detailDialog = el("detailDialog");
  el("detailCloseBtn").addEventListener("click", function(){ detailDialog.close(); });

  function openDetail(id){
    var record = state.records.find(function(r){ return r.id === id; });
    if (!record) return;
    var sameYear = state.records.filter(function(r){ return r.year === record.year; })
      .sort(function(a,b){ return (a.name||"").localeCompare(b.name||"", "th"); });
    var seq = sameYear.findIndex(function(r){ return r.id === id; }) + 1;
    el("detailContent").innerHTML = detailHtml(record, seq);
    document.querySelector("#detailContent [data-detail-edit]").addEventListener("click", function(){
      detailDialog.close(); requestEdit(record);
    });
    document.querySelector("#detailContent [data-detail-remove]").addEventListener("click", function(){
      detailDialog.close(); requestDelete(id);
    });
    detailDialog.showModal();
  }

  /* ---------------- Add/Edit dialog ---------------- */
  var dialog = el("internDialog");
  var form = el("internForm");

  function openDialog(record, pass){
    form.reset();
    pendingPhotoUrl = null;
    el("modalStatus").textContent = "";
    el("photoInput").value = "";
    el("photoHint").textContent = "รูปจะถูกเก็บไว้บนเซิร์ฟเวอร์ ทุกคนที่เปิดหน้านี้จะเห็นรูปเดียวกัน";

    // ช่องตั้งรหัส แสดงเฉพาะตอนเพิ่มใหม่
    el("passField").style.display = record ? "none" : "";
    el("f_pass").required = !record;
    el("f_pass").value = "";

    if (record){
      state.editingId = record.id;
      state.editPass = pass;
      el("dialogTitle").textContent = "แก้ไขข้อมูล";
      el("f_name").value = record.name || "";
      el("f_dept").value = record.dept || "";
      el("f_uni").value = record.uni || "";
      el("f_school").value = record.school || "";
      el("f_start").value = record.start || "";
      el("f_end").value = record.end || "";
      el("f_unit").value = record.unit || "";
      el("f_year").value = record.year || "";
      el("f_tasks").value = record.tasks || "";
      el("f_feeling").value = record.feeling || "";
      el("photoPreview").src = photoSrc(record);
    } else {
      state.editingId = null;
      state.editPass = null;
      el("dialogTitle").textContent = "เพิ่มรายชื่อเด็กฝึกงาน";
      el("photoPreview").src = placeholderPhoto("? ?", 0);
      var years = getYears();
      el("f_year").value = (state.activeYear !== "all" ? state.activeYear : (years.length ? years[0].year : new Date().getFullYear()+543));
    }
    dialog.showModal();
  }

  el("openAddBtn").addEventListener("click", function(){ openDialog(); });
  el("closeDialogBtn").addEventListener("click", function(){ dialog.close(); });
  el("cancelBtn").addEventListener("click", function(){ dialog.close(); });

  el("photoInput").addEventListener("change", async function(e){
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024){
      alert("รูปใหญ่เกิน " + MAX_MB + " MB กรุณาเลือกรูปที่เล็กกว่านี้");
      e.target.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev){ el("photoPreview").src = ev.target.result; };
    reader.readAsDataURL(file);

    el("photoHint").textContent = "กำลังอัปโหลดรูป...";
    try{
      pendingPhotoUrl = await uploadPhoto(file);
      el("photoHint").textContent = "อัปโหลดรูปสำเร็จ";
    }catch(err){
      pendingPhotoUrl = null;
      el("photoHint").textContent = "อัปโหลดรูปไม่สำเร็จ: " + (err.message||"");
    }
  });

  form.addEventListener("submit", async function(e){
    e.preventDefault();
    var start = el("f_start").value;
    var end = el("f_end").value;
    var year = parseInt(el("f_year").value, 10);

    if (new Date(end) < new Date(start)){ alert("วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่มฝึกงาน"); return; }
    if (typeof db === "undefined" || !db){ alert("ยังไม่ได้เชื่อมต่อฐานข้อมูล ลองรีโหลดหน้านี้อีกครั้ง"); return; }

    var newPass = el("f_pass").value;
    if (!state.editingId && newPass.length < 6){ alert("รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร"); return; }

    var row = {
      full_name: el("f_name").value.trim(),
      major: el("f_dept").value.trim(),
      university: el("f_uni").value.trim(),
      previous_school: el("f_school").value.trim(),
      start_date: start,
      end_date: end,
      workplace: el("f_unit").value.trim(),
      intern_year: year,
      responsibilities: el("f_tasks").value.trim(),
      reflection: el("f_feeling").value.trim()
    };
    if (pendingPhotoUrl) row.photo_url = pendingPhotoUrl;

    var submitBtn = el("submitBtn");
    submitBtn.disabled = true;
    el("modalStatus").textContent = "กำลังบันทึก...";
    try{
      var res;
      if (state.editingId){
        res = await db.rpc("update_intern", { p_id: Number(state.editingId), p: row, p_pass: state.editPass });
        if (res.error) throw res.error;
        if (res.data !== true) throw new Error("รหัสผ่านไม่ถูกต้อง");
      } else {
        res = await db.rpc("create_intern", { p: row, p_pass: newPass });
        if (res.error) throw res.error;
      }

      state.activeYear = year;
      state.editingId = null; state.editPass = null; pendingPhotoUrl = null;
      dialog.close();
      await loadAll();
    }catch(err){
      el("modalStatus").textContent = "บันทึกไม่สำเร็จ: " + (err.message||"");
    }finally{
      submitBtn.disabled = false;
    }
  });

  /* ---------------- Toolbar wiring ---------------- */
  el("searchInput").addEventListener("input", function(e){
    state.search = e.target.value.trim(); state.page = 1; render();
  });
  el("deptFilter").addEventListener("change", function(e){
    state.deptFilter = e.target.value; state.page = 1; render();
  });
  el("yearFilterSelect").addEventListener("change", function(e){
    state.activeYear = e.target.value ? Number(e.target.value) : "all";
    state.page = 1; render();
  });
  el("gridViewBtn").addEventListener("click", function(){
    state.view = "grid"; el("gridViewBtn").classList.add("active"); el("listViewBtn").classList.remove("active"); render();
  });
  el("listViewBtn").addEventListener("click", function(){
    state.view = "list"; el("listViewBtn").classList.add("active"); el("gridViewBtn").classList.remove("active"); render();
  });

  /* ---------------- Sidebar nav ---------------- */
  document.querySelectorAll("[data-nav]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var nav = btn.getAttribute("data-nav");
      if (nav === "add"){ openDialog(); }
      else if (nav === "home"){
        state.search=""; state.deptFilter=""; state.activeYear="all"; state.page=1;
        el("searchInput").value=""; render();
      } else if (nav === "settings"){
        alert("หน้าตั้งค่ายังไม่พร้อมใช้งานในตอนนี้");
      }
      closeSidebarMobile();
    });
  });

  function closeSidebarMobile(){
    el("sidebar").classList.remove("open");
    el("sidebarBackdrop").classList.remove("open");
  }
  el("menuToggleBtn").addEventListener("click", function(){
    el("sidebar").classList.add("open");
    el("sidebarBackdrop").classList.add("open");
  });
  el("sidebarBackdrop").addEventListener("click", closeSidebarMobile);

  /* ---------------- Theme toggle ---------------- */
  function applyTheme(mode){
    if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(safeGet(THEME_KEY));
  function toggleTheme(){
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : (cur === "light" ? null : "dark");
    applyTheme(next); safeSet(THEME_KEY, next || "");
  }
  el("themeToggle").addEventListener("click", toggleTheme);
  el("themeToggleDesktop").addEventListener("click", toggleTheme);

  /* ---------------- เริ่มทำงาน ---------------- */
   (async function init(){
    showLoading();
    if (typeof db === "undefined" || !db){
      hideLoading();
      render();
      showBanner("ไม่พบการเชื่อมต่อ Supabase — เช็ก config.js และลำดับ <script> ใน index.html");
      return;
    }
    await loadAll();
   })();
})();
