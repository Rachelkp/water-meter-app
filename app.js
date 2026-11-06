(function(){
'use strict';
/* ---------- constants & helpers ---------- */
var TH_M=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var TH_S=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var DEF_SET={org:'',recorder:'',inspector:'',inspectorTitle:'',rate:5,fee:5,billTitle:'ใบเสร็จรับเงินค่าน้ำประปา',billFooter:'',signature:''};
var S={customers:[],months:{},settings:Object.assign({},DEF_SET),ym:null,tab:'entry',q:'',filter:'all',moo:'',
  ready:{c:false,m:false,s:false},db:undefined,canWrite:true,downloads:null,hist:'',chartMode:'units',confirm:null};
var $root=document.getElementById('root'),$layer=document.getElementById('layer');

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function nf(n,d){return (n==null||isNaN(n))?'–':Number(n).toLocaleString('en-US',{minimumFractionDigits:d||0,maximumFractionDigits:d||0})}
function ymParts(ym){var a=ym.split('-');return {y:+a[0],m:+a[1]}}
function ymLabel(ym){var p=ymParts(ym);return TH_M[p.m-1]+' '+p.y}
function ymShort(ym){var p=ymParts(ym);return TH_S[p.m-1]+String(p.y).slice(2)}
function ymAdd(ym,n){var p=ymParts(ym),t=p.y*12+(p.m-1)+n;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0')}
function fmtDate(iso){if(!iso)return '–';var a=iso.split('-');return (+a[2])+' '+TH_M[+a[1]-1]+' '+(+a[0]+543)}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function sortedYms(){return Object.keys(S.months).sort()}
function toast(msg,kind){var t=document.createElement('div');t.className='toast'+(kind==='bad'?' bad':'');t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},kind==='bad'?5000:2600)}

function bahtText(n){
  n=Math.round(n*100)/100;if(!(n>0))return 'ศูนย์บาทถ้วน';
  var D=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'],U=['','สิบ','ร้อย','พัน','หมื่น','แสน'];
  function six(s){var o='',L=s.length;for(var i=0;i<L;i++){var d=+s[i],p=L-i-1;if(!d)continue;
    if(p===0){o+=(d===1&&L>1)?'เอ็ด':D[d]}else if(p===1){o+=(d===1?'':d===2?'ยี่':D[d])+'สิบ'}else{o+=D[d]+U[p]}}return o}
  function read(i){var s=String(i),parts=[];while(s.length>6){parts.unshift(s.slice(-6));s=s.slice(0,-6)}parts.unshift(s);
    return parts.map(function(x,k){return (+x?six(String(+x)):'')+(k<parts.length-1?'ล้าน':'')}).join('')}
  var b=Math.floor(n),st=Math.round((n-b)*100),o=b>0?read(b)+'บาท':'';
  o+=st?read(st)+'สตางค์':'ถ้วน';return o}

/* ---------- data model ---------- */
function custList(){return S.customers.slice().sort(function(a,b){return (a.ord||0)-(b.ord||0)})}
function monthRate(ym){var m=S.months[ym];return m&&m.rate!=null?+m.rate:+S.settings.rate}
function prevYmWithData(ym){var ys=sortedYms().filter(function(y){return y<ym});return ys.length?ys[ys.length-1]:null}
function rowFor(ym,cid){
  var m=S.months[ym],r=m&&m.rows&&m.rows[cid];
  if(r)return {p:+r.p||0,c:r.c==null?null:+r.c,f:r.f==null?+S.settings.fee:+r.f,n:r.n||'',exists:true};
  var pm=prevYmWithData(ym),p=0;
  if(pm){var pr=S.months[pm].rows&&S.months[pm].rows[cid];if(pr)p=pr.c!=null?+pr.c:+pr.p||0}
  return {p:p,c:null,f:+S.settings.fee,n:'',exists:false};
}
function used(r){return r.c==null?null:r.c-r.p}
function money(ym,r){var u=used(r);if(u==null||u<0)return {w:null,t:null};var w=u*monthRate(ym);return {w:w,t:w+r.f}}
function visibleCusts(ym){var m=S.months[ym],ys=sortedYms(),isLast=!ys.length||ym>=ys[ys.length-1];return custList().filter(function(c){var has=m&&m.rows&&m.rows[c.id];return has||(isLast&&c.active!==false)})}
function avgPrev(ym,cid){
  var ys=sortedYms().filter(function(y){return y<ym}).slice(-3),s=0,n=0;
  ys.forEach(function(y){var r=S.months[y].rows&&S.months[y].rows[cid];if(r&&r.c!=null){s+=r.c-r.p;n++}});return n?s/n:null}
function status(ym,cid,r){
  var u=used(r);if(u==null)return null;
  if(u<0)return {k:'bad',t:'เลขหลังน้อยกว่าเลขก่อน'};
  var a=avgPrev(ym,cid);
  if(a!=null&&u>a*2.5&&u-a>=10)return {k:'warn',t:'ใช้มากกว่าปกติ (เฉลี่ย '+nf(a,0)+')'};
  return null}
function monthTotals(ym){
  var m=S.months[ym]||{rows:{}},t={n:0,cnt:0,units:0,water:0,fee:0,total:0,notes:0};
  var list=visibleCusts(ym);t.cnt=list.length;
  list.forEach(function(c){var r=rowFor(ym,c.id);if(r.n)t.notes++;var mm=money(ym,r);
    if(mm.t!=null){t.n++;t.units+=used(r);t.water+=mm.w;t.fee+=r.f;t.total+=mm.t}});
  return t}
function receiptNo(ym,cid){var i=custList().findIndex(function(c){return c.id===cid});return ym.replace('-','')+'-'+String(i+1).padStart(3,'0')}

/* ---------- db layer ---------- */
var queues={};
function dbWrite(path,fn){
  var prev=queues[path]||Promise.resolve();
  var p=prev.catch(function(){}).then(function(){return fn().catch(function(e){
    if(e&&e.code==='unavailable'){return new Promise(function(r){setTimeout(r,500+Math.random()*500)}).then(fn)}throw e})});
  queues[path]=p;
  p.catch(function(e){toast('บันทึกไม่สำเร็จ: '+((e&&e.message)||e),'bad')});return p}
function saveSettings(obj){S.settings=Object.assign({},S.settings,obj);return dbWrite('settings/main',function(){return S.db.doc('settings/main').set(S.settings)})}
function ensureMonth(ym){
  if(S.months[ym])return Promise.resolve();
  var pm=prevYmWithData(ym),prevDate=pm?S.months[pm].cur:'';
  var doc={ym:ym,prev:prevDate||'',cur:todayISO(),rate:+S.settings.rate,note:'',rows:{}};
  S.months[ym]=doc;
  return dbWrite('months/'+ym,function(){return S.db.doc('months/'+ym).set(doc)})}
function patchRow(ym,cid,patch){
  var base=rowFor(ym,cid),row=Object.assign({p:base.p,c:base.c,f:base.f,n:base.n},patch);
  return ensureMonth(ym).then(function(){
    var m=JSON.parse(JSON.stringify(S.months[ym]));m.rows=m.rows||{};m.rows[cid]=row;S.months[ym]=m;
    var upd={rows:{}};upd.rows[cid]=row;
    return dbWrite('months/'+ym,function(){return S.db.doc('months/'+ym).update(upd)})})}
function patchMonth(ym,patch){
  return ensureMonth(ym).then(function(){
    var m=Object.assign({},S.months[ym],patch);S.months[ym]=m;
    return dbWrite('months/'+ym,function(){return S.db.doc('months/'+ym).update(patch)})})}
function removeRow(ym,cid){
  var m=JSON.parse(JSON.stringify(S.months[ym]));delete m.rows[cid];S.months[ym]=m;
  return dbWrite('months/'+ym,function(){return S.db.doc('months/'+ym).set(m)})}
function saveCustomer(c){
  var i=S.customers.findIndex(function(x){return x.id===c.id});
  if(i>=0)S.customers[i]=c;else S.customers.push(c);
  return dbWrite('customers/'+c.id,function(){return S.db.doc('customers/'+c.id).set(c)})}

/* ---------- icons ---------- */
var IC={
 drop:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2"/></svg>',
 edit:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
 bill:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
 note:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H9l-5 4z"/></svg>',
 xls:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v3h16v-3"/></svg>',
 plus:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
 chev:function(d){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(d<0?'M15 5l-7 7 7 7':'M9 5l7 7-7 7')+'"/></svg>'},
 x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- render ---------- */
var raf=0;
function render(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;doRender()})}
function doRender(){
  var act=document.activeElement,keep=null;
  if(act&&act.dataset&&act.dataset.cid&&$root.contains(act)&&act.tagName==='INPUT'){keep={cid:act.dataset.cid,v:act.value,s:act.selectionStart,e:act.selectionEnd}}
  var ready=S.ready.c&&S.ready.m&&S.ready.s;
  if(S.db===undefined){$root.innerHTML='<div class="loading">กำลังโหลดข้อมูล…</div>';return}
  if(S.db===null){$root.innerHTML='<div class="loading">ต้องเปิดแอปนี้ในบัญชีที่ลงชื่อเข้าใช้ เพื่อบันทึกข้อมูลร่วมกัน</div>';return}
  if(!ready){$root.innerHTML='<div class="loading">กำลังโหลดข้อมูล…</div>';return}
  if(!S.ym||(!S.months[S.ym]&&sortedYms().length)){var ys=sortedYms();S.ym=ys.length?ys[ys.length-1]:ymFromToday()}
  $root.innerHTML=shell()+'<div class="wrap">'+(S.tab==='entry'?viewEntry():S.tab==='summary'?viewSummary():S.tab==='custs'?viewCusts():viewSettings())+'</div>';
  if(keep){var el=$root.querySelector('input[data-cid="'+keep.cid+'"]');if(el&&el.value!==keep.v){el.value=keep.v}
    if(el&&(act&&act.dataset.cid===keep.cid)){el.focus();try{el.setSelectionRange(keep.s,keep.e)}catch(e){}}}
}
function ymFromToday(){var d=new Date();return (d.getFullYear()+543)+'-'+String(d.getMonth()+1).padStart(2,'0')}

function shell(){
  var tabs=[['entry','จดมิเตอร์'],['summary','สรุปย้อนหลัง'],['custs','ผู้ใช้น้ำ'],['settings','ตั้งค่า']];
  return '<header class="top"><div class="top-in"><div class="brand">'+IC.drop+'<div><b>จดมิเตอร์น้ำประจำเดือน</b><span>'+esc(S.settings.org||'ตั้งชื่อหน่วยงานได้ที่แท็บตั้งค่า')+'</span></div></div></div>'
   +'<nav class="tabs" role="tablist">'+tabs.map(function(t){return '<button class="tab" role="tab" data-tab="'+t[0]+'" aria-selected="'+(S.tab===t[0])+'">'+t[1]+'</button>'}).join('')+'</nav></header>'
   +(S.canWrite?'':'<div class="wrap"><div class="ro">บัญชีนี้ดูข้อมูลได้อย่างเดียว ไม่สามารถบันทึกหรือแก้ไขได้</div></div>')}

function monthSelect(){
  var ys=sortedYms().slice().reverse();if(ys.indexOf(S.ym)<0)ys.unshift(S.ym);
  return '<select id="ymSel" aria-label="เลือกเดือน">'+ys.map(function(y){return '<option value="'+y+'"'+(y===S.ym?' selected':'')+'>'+ymLabel(y)+'</option>'}).join('')+'</select>'}

function viewEntry(){
  var ym=S.ym,m=S.months[ym],t=monthTotals(ym),list=visibleCusts(ym);
  var latest=sortedYms().slice(-1)[0],canNext=S.canWrite&&(!latest||ym===latest);
  var moos=Array.from(new Set(list.map(function(c){return c.moo}))).sort(function(a,b){return a-b});
  var q=S.q.trim().toLowerCase();
  var rows=list.map(function(c,i){return {c:c,i:i,r:rowFor(ym,c.id)}}).filter(function(x){
    if(q&&x.c.name.toLowerCase().indexOf(q)<0)return false;
    if(S.moo&&String(x.c.moo)!==S.moo)return false;
    if(S.filter==='pending')return x.r.c==null;
    if(S.filter==='note')return !!x.r.n;
    if(S.filter==='alert')return !!status(ym,x.c.id,x.r);
    return true});
  var pct=t.cnt?Math.round(t.n/t.cnt*100):0;
  var h='<div class="monthbar"><div class="ttl"><button class="icon-btn" data-act="mprev" aria-label="เดือนก่อนหน้า">'+IC.chev(-1)+'</button>'+monthSelect()
   +'<button class="icon-btn" data-act="mnext" aria-label="เดือนถัดไป">'+IC.chev(1)+'</button></div>'
   +'<div class="dates">จดครั้งก่อน <b>'+fmtDate(m&&m.prev)+'</b> · จดครั้งนี้ <b>'+fmtDate(m&&m.cur)+'</b> · อัตรา <b>'+nf(monthRate(ym),2)+'</b> บาท/หน่วย</div>'
   +'<div class="sp"></div><div class="toolbar">'
   +(S.canWrite?'<button class="btn" data-act="msettings">'+IC.edit+'ตั้งค่าเดือนนี้</button>':'')
   +(canNext?'<button class="btn" data-act="newmonth">'+IC.plus+'เริ่มเดือนถัดไป</button>':'')
   +'<button class="btn" data-act="billall"'+(t.n?'':' disabled')+'>'+IC.bill+'พิมพ์บิลทั้งเดือน</button>'
   +'<button class="btn pri" data-act="xlsmonth"'+(list.length?'':' disabled')+'>'+IC.xls+'ส่งออก Excel</button></div></div>';
  if(m&&m.note)h+='<div class="panel" style="padding:10px 14px;margin-bottom:12px;font-size:14px"><b>หมายเหตุประจำเดือน:</b> '+esc(m.note)+'</div>';
  h+='<div class="panel strip"><div><small>จดแล้ว</small><strong class="num">'+t.n+'<span class="unit">/ '+t.cnt+' ราย</span></strong><div class="bar"><i style="width:'+pct+'%"></i></div></div>'
   +'<div><small>น้ำที่ใช้รวม</small><strong class="num">'+nf(t.units)+'<span class="unit">ลบ.ม.</span></strong></div>'
   +'<div><small>ค่าน้ำ</small><strong class="num">'+nf(t.water)+'<span class="unit">บาท</span></strong></div>'
   +'<div><small>ค่าธรรมเนียม</small><strong class="num">'+nf(t.fee)+'<span class="unit">บาท</span></strong></div>'
   +'<div class="total"><small>รวมเงินทั้งสิ้น</small><strong class="num">'+nf(t.total)+'<span class="unit">บาท</span></strong></div></div>';
  h+='<div class="filters"><input type="text" id="q" placeholder="ค้นหาชื่อผู้ใช้น้ำ" value="'+esc(S.q)+'" aria-label="ค้นหาชื่อ">'
   +'<div class="seg" role="group" aria-label="กรอง">'+[['all','ทั้งหมด'],['pending','ยังไม่จด'],['alert','ผิดปกติ'],['note','มีหมายเหตุ']].map(function(f){return '<button data-filter="'+f[0]+'" aria-pressed="'+(S.filter===f[0])+'">'+f[1]+'</button>'}).join('')+'</div>'
   +'<select id="mooSel" aria-label="หมู่ที่"><option value="">ทุกหมู่</option>'+moos.map(function(x){return '<option value="'+x+'"'+(String(x)===S.moo?' selected':'')+'>หมู่ '+x+'</option>'}).join('')+'</select>'
   +'<span class="hint">แสดง '+rows.length+' จาก '+list.length+' ราย · กด Enter เพื่อไปช่องถัดไป</span></div>';
  if(!list.length){return h+'<div class="panel empty">ยังไม่มีผู้ใช้น้ำในระบบ<br><button class="btn pri" style="margin-top:12px" data-tab="custs">เพิ่มผู้ใช้น้ำ</button></div>'}
  h+='<div class="panel grid"><div class="gh"><div>ที่</div><div>ชื่อ-สกุล</div><div class="r">หมู่</div><div class="r">ครั้งก่อน</div><div class="r">ครั้งหลัง</div><div class="r">ใช้ (ลบ.ม.)</div><div class="r">ค่าน้ำ</div><div class="r">ธรรมเนียม</div><div class="r">รวมเงิน</div><div class="r">จัดการ</div></div>';
  if(!rows.length)h+='<div class="empty">ไม่พบรายการที่ตรงกับตัวกรอง</div>';
  rows.forEach(function(x){
    var c=x.c,r=x.r,u=used(r),mm=money(ym,r),st=status(ym,c.id,r),dis=S.canWrite?'':' disabled';
    h+='<div class="gr '+(st?st.k:'')+'" data-row="'+c.id+'"><div class="c-no num hint">'+(x.i+1)+'</div>'
     +'<div class="c-name"><b>'+esc(c.name)+'</b><small class="mm">หมู่ '+c.moo+'</small>'+(st?'<span class="flag '+st.k+'">'+st.t+'</span>':'')+(r.n?'<span class="flag" style="color:var(--muted)">หมายเหตุ: '+esc(r.n)+'</span>':'')+'</div>'
     +'<div class="c-moo r num">'+c.moo+'</div>'
     +'<div class="vals"><div class="r num"><span class="mlab">ครั้งก่อน</span>'+nf(r.p)+'</div>'
     +'<div class="c-in"><span class="mlab">ครั้งหลัง</span><input type="number" inputmode="numeric" min="0" step="1" data-cid="'+c.id+'" value="'+(r.c==null?'':r.c)+'" aria-label="เลขมิเตอร์ครั้งหลัง '+esc(c.name)+'"'+dis+'></div>'
     +'<div class="r num"><span class="mlab">ใช้ (ลบ.ม.)</span>'+(u==null?'–':nf(u))+'</div>'
     +'<div class="r num dsk">'+(mm.w==null?'–':nf(mm.w))+'</div>'
     +'<div class="r num dsk">'+nf(r.f)+'</div>'
     +'<div class="r num"><span class="mlab">รวมเงิน</span><b>'+(mm.t==null?'–':nf(mm.t))+'</b></div>'
     +'</div>'
     +'<div class="c-act"><button class="icon-btn'+(r.n?' has':'')+'" data-act="edit" data-cid="'+c.id+'" aria-label="แก้ไขและหมายเหตุ '+esc(c.name)+'" title="แก้ไข / หมายเหตุ">'+(r.n?IC.note:IC.edit)+'</button>'
     +'<button class="icon-btn" data-act="bill" data-cid="'+c.id+'" aria-label="ใบเสร็จ '+esc(c.name)+'" title="ใบเสร็จ"'+(mm.t==null?' disabled style="opacity:.35"':'')+'>'+IC.bill+'</button></div></div>';
  });
  h+='</div>';
  return h}

/* The desktop grid needs water/fee as separate cells; patch markup for wide screens via CSS grid columns */
function viewSummary(){
  var ys=sortedYms();
  if(!ys.length)return '<div class="panel empty" style="margin-top:18px">ยังไม่มีข้อมูลรายเดือน</div>';
  var tot=ys.map(function(y){return {y:y,t:monthTotals(y)}});
  var h='<div class="sec"><div class="sec-h"><div><h2>สรุปรายเดือนย้อนหลัง</h2><span class="hint">กดแถวเพื่อไปที่เดือนนั้น</span></div><div class="toolbar">'
   +'<button class="btn pri" data-act="xlsall">'+IC.xls+'ส่งออก Excel ทุกเดือน</button></div></div>';
  h+='<div class="cards" style="margin-bottom:14px"><div class="panel chart"><div class="sec-h" style="margin-bottom:6px"><h3>แนวโน้มรายเดือน</h3><div class="seg" role="group" aria-label="ตัวชี้วัด">'
   +'<button data-chart="units" aria-pressed="'+(S.chartMode==='units')+'">ปริมาณน้ำ</button><button data-chart="total" aria-pressed="'+(S.chartMode==='total')+'">รายรับ</button></div></div>'+chartSVG(tot)+'</div></div>';
  h+='<div class="tw"><table><thead><tr><th>เดือน</th><th>จดแล้ว (ราย)</th><th>น้ำที่ใช้ (ลบ.ม.)</th><th>ค่าน้ำ</th><th>ค่าธรรมเนียม</th><th>รวมเงิน</th><th class="l">จดครั้งนี้เมื่อ</th></tr></thead><tbody>';
  var sum={n:0,u:0,w:0,f:0,t:0};
  tot.slice().reverse().forEach(function(x){var t=x.t;sum.n+=t.n;sum.u+=t.units;sum.w+=t.water;sum.f+=t.fee;sum.t+=t.total;
    h+='<tr class="click'+(x.y===S.ym?' sel':'')+'" data-goto="'+x.y+'"><td><b>'+ymLabel(x.y)+'</b></td><td class="num">'+t.n+' / '+t.cnt+'</td><td class="num">'+nf(t.units)+'</td><td class="num">'+nf(t.water)+'</td><td class="num">'+nf(t.fee)+'</td><td class="num"><b>'+nf(t.total)+'</b></td><td class="l">'+fmtDate(S.months[x.y].cur)+'</td></tr>'});
  h+='</tbody><tfoot><tr><td>รวม '+ys.length+' เดือน</td><td></td><td class="num">'+nf(sum.u)+'</td><td class="num">'+nf(sum.w)+'</td><td class="num">'+nf(sum.f)+'</td><td class="num">'+nf(sum.t)+'</td><td></td></tr></tfoot></table></div></div>';
  /* per-customer history */
  var cs=custList(),sel=cs.find(function(c){return c.name===S.hist});
  h+='<div class="sec"><div class="sec-h"><div><h2>ประวัติรายบุคคล</h2><span class="hint">พิมพ์ชื่อหรือเลือกจากรายการ</span></div></div>'
   +'<div style="max-width:420px;margin-bottom:12px"><input type="text" id="histIn" list="custNames" placeholder="ค้นหาชื่อผู้ใช้น้ำ" value="'+esc(S.hist)+'" aria-label="ชื่อผู้ใช้น้ำ"><datalist id="custNames">'+cs.map(function(c){return '<option value="'+esc(c.name)+'">'}).join('')+'</datalist></div>';
  if(sel){
    var rows=ys.map(function(y){var r=rowFor(y,sel.id);var ex=S.months[y].rows&&S.months[y].rows[sel.id];return ex?{y:y,r:r}:null}).filter(Boolean);
    var tu=0,tt=0;
    h+='<div class="tw"><table><thead><tr><th>เดือน</th><th>ครั้งก่อน</th><th>ครั้งหลัง</th><th>ใช้ (ลบ.ม.)</th><th>รวมเงิน</th><th class="l">หมายเหตุ</th><th></th></tr></thead><tbody>';
    rows.slice().reverse().forEach(function(x){var u=used(x.r),mm=money(x.y,x.r);if(mm.t!=null){tu+=u;tt+=mm.t}
      var st=status(x.y,sel.id,x.r);
      h+='<tr><td><b>'+ymLabel(x.y)+'</b></td><td class="num">'+nf(x.r.p)+'</td><td class="num">'+(x.r.c==null?'–':nf(x.r.c))+'</td><td class="num">'+(u==null?'–':nf(u))+(st?' <span class="pill '+st.k+'" title="'+st.t+'">!</span>':'')+'</td><td class="num">'+(mm.t==null?'–':nf(mm.t))+'</td><td class="l">'+esc(x.r.n)+'</td>'
       +'<td>'+(mm.t!=null?'<button class="icon-btn" data-act="bill" data-ym="'+x.y+'" data-cid="'+sel.id+'" aria-label="ใบเสร็จ '+ymLabel(x.y)+'">'+IC.bill+'</button>':'')+'</td></tr>'});
    h+='</tbody><tfoot><tr><td>รวม</td><td></td><td></td><td class="num">'+nf(tu)+'</td><td class="num">'+nf(tt)+'</td><td></td><td></td></tr></tfoot></table></div>'}
  else h+='<div class="panel empty">เลือกผู้ใช้น้ำเพื่อดูการใช้น้ำและค่าน้ำย้อนหลังทุกเดือน</div>';
  return h+'</div>'}

function chartSVG(tot){
  var key=S.chartMode==='units'?'units':'total',W=640,H=230,L=46,B=30,T=22,R=8,n=tot.length;
  var vals=tot.map(function(x){return x.t[key]}),mx=Math.max.apply(null,vals.concat([1]));
  var step=Math.pow(10,Math.floor(Math.log10(mx))),nice=[1,2,2.5,5,10].map(function(k){return k*step}).find(function(v){return v*4>=mx})||mx;
  var top=Math.ceil(mx/(nice/4))*(nice/4);var ph=H-T-B,pw=W-L-R,bw=pw/n;
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="กราฟ'+(key==='units'?'ปริมาณน้ำ':'รายรับ')+'รายเดือน">';
  for(var i=0;i<=4;i++){var v=top*i/4,y=T+ph-ph*i/4;s+='<line class="gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text class="ax" x="'+(L-6)+'" y="'+(y+4)+'" text-anchor="end">'+nf(v)+'</text>'}
  tot.forEach(function(x,i){var v=x.t[key],h=top?ph*v/top:0,bx=L+i*bw+bw*.18,w=bw*.64;
    s+='<rect class="b'+(x.y===S.ym?' cur':'')+'" data-goto="'+x.y+'" x="'+bx+'" y="'+(T+ph-h)+'" width="'+w+'" height="'+Math.max(h,0)+'" rx="3"><title>'+ymLabel(x.y)+': '+nf(v)+(key==='units'?' ลบ.ม.':' บาท')+'</title></rect>'
     +'<text class="ax" x="'+(bx+w/2)+'" y="'+(H-10)+'" text-anchor="middle">'+ymShort(x.y)+'</text>'
     +(n<=14&&v?'<text class="vl" x="'+(bx+w/2)+'" y="'+(T+ph-h-5)+'" text-anchor="middle">'+nf(v)+'</text>':'')});
  return s+'<text class="ax" x="'+L+'" y="11">'+(key==='units'?'ลบ.ม.':'บาท')+'</text></svg>'}

function viewCusts(){
  var cs=custList(),h='<div class="sec"><div class="sec-h"><div><h2>ผู้ใช้น้ำ</h2><span class="hint">'+cs.filter(function(c){return c.active!==false}).length+' ราย ใช้งานอยู่ · ผู้ที่ปิดใช้งานจะไม่ถูกแสดงในเดือนใหม่ แต่ประวัติเดิมยังอยู่</span></div>'
   +(S.canWrite?'<button class="btn pri" data-act="newcust">'+IC.plus+'เพิ่มผู้ใช้น้ำ</button>':'')+'</div>';
  h+='<div style="max-width:320px;margin-bottom:10px"><input type="text" id="cq" placeholder="ค้นหาชื่อ" value="'+esc(S.cq||'')+'" aria-label="ค้นหาผู้ใช้น้ำ"></div>';
  var q=(S.cq||'').trim().toLowerCase();
  var f=cs.filter(function(c){return !q||c.name.toLowerCase().indexOf(q)>=0});
  h+='<div class="panel list">'+(f.length?f.map(function(c){return '<div class="li'+(c.active===false?' off':'')+'"><div style="min-width:0"><b style="font-weight:500;overflow-wrap:anywhere">'+esc(c.name)+'</b> '+(c.active===false?'<span class="pill mute">ปิดใช้งาน</span>':'')+'<div class="hint">หมู่ '+c.moo+'</div></div>'
    +(S.canWrite?'<button class="btn sm" data-act="editcust" data-cid="'+c.id+'">'+IC.edit+'แก้ไข</button>':'')+'</div>'}).join(''):'<div class="empty">ไม่พบรายชื่อ</div>')+'</div></div>';
  return h}

function viewSettings(){
  var s=S.settings;
  return '<div class="sec" style="max-width:720px"><h2>ตั้งค่าเอกสาร</h2><p class="hint" style="margin:0 0 12px">ข้อมูลนี้ใช้ในหัวรายงาน Excel และใบเสร็จ</p><form id="setForm" class="panel" style="padding:18px;display:grid;gap:12px">'
   +'<label class="f">ชื่อหน่วยงาน<input type="text" id="s_org" value="'+esc(s.org)+'"></label>'
   +'<div class="two"><label class="f">ผู้จดมิเตอร์<input type="text" id="s_rec" value="'+esc(s.recorder)+'"></label><label class="f">ผู้ตรวจสอบ<input type="text" id="s_ins" value="'+esc(s.inspector)+'"></label></div>'
   +'<label class="f">ตำแหน่งผู้ตรวจสอบ<input type="text" id="s_insT" value="'+esc(s.inspectorTitle)+'"></label>'
   +'<div class="two"><label class="f">อัตราค่าน้ำ (บาท/หน่วย) สำหรับเดือนใหม่<input type="number" step="0.01" min="0" id="s_rate" value="'+s.rate+'"></label><label class="f">ค่าธรรมเนียมต่อราย (บาท)<input type="number" step="0.01" min="0" id="s_fee" value="'+s.fee+'"></label></div>'
   +'<label class="f">หัวข้อใบเสร็จ<input type="text" id="s_bt" value="'+esc(s.billTitle)+'"></label>'
   +'<label class="f">ข้อความท้ายใบเสร็จ<textarea id="s_bf" placeholder="เช่น กำหนดชำระภายในวันที่ 25 ของเดือน">'+esc(s.billFooter)+'</textarea></label>'
   +'<div class="f" style="display:grid;gap:6px"><span style="font-size:13.5px;color:var(--muted);font-weight:500">ลายเซ็นผู้จดมิเตอร์ (แสดงบนใบเสร็จ)</span>'
   +'<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center"><div style="background:#fff;border:1px dashed var(--line);border-radius:8px;min-width:150px;height:76px;display:grid;place-items:center;padding:4px">'+(s.signature?'<img src="'+s.signature+'" alt="ลายเซ็น" style="max-height:66px;max-width:200px">':'<span class="hint" style="color:#666">ยังไม่มีลายเซ็น</span>')+'</div>'
   +'<label class="btn" style="cursor:pointer">เลือกรูปลายเซ็น<input type="file" id="sigFile" accept="image/*" hidden></label>'+(s.signature?'<button class="btn bad" type="button" data-act="sigclear">ลบลายเซ็น</button>':'')+'</div>'
   +'<span class="hint">ใช้รูปถ่ายหรือสแกนลายเซ็นบนกระดาษขาว ระบบจะตัดพื้นหลังให้อัตโนมัติ</span></div>'
   +'<div class="toolbar"><button class="btn pri" type="submit"'+(S.canWrite?'':' disabled')+'>บันทึกการตั้งค่า</button></div></form></div>'}

/* ---------- modal ---------- */
function openModal(title,body,foot,wide,opts){
  $layer.innerHTML='<div class="scrim" data-close><div class="modal'+(wide?' wide':'')+'" role="dialog" aria-modal="true" aria-label="'+esc(title)+'" data-stop>'
   +'<div class="mh"><h2 style="margin:0">'+esc(title)+'</h2><button class="icon-btn" data-close aria-label="ปิด">'+IC.x+'</button></div><div class="mb">'+body+'</div>'+(foot?'<div class="mf">'+foot+'</div>':'')+'</div></div>';
  var f=$layer.querySelector('[data-autofocus]');if(f)f.focus()}
function closeModal(){$layer.innerHTML='';S.confirm=null}

function dlgEdit(cid,ym){
  ym=ym||S.ym;var c=S.customers.find(function(x){return x.id===cid}),r=rowFor(ym,cid);
  var body='<div><b>'+esc(c.name)+'</b><div class="hint">หมู่ '+c.moo+' · '+ymLabel(ym)+'</div></div>'
   +'<div class="two"><label class="f">เลขมิเตอร์ครั้งก่อน<input type="number" min="0" id="e_p" value="'+r.p+'"></label><label class="f">เลขมิเตอร์ครั้งหลัง<input type="number" min="0" id="e_c" data-autofocus value="'+(r.c==null?'':r.c)+'"></label></div>'
   +'<label class="f">ค่าธรรมเนียม (บาท)<input type="number" min="0" step="0.01" id="e_f" value="'+r.f+'"></label>'
   +'<div class="calc" id="e_calc"></div>'
   +'<label class="f">หมายเหตุเพิ่มเติม<textarea id="e_n" placeholder="เช่น มิเตอร์ชำรุด เปลี่ยนมิเตอร์ใหม่ เลขเริ่มต้น 0">'+esc(r.n)+'</textarea></label>';
  var foot=(r.exists&&S.canWrite?'<button class="btn bad" data-act="delrow" data-cid="'+cid+'" data-ym="'+ym+'" style="margin-right:auto">ลบรายการเดือนนี้</button>':'')
   +'<button class="btn" data-close>ยกเลิก</button><button class="btn pri" data-act="saverow" data-cid="'+cid+'" data-ym="'+ym+'"'+(S.canWrite?'':' disabled')+'>บันทึก</button>';
  openModal('แก้ไขรายการ',body,foot);calcEdit(ym)}
function calcEdit(ym){
  var p=parseFloat(document.getElementById('e_p').value),cv=document.getElementById('e_c').value,f=parseFloat(document.getElementById('e_f').value)||0,el=document.getElementById('e_calc');
  if(cv===''||isNaN(p)){el.innerHTML='<span>ยังไม่ได้กรอกเลขครั้งหลัง</span>';return}
  var u=parseFloat(cv)-p;if(u<0){el.innerHTML='<span style="color:var(--bad)">เลขครั้งหลังน้อยกว่าเลขครั้งก่อน ตรวจสอบอีกครั้ง</span>';return}
  var w=u*monthRate(ym);el.innerHTML='<span>ใช้น้ำ <b class="num">'+nf(u)+'</b> ลบ.ม.</span><span>ค่าน้ำ <b class="num">'+nf(w,2)+'</b></span><span>รวม <b class="num">'+nf(w+f,2)+'</b> บาท</span>'}

function dlgMonth(){
  var ym=S.ym,m=S.months[ym]||{prev:'',cur:todayISO(),rate:S.settings.rate,note:''};
  openModal('ตั้งค่า'+ymLabel(ym),
   '<div class="two"><label class="f">จดมิเตอร์ครั้งก่อนวันที่<input type="date" id="m_prev" value="'+esc(m.prev)+'"></label><label class="f">จดมิเตอร์ครั้งนี้วันที่<input type="date" id="m_cur" value="'+esc(m.cur)+'"></label></div>'
   +'<label class="f">อัตราค่าน้ำ (บาท/หน่วย) ของเดือนนี้<input type="number" step="0.01" min="0" id="m_rate" value="'+monthRate(ym)+'"></label>'
   +'<label class="f">หมายเหตุประจำเดือน<textarea id="m_note" placeholder="บันทึกเพิ่มเติมของเดือนนี้">'+esc(m.note||'')+'</textarea></label>',
   '<button class="btn" data-close>ยกเลิก</button><button class="btn pri" data-act="savemonth">บันทึก</button>')}

function dlgCust(cid){
  var c=cid?S.customers.find(function(x){return x.id===cid}):{name:'',moo:'',active:true};
  openModal(cid?'แก้ไขผู้ใช้น้ำ':'เพิ่มผู้ใช้น้ำ',
   '<label class="f">ชื่อ-สกุล (ใส่เลขมิเตอร์ต่อท้ายได้ เช่น (มิเตอร์ 2))<input type="text" id="c_name" data-autofocus value="'+esc(c.name)+'"></label>'
   +'<div class="two"><label class="f">หมู่ที่<input type="number" min="0" id="c_moo" value="'+esc(c.moo)+'"></label>'
   +(cid?'<label class="f">สถานะ<select id="c_act"><option value="1"'+(c.active!==false?' selected':'')+'>ใช้งานอยู่</option><option value="0"'+(c.active===false?' selected':'')+'>ปิดใช้งาน</option></select></label>'
   :'<label class="f">เลขมิเตอร์เริ่มต้น<input type="number" min="0" id="c_init" value="0"></label>')+'</div>'
   +(cid?'':'<p class="hint" style="margin:0">จะเริ่มแสดงในเดือน '+ymLabel(S.ym)+' โดยใช้เลขเริ่มต้นเป็นเลขครั้งก่อน</p>'),
   '<button class="btn" data-close>ยกเลิก</button><button class="btn pri" data-act="savecust" data-cid="'+(cid||'')+'">บันทึก</button>')}

/* ---------- bill ---------- */
var BILL_CSS='.bill{font-family:var(--font-bill,Sarabun,sans-serif);color:#111;background:#fff;border:1.5px solid #222;border-radius:6px;padding:14px 18px;width:100%;max-width:720px;margin:0 auto;font-size:15px;line-height:1.45}'
 +'.bill .bh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1.5px solid #222;padding-bottom:8px;margin-bottom:8px}'
 +'.bill .org{font-weight:700;font-size:16px}.bill .tt{font-weight:700;font-size:19px;margin-top:2px}'
 +'.bill .no{text-align:right;white-space:nowrap;font-size:14px}'
 +'.bill .kv{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 10px;margin-bottom:8px}.bill .kv span.k{color:#444}'
 +'.bill table{width:100%;border-collapse:collapse;min-width:0;margin:6px 0}.bill th,.bill td{border:1px solid #222;padding:4px 9px;background:#fff;color:#111;font-size:15px;white-space:normal}'
 +'.bill th{text-align:center;font-weight:600;background:#f0f0f0}.bill td.r{text-align:right}.bill td.l{text-align:left}.bill tr.t td{font-weight:700}'
 +'.bill .words{margin:6px 0;font-weight:600}.bill .note{margin:4px 0;font-size:14px}'
 +'.bill .sig{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:46px;text-align:center;font-size:14px}.bill .sig i{display:block;border-bottom:1px dotted #222;height:22px;margin:0 14px 3px}'
 +'.bill .sig>div{position:relative}.bill .sigimg{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);height:60px;width:auto;max-width:80%;pointer-events:none}'
 +'.bill .foot{margin-top:8px;font-size:13px;color:#333}';
function billHTML(ym,cid){
  var c=S.customers.find(function(x){return x.id===cid}),r=rowFor(ym,cid),m=S.months[ym],u=used(r),rate=monthRate(ym),w=u*rate,t=w+r.f,s=S.settings;
  return '<div class="bill"><div class="bh"><div><div class="org">'+esc(s.org)+'</div><div class="tt">'+esc(s.billTitle)+'</div></div><div class="no">เลขที่ '+receiptNo(ym,cid)+'<br>วันที่ '+fmtDate(m.cur)+'</div></div>'
   +'<div class="kv"><span class="k">ชื่อผู้ใช้น้ำ</span><b>'+esc(c.name)+'</b><span class="k">หมู่ที่</span><b>'+c.moo+'</b>'
   +'<span class="k">ประจำเดือน</span><b>'+ymLabel(ym)+'</b><span class="k">จดครั้งก่อน</span><span>'+fmtDate(m.prev)+'</span>'
   +'<span class="k">เลขมิเตอร์ครั้งก่อน</span><b>'+nf(r.p)+'</b><span class="k">เลขมิเตอร์ครั้งนี้</span><b>'+nf(r.c)+'</b></div>'
   +'<table><thead><tr><th>รายการ</th><th>จำนวน</th><th>อัตรา</th><th>จำนวนเงิน (บาท)</th></tr></thead><tbody>'
   +'<tr><td class="l">ค่าน้ำประปา</td><td class="r">'+nf(u)+' ลบ.ม.</td><td class="r">'+nf(rate,2)+'</td><td class="r">'+nf(w,2)+'</td></tr>'
   +'<tr><td class="l">ค่าธรรมเนียม</td><td class="r">–</td><td class="r">–</td><td class="r">'+nf(r.f,2)+'</td></tr>'
   +'<tr class="t"><td class="l" colspan="3">รวมเป็นเงินทั้งสิ้น</td><td class="r">'+nf(t,2)+'</td></tr></tbody></table>'
   +'<div class="words">( '+bahtText(t)+' )</div>'+(r.n?'<div class="note">หมายเหตุ: '+esc(r.n)+'</div>':'')
   +'<div class="sig"><div><i></i>ผู้รับเงิน<br>วันที่ชำระ ____ / ____ / ________</div><div>'+(s.signature?'<img class="sigimg" src="'+s.signature+'" alt="ลายเซ็นผู้จดมิเตอร์">':'')+'<i></i>('+esc(s.recorder||'ผู้จดมิเตอร์')+')<br>ผู้จดมิเตอร์</div></div>'
   +(s.billFooter?'<div class="foot">'+esc(s.billFooter)+'</div>':'')+'</div>'}
function printDoc(bills,title){
  var pages='';for(var i=0;i<bills.length;i+=2){pages+='<section class="pg">'+bills[i]+(bills[i+1]?'<div class="cut"></div>'+bills[i+1]:'')+'</section>'}
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>'+esc(title)+'</title><meta name="viewport" content="width=device-width,initial-scale=1">'
   +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap"><style>'
   +'@page{size:A4;margin:10mm}body{margin:0;background:#f3f3f3;font-family:Sarabun,"TH Sarabun New",sans-serif}'
   +'.tip{background:#0a6d8c;color:#fff;padding:8px 14px;font-size:14px}@media print{.tip{display:none}body{background:#fff}}'
   +'.pg{width:190mm;height:277mm;margin:0 auto;display:flex;flex-direction:column;justify-content:space-around;page-break-after:always;background:#fff;padding:0}.pg:last-child{page-break-after:auto}'
   +'.cut{border-top:1px dashed #888;margin:2mm 0}'+BILL_CSS.replace(/var\(--font-bill,Sarabun,sans-serif\)/,'Sarabun,"TH Sarabun New",sans-serif')+'</style></head><body>'
   +'<div class="tip">หน้าต่างพิมพ์จะเปิดอัตโนมัติ ถ้าไม่เปิดให้กด Ctrl+P (หรือ Cmd+P) · ขนาดกระดาษ A4 พิมพ์ 2 ใบต่อหน้า</div>'+pages
   +'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},700)})<\/script></body></html>'}
function dlgBill(ym,cid){
  var list=visibleCusts(ym).filter(function(c){return money(ym,rowFor(ym,c.id)).t!=null}),i=list.findIndex(function(c){return c.id===cid});
  var c=S.customers.find(function(x){return x.id===cid});
  var body='<div class="paper">'+billHTML(ym,cid)+'</div><p class="hint" style="margin:0">กด “ดาวน์โหลดไฟล์พิมพ์” แล้วเปิดไฟล์ที่ได้ ระบบจะเปิดหน้าต่างพิมพ์ให้อัตโนมัติ (พิมพ์จากหน้าเว็บนี้โดยตรงไม่ได้)</p>';
  var foot='<button class="btn" data-act="billnav" data-d="-1" data-ym="'+ym+'" data-cid="'+cid+'"'+(i<=0?' disabled':'')+'>'+IC.chev(-1)+'ก่อนหน้า</button>'
   +'<button class="btn" data-act="billnav" data-d="1" data-ym="'+ym+'" data-cid="'+cid+'"'+(i<0||i>=list.length-1?' disabled':'')+'>ถัดไป'+IC.chev(1)+'</button><span class="sp"></span>'
   +'<button class="btn" data-act="billall" data-ym="'+ym+'">ไฟล์พิมพ์ทั้งเดือน</button>'
   +'<button class="btn pri" data-act="billone" data-ym="'+ym+'" data-cid="'+cid+'">'+IC.bill+'ดาวน์โหลดไฟล์พิมพ์</button>';
  openModal('ใบเสร็จ · '+(c?c.name:''),body,foot,true)}

/* ---------- downloads ---------- */
function save(filename,data){
  if(!S.downloads){toast('เปิดแอปนี้ในหน้า Claude เพื่อดาวน์โหลดไฟล์','bad');return Promise.resolve()}
  return S.downloads.save({filename:filename,data:data}).then(function(){toast('บันทึกไฟล์แล้ว')}).catch(function(e){
    if(e&&e.code==='declined')return;toast('ดาวน์โหลดไม่สำเร็จ ('+((e&&e.code)||'error')+')','bad')})}
function printBills(ym,cids){
  var bills=cids.map(function(id){return billHTML(ym,id)});
  var fn='ใบเสร็จค่าน้ำ_'+ymLabel(ym).replace(' ','-')+(cids.length===1?'_'+(S.customers.find(function(c){return c.id===cids[0]})||{}).name.replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'_'):'_ทั้งเดือน')+'.html';
  return save(fn,printDoc(bills,'ใบเสร็จค่าน้ำ '+ymLabel(ym)))}
function recordedIds(ym){return visibleCusts(ym).filter(function(c){return money(ym,rowFor(ym,c.id)).t!=null}).map(function(c){return c.id})}

/* ---------- Excel ---------- */
function sheetName(ym){return ymLabel(ym).replace('ตุลาคม','ต.ค.').replace('พฤศจิกายน','พ.ย.').replace('ธันวาคม','ธ.ค.').replace('มกราคม','ม.ค.').replace('กุมภาพันธ์','ก.พ.').replace('มีนาคม','มี.ค.').replace('เมษายน','เม.ย.').replace('พฤษภาคม','พ.ค.').replace('มิถุนายน','มิ.ย.').replace('กรกฎาคม','ก.ค.').replace('สิงหาคม','ส.ค.').replace('กันยายน','ก.ย.')}
function buildWorkbook(yms){
  var WB=new ExcelJS.Workbook(),FONT='Sarabun',s=S.settings;WB.creator=s.org||'มิเตอร์น้ำ';
  var thin={style:'thin',color:{argb:'FF444444'}},bd={top:thin,left:thin,bottom:thin,right:thin};
  var info={};
  var sum=yms.length>1?WB.addWorksheet('สรุปรายเดือน'):null;
  yms.forEach(function(ym){
    var ws=WB.addWorksheet(sheetName(ym)),m=S.months[ym],rate=monthRate(ym),list=visibleCusts(ym);
    ws.columns=[{width:7},{width:38},{width:8},{width:13},{width:13},{width:13},{width:13},{width:14},{width:15},{width:32}];
    ws.mergeCells('A1:J1');ws.getCell('A1').value=s.org;ws.mergeCells('A2:J2');
    ws.getCell('A2').value='ประจำเดือน '+ymLabel(ym).replace(' ',' พ.ศ. ')+'  จดมิเตอร์น้ำเมื่อครั้งก่อนวันที่ '+fmtDate(m.prev)+' จดมิเตอร์ครั้งนี้ '+fmtDate(m.cur);
    ['A1','A2'].forEach(function(a){var c=ws.getCell(a);c.font={name:FONT,size:15,bold:true};c.alignment={horizontal:'center',vertical:'middle'}});
    ws.mergeCells('A3:A4');ws.mergeCells('B3:B4');ws.mergeCells('C3:C4');ws.mergeCells('D3:E3');ws.mergeCells('F3:F4');ws.mergeCells('G3:G4');ws.mergeCells('I3:I4');ws.mergeCells('J3:J4');
    var H={A3:'ที่',B3:'ชื่อ-สกุล',C3:'หมู่ที่',D3:'จำนวนหน่วย (ลบ.ม.)',D4:'จดครั้งก่อน',E4:'จดครั้งหลัง',F3:'รวมครั้งนี้',G3:'เป็นเงิน',H3:'ค่า',H4:'ธรรมเนียม',I3:'รวมเงิน',J3:'หมายเหตุ'};
    Object.keys(H).forEach(function(k){ws.getCell(k).value=H[k]});
    for(var r=3;r<=4;r++)for(var c=1;c<=10;c++){var cell=ws.getCell(r,c);cell.font={name:FONT,size:14,bold:true};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border=bd;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F0F5'}}}
    var row=5,first=5,tu=0,tw=0,tf=0,tt=0,k=0;
    list.forEach(function(cu){
      var rr=rowFor(ym,cu.id),u=used(rr),has=rr.c!=null&&u>=0,w=has?u*rate:0;k++;
      ws.getCell(row,1).value=k;ws.getCell(row,2).value=cu.name;ws.getCell(row,3).value=cu.moo;ws.getCell(row,4).value=rr.p;ws.getCell(row,5).value=rr.c==null?null:rr.c;
      ws.getCell(row,6).value={formula:'IF(E'+row+'="",0,E'+row+'-D'+row+')',result:has?u:0};
      ws.getCell(row,7).value={formula:'F'+row+'*'+rate,result:w};
      ws.getCell(row,8).value=rr.f;
      ws.getCell(row,9).value={formula:'IF(E'+row+'="",0,G'+row+'+H'+row+')',result:has?w+rr.f:0};
      ws.getCell(row,10).value=rr.n||null;
      if(has){tu+=u;tw+=w;tf+=rr.f;tt+=w+rr.f}
      for(var c2=1;c2<=10;c2++){var ce=ws.getCell(row,c2);ce.font={name:FONT,size:14};ce.border=bd;if(c2!==2&&c2!==10)ce.alignment={horizontal:c2===1||c2===3?'center':'right'};if(c2>=4&&c2<=9)ce.numFmt='#,##0.##'}
      row++});
    var last=row-1;ws.mergeCells('A'+row+':E'+row);ws.getCell('A'+row).value='รวมเป็นเงิน';
    var T={6:['F',tu],7:['G',tw],8:['H',tf],9:['I',tt]};
    Object.keys(T).forEach(function(ci){var col=T[ci][0];ws.getCell(row,+ci).value={formula:'SUM('+col+first+':'+col+last+')',result:T[ci][1]}});
    for(var c3=1;c3<=10;c3++){var cc=ws.getCell(row,c3);cc.font={name:FONT,size:14,bold:true};cc.border=bd;cc.numFmt='#,##0.##';cc.alignment={horizontal:c3===1?'center':'right'}}
    info[ym]={sheet:sheetName(ym),totalRow:row,t:{units:tu,water:tw,fee:tf,total:tt}};
    var sr=row+2;
    ws.getCell('B'+sr).value='ลงชื่อ ........................................ ผู้จดมิเตอร์';ws.getCell('B'+(sr+1)).value='('+s.recorder+')';
    ws.getCell('E'+sr).value='ลงชื่อ ........................................ ผู้ตรวจสอบ';ws.getCell('E'+(sr+1)).value='('+s.inspector+')';ws.getCell('E'+(sr+2)).value=s.inspectorTitle;
    ['B','E'].forEach(function(a){for(var i=0;i<3;i++){var ce=ws.getCell(a+(sr+i));ce.font={name:FONT,size:14}}});
    if(m.note){ws.getCell('B'+(sr+4)).value='หมายเหตุประจำเดือน: '+m.note;ws.getCell('B'+(sr+4)).font={name:FONT,size:13,italic:true}}
    ws.views=[{state:'frozen',ySplit:4}];
    ws.pageSetup={orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}};
    ws.pageSetup.printTitlesRow='3:4';
  });
  if(sum){
    sum.columns=[{width:18},{width:12},{width:16},{width:16},{width:16},{width:18}];
    var hd=['เดือน','จดแล้ว (ราย)','น้ำที่ใช้ (ลบ.ม.)','ค่าน้ำ (บาท)','ค่าธรรมเนียม (บาท)','รวมเงิน (บาท)'];
    sum.mergeCells('A1:F1');sum.getCell('A1').value='สรุปค่าน้ำประปารายเดือน · '+s.org;sum.getCell('A1').font={name:FONT,size:15,bold:true};sum.getCell('A1').alignment={horizontal:'center'};
    hd.forEach(function(t,i){var c=sum.getCell(3,i+1);c.value=t;c.font={name:FONT,size:14,bold:true};c.border=bd;c.alignment={horizontal:'center',wrapText:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F0F5'}}});
    var rr=4,agg=[0,0,0,0,0];
    yms.forEach(function(ym){var i=info[ym],q="'"+i.sheet+"'!",t=monthTotals(ym);
      sum.getCell(rr,1).value=ymLabel(ym);sum.getCell(rr,2).value=t.n;
      sum.getCell(rr,3).value={formula:q+'F'+i.totalRow,result:i.t.units};sum.getCell(rr,4).value={formula:q+'G'+i.totalRow,result:i.t.water};
      sum.getCell(rr,5).value={formula:q+'H'+i.totalRow,result:i.t.fee};sum.getCell(rr,6).value={formula:q+'I'+i.totalRow,result:i.t.total};
      agg[0]+=t.n;agg[1]+=i.t.units;agg[2]+=i.t.water;agg[3]+=i.t.fee;agg[4]+=i.t.total;
      for(var c=1;c<=6;c++){var ce=sum.getCell(rr,c);ce.font={name:FONT,size:14};ce.border=bd;if(c>1)ce.numFmt='#,##0.##'}rr++});
    sum.getCell(rr,1).value='รวม';var cols=['B','C','D','E','F'];
    cols.forEach(function(col,i){sum.getCell(col+rr).value={formula:'SUM('+col+'4:'+col+(rr-1)+')',result:agg[i]}});
    for(var c=1;c<=6;c++){var ce=sum.getCell(rr,c);ce.font={name:FONT,size:14,bold:true};ce.border=bd;ce.numFmt='#,##0.##'}
    /* per-customer usage matrix */
    var hs=WB.addWorksheet('ประวัติรายบุคคล');
    hs.columns=[{width:6},{width:38},{width:8}].concat(yms.map(function(){return {width:11}})).concat([{width:13}]);
    hs.getCell('A1').value='ปริมาณน้ำที่ใช้รายบุคคล (ลบ.ม.)';hs.getCell('A1').font={name:FONT,size:15,bold:true};
    var heads=['ที่','ชื่อ-สกุล','หมู่ที่'].concat(yms.map(ymShort)).concat(['รวม']);
    heads.forEach(function(t,i){var c=hs.getCell(3,i+1);c.value=t;c.font={name:FONT,size:13,bold:true};c.border=bd;c.alignment={horizontal:'center'};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F0F5'}}});
    var r2=4;custList().forEach(function(cu,idx){
      hs.getCell(r2,1).value=idx+1;hs.getCell(r2,2).value=cu.name;hs.getCell(r2,3).value=cu.moo;var tot=0,L=ColName(3+yms.length);
      yms.forEach(function(ym,j){var rw=S.months[ym].rows&&S.months[ym].rows[cu.id],rrw=rowFor(ym,cu.id),u=used(rrw);var v=(rw&&u!=null)?u:null;hs.getCell(r2,4+j).value=v;if(v!=null)tot+=v});
      hs.getCell(r2,4+yms.length).value={formula:'SUM(D'+r2+':'+L+r2+')',result:tot};
      for(var c=1;c<=4+yms.length;c++){var ce=hs.getCell(r2,c);ce.font={name:FONT,size:13};ce.border=bd;if(c>3)ce.numFmt='#,##0'}r2++});
    hs.views=[{state:'frozen',xSplit:3,ySplit:3}];
  }
  return WB}
function ColName(n){var s='';while(n>0){var m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
function exportXlsx(yms,fname){
  if(typeof ExcelJS==='undefined'){toast('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต','bad');return}
  toast('กำลังสร้างไฟล์ Excel…');
  buildWorkbook(yms).xlsx.writeBuffer().then(function(buf){return save(fname,buf)}).catch(function(e){toast('สร้างไฟล์ไม่สำเร็จ: '+(e&&e.message||e),'bad')})}

/* ---------- events ---------- */
function gv(id){var e=document.getElementById(id);return e?e.value:''}
function num(v,d){var n=parseFloat(v);return isNaN(n)?d:n}
document.addEventListener('click',function(ev){
  var t=ev.target;
  var close=t.closest('[data-close]');
  if(close&&(!close.classList.contains('scrim')||t===close)){closeModal();return}
  var tab=t.closest('[data-tab]');if(tab){S.tab=tab.dataset.tab;render();window.scrollTo(0,0);return}
  var fl=t.closest('[data-filter]');if(fl){S.filter=fl.dataset.filter;render();return}
  var ch=t.closest('[data-chart]');if(ch){S.chartMode=ch.dataset.chart;render();return}
  var go=t.closest('[data-goto]');if(go){S.ym=go.dataset.goto;S.tab='entry';render();window.scrollTo(0,0);return}
  var a=t.closest('[data-act]');if(!a)return;var act=a.dataset.act,cid=a.dataset.cid,ym=a.dataset.ym||S.ym;
  if(a.disabled)return;
  if(act==='mprev'||act==='mnext'){var ys=sortedYms(),i=ys.indexOf(S.ym)+(act==='mprev'?-1:1);if(i>=0&&i<ys.length){S.ym=ys[i];render()}}
  else if(act==='newmonth'){var nx=ymAdd(sortedYms().slice(-1)[0]||S.ym,1);if(!S.months[nx]){S.ym=nx;ensureMonth(nx).then(function(){render();toast('เริ่มเดือน '+ymLabel(nx)+' แล้ว กรอกเลขมิเตอร์ได้เลย')})}else{S.ym=nx;render()}render()}
  else if(act==='msettings')dlgMonth();
  else if(act==='savemonth'){patchMonth(S.ym,{prev:gv('m_prev'),cur:gv('m_cur'),rate:num(gv('m_rate'),S.settings.rate),note:gv('m_note').trim()});closeModal();render();toast('บันทึกแล้ว')}
  else if(act==='edit')dlgEdit(cid,ym);
  else if(act==='saverow'){var cv=gv('e_c');patchRow(ym,cid,{p:num(gv('e_p'),0),c:cv===''?null:num(cv,null),f:num(gv('e_f'),S.settings.fee),n:gv('e_n').trim()});closeModal();render();toast('บันทึกแล้ว')}
  else if(act==='delrow'){if(S.confirm!==cid){S.confirm=cid;a.classList.add('sure');a.textContent='กดอีกครั้งเพื่อยืนยันลบ';return}removeRow(ym,cid);closeModal();render();toast('ลบรายการแล้ว')}
  else if(act==='bill'||act==='billnav'){
    if(act==='billnav'){var list=recordedIds(ym),i=list.indexOf(cid)+(+a.dataset.d);if(i>=0&&i<list.length)cid=list[i]}
    dlgBill(ym,cid)}
  else if(act==='billone')printBills(ym,[cid]);
  else if(act==='billall')printBills(ym,recordedIds(ym));
  else if(act==='xlsmonth')exportXlsx([S.ym],'มิเตอร์น้ำ_'+ymLabel(S.ym).replace(' ','-')+'.xlsx');
  else if(act==='xlsall')exportXlsx(sortedYms(),'มิเตอร์น้ำ_สรุปย้อนหลัง_'+ymLabel(sortedYms()[0]).replace(' ','-')+'_ถึง_'+ymLabel(sortedYms().slice(-1)[0]).replace(' ','-')+'.xlsx');
  else if(act==='sigclear'){saveSettings({signature:''}).then(function(){toast('ลบลายเซ็นแล้ว')});render()}
  else if(act==='newcust')dlgCust();
  else if(act==='editcust')dlgCust(cid);
  else if(act==='savecust'){
    var name=gv('c_name').trim();if(!name){toast('กรุณากรอกชื่อ','bad');return}
    var moo=num(gv('c_moo'),0);
    if(cid){var c=Object.assign({},S.customers.find(function(x){return x.id===cid}),{name:name,moo:moo,active:gv('c_act')!=='0'});saveCustomer(c)}
    else{var maxId=S.customers.reduce(function(m,c){return Math.max(m,parseInt(c.id.slice(1),10)||0)},0),maxOrd=S.customers.reduce(function(m,c){return Math.max(m,c.ord||0)},0);
      var nc={id:'c'+String(maxId+1).padStart(3,'0'),name:name,moo:moo,active:true,ord:maxOrd+1};saveCustomer(nc);
      patchRow(S.ym,nc.id,{p:num(gv('c_init'),0),c:null,f:+S.settings.fee,n:''})}
    closeModal();render();toast('บันทึกแล้ว')}
});
document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t.id==='sigFile'){var fl=t.files&&t.files[0];if(!fl)return;
    var img=new Image(),url=URL.createObjectURL(fl);
    img.onload=function(){var sc=Math.min(1,420/img.width),w=Math.round(img.width*sc),h=Math.round(img.height*sc),cv=document.createElement('canvas');cv.width=w;cv.height=h;
      var cx=cv.getContext('2d');cx.drawImage(img,0,0,w,h);var id=cx.getImageData(0,0,w,h),d=id.data,lum=[];
      for(var i=0;i<d.length;i+=4)lum.push(0.3*d[i]+0.59*d[i+1]+0.11*d[i+2]);
      var sorted=lum.slice().sort(function(a,b){return a-b}),bg=sorted[Math.floor(sorted.length*0.6)];
      var minx=w,miny=h,maxx=0,maxy=0;
      for(var j=0;j<lum.length;j++){var a=Math.max(0,Math.min(255,Math.round((bg-lum[j])*255/Math.max(bg-60,40))));d[j*4]=20;d[j*4+1]=20;d[j*4+2]=30;d[j*4+3]=a;
        if(a>60){var x=j%w,y=(j/w)|0;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y}}
      if(maxx<=minx){toast('ไม่พบลายเซ็นในรูป ลองใช้รูปที่เซ็นบนกระดาษสีอ่อน','bad');URL.revokeObjectURL(url);return}
      cx.putImageData(id,0,0);var pad=6,sx=Math.max(minx-pad,0),sy=Math.max(miny-pad,0),sw=Math.min(maxx+pad,w)-sx,sh=Math.min(maxy+pad,h)-sy;
      var c2=document.createElement('canvas');c2.width=sw;c2.height=sh;c2.getContext('2d').drawImage(cv,sx,sy,sw,sh,0,0,sw,sh);
      URL.revokeObjectURL(url);saveSettings({signature:c2.toDataURL('image/png')}).then(function(){toast('บันทึกลายเซ็นแล้ว')});render()};
    img.onerror=function(){toast('เปิดไฟล์รูปไม่ได้','bad')};img.src=url}
  else if(t.id==='ymSel'){S.ym=t.value;render()}
  else if(t.id==='mooSel'){S.moo=t.value;render()}
  else if(t.id==='histIn'){S.hist=t.value;render()}
  else if(t.dataset&&t.dataset.cid&&t.tagName==='INPUT'){
    var v=t.value.trim(),cid=t.dataset.cid;if(!S.canWrite)return;
    var r=rowFor(S.ym,cid),nv=v===''?null:Math.round(Number(v));if(nv===r.c)return;
    if(nv!=null&&nv<0){toast('เลขมิเตอร์ต้องไม่ติดลบ','bad');return}
    patchRow(S.ym,cid,{c:nv});
    refreshComputed(cid);}
});
document.addEventListener('input',function(ev){
  var t=ev.target;
  if(t.id==='q'){S.q=t.value;var p=t.selectionStart;render();requestAnimationFrame(function(){var e=document.getElementById('q');if(e){e.focus();try{e.setSelectionRange(p,p)}catch(x){}}})}
  else if(t.id==='cq'){S.cq=t.value;var p2=t.selectionStart;render();requestAnimationFrame(function(){var e=document.getElementById('cq');if(e){e.focus();try{e.setSelectionRange(p2,p2)}catch(x){}}})}
  else if(t.id==='e_p'||t.id==='e_c'||t.id==='e_f'){calcEdit(S.ym)}
});
document.addEventListener('keydown',function(ev){
  if(ev.key==='Escape'&&$layer.firstChild){closeModal();return}
  var t=ev.target;
  if(ev.key==='Enter'&&t.tagName==='INPUT'&&t.dataset&&t.dataset.cid){
    ev.preventDefault();var all=Array.prototype.slice.call(document.querySelectorAll('input[data-cid]')),i=all.indexOf(t),n=all[i+1];
    t.blur();if(n){n.focus();n.select()}}
});
document.addEventListener('submit',function(ev){
  if(ev.target.id==='setForm'){ev.preventDefault();
    saveSettings({org:gv('s_org').trim(),recorder:gv('s_rec').trim(),inspector:gv('s_ins').trim(),inspectorTitle:gv('s_insT').trim(),rate:num(gv('s_rate'),5),fee:num(gv('s_fee'),5),billTitle:gv('s_bt').trim()||DEF_SET.billTitle,billFooter:gv('s_bf').trim()}).then(function(){toast('บันทึกการตั้งค่าแล้ว')});render()}
});
/* update computed cells for one row without a full rerender so typing flow is not interrupted */
function refreshComputed(cid){render()}

/* ---------- boot ---------- */
function start(){
  Promise.all([claude.use('db'),claude.use('user'),claude.use('downloads')]).then(function(r){
    S.db=r[0];S.downloads=r[2];
    if(r[1]){try{var w=r[1].can('data.write');if(w===false)S.canWrite=false}catch(e){}}
    if(!S.db){render();return}
    S.db.collection('customers').onSnapshot(function(snap){S.customers=snap.docs.map(function(d){return d.data()});S.ready.c=true;render()},function(e){toast('โหลดรายชื่อไม่สำเร็จ','bad')});
    S.db.collection('months').onSnapshot(function(snap){var o={};snap.docs.forEach(function(d){o[d.id]=JSON.parse(JSON.stringify(d.data()))});S.months=o;S.ready.m=true;render()},function(e){toast('โหลดข้อมูลรายเดือนไม่สำเร็จ','bad')});
    S.db.doc('settings/main').onSnapshot(function(d){S.settings=Object.assign({},DEF_SET,d.exists?d.data():{});S.ready.s=true;render()},function(e){S.ready.s=true;render()});
  }).catch(function(){render()});
}
var bs=document.createElement('style');bs.textContent=BILL_CSS+'.bill tr:last-child td{border-bottom:1px solid #222}';document.head.appendChild(bs);
render();
if(window.claude&&window.claude.use){start()}else{S.db=null;render()}
})();
