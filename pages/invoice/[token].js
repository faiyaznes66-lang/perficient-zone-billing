import { db } from "hatchable";

export const access="public";

const e=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const m=(n,c)=>`${e(c)} ${Number(n||0).toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default async function(req,res){
  const token=req.params.token;
  const {rows:r}=await db.query(
    `SELECT i.*,b.legal_name,b.trade_name,b.address AS business_address,b.phone AS business_phone,b.email AS business_email,
            b.website,b.trn AS business_trn,b.vat_registered,b.logo_url,b.bank_name,b.account_name,b.iban,b.swift,b.payment_instructions,
            b.invoice_accent,b.invoice_font,b.invoice_footer,b.hide_platform_branding,
            c.name AS customer_name,c.company AS customer_company,c.billing_address,c.trn AS customer_trn
     FROM invoices i
     JOIN businesses b ON b.id=i.business_id
     LEFT JOIN customers c ON c.id=i.customer_id
     WHERE i.public_token=$1 AND i.share_enabled=true LIMIT 1`,[token]);
  const x=r[0];
  if(!x) return res.status(404).send("<h1>Invoice not available</h1>");

  const {rows:items}=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position",[x.id]);
  const full=x.vat_registered&&x.invoice_format!=="simplified";
  const ar=x.language==="ar";
  const T=ar?{
    title:x.vat_registered?"فاتورة ضريبية":"فاتورة",invoice:"رقم الفاتورة",date:"تاريخ الفاتورة",supply:"تاريخ التوريد",due:"تاريخ الاستحقاق",salesperson:"مندوب المبيعات",
    bill:"فاتورة إلى",desc:"الوصف",qty:"الكمية",unit:"سعر الوحدة",vatRate:"نسبة الضريبة",vat:"الضريبة",amount:"المبلغ",
    subtotal:"المجموع الفرعي",discount:"الخصم",total:"الإجمالي",paid:"المدفوع",balance:"الرصيد",bank:"تفاصيل البنك",
    payment:"تعليمات الدفع",note:"ملاحظة",terms:"الشروط",print:"طباعة / حفظ PDF",vatAed:"الضريبة المستحقة بالدرهم",fx:"سعر الصرف إلى الدرهم"
  }:{
    title:x.vat_registered?"TAX INVOICE":"INVOICE",invoice:"Invoice #",date:"Invoice date",supply:"Supply date",due:"Due date",salesperson:"Sales person",
    bill:"Bill to",desc:"Description",qty:"Qty",unit:"Unit price",vatRate:"VAT rate",vat:"VAT",amount:"Amount",
    subtotal:"Subtotal",discount:"Discount",total:"Total",paid:"Paid",balance:"Balance",bank:"Bank details",
    payment:"Payment instructions",note:"Note",terms:"Terms",print:"Print / Save PDF",vatAed:"VAT payable in AED",fx:"Exchange rate to AED"
  };
  const seller=x.trade_name||x.legal_name,customer=x.customer_company||x.customer_name||"Customer";
  const accent=/^#[0-9a-fA-F]{6}$/.test(x.invoice_accent||"")?x.invoice_accent:"#0e7568";
  const font=x.invoice_font==="serif"?"Georgia,serif":x.invoice_font==="system"?"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif":ar?"Tahoma,Arial,sans-serif":"Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const isPdf=req.query&&req.query.render==="pdf";
  if(!isPdf){
    await db.query("UPDATE invoices SET first_viewed_at=COALESCE(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,status=CASE WHEN status='sent' THEN 'viewed' ELSE status END WHERE id=$1",[x.id]);
    await db.query("INSERT INTO document_events (business_id,invoice_id,event_type,metadata) VALUES ($1,$2,'viewed',$3::jsonb)",[x.business_id,x.id,JSON.stringify({source:"secure_link"})]);
  }
  const bank=[x.bank_name&&`${ar?"البنك":"Bank"}: ${e(x.bank_name)}`,x.account_name&&`${ar?"اسم الحساب":"Account"}: ${e(x.account_name)}`,x.iban&&`IBAN: ${e(x.iban)}`,x.swift&&`SWIFT: ${e(x.swift)}`].filter(Boolean).join("<br>");

  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="${ar?"ar":"en"}" dir="${ar?"rtl":"ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(T.title)} ${e(x.invoice_number)}</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#eef3f2;color:#243747;font-family:${font}}
  .bar{max-width:900px;margin:20px auto 0;display:flex;justify-content:flex-end;gap:8px}.bar button{border:0;border-radius:9px;padding:10px 14px;font-weight:700;cursor:pointer}.primary{background:${accent};color:#fff}.page{width:min(900px,calc(100% - 24px));min-height:1120px;margin:14px auto 40px;background:#fff;padding:54px;box-shadow:0 18px 60px rgba(16,42,67,.12)}
  .head{display:flex;justify-content:space-between;gap:30px}.logo{max-width:150px;max-height:70px;margin-bottom:12px}.seller h2{margin:0;color:#102a43}.muted{color:#647784;line-height:1.55}.title{text-align:${ar?"left":"right"}.title h1{margin:0;color:#102a43;letter-spacing:.04em}.meta{margin-top:10px;display:grid;grid-template-columns:auto auto;gap:5px 18px}.meta strong{text-align:${ar?"left":"right"}}
  .bill{margin-top:30px;background:#f5f8f8;padding:16px;border-radius:12px}.label{text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800;color:#7b8c96}.bill h3{margin:6px 0}
  table{width:100%;border-collapse:collapse;margin-top:24px}th{background:#102a43;color:#fff;font-size:10px;text-transform:uppercase;text-align:${ar?"right":"left"};padding:10px}td{padding:11px 10px;border-bottom:1px solid #e6eeee;vertical-align:top}.num{text-align:${ar?"left":"right"}}.desc{font-size:10px;color:#73858f;margin-top:4px}.totals{width:48%;margin:20px ${ar?"auto 0 0":"0 0 0 auto"}}.totals div{display:flex;justify-content:space-between;padding:5px 0}.grand{border-top:2px solid #102a43;margin-top:5px;padding-top:10px!important;font-size:17px;font-weight:900}.foot{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:38px;padding-top:18px;border-top:1px solid #dce6e4;font-size:12px}.note{margin-top:22px;color:#647784;line-height:1.6}
  @media(max-width:700px){.page{padding:26px;min-height:auto}.head{flex-direction:column}.title{text-align:start}.meta strong{text-align:start}.totals{width:75%}.foot{grid-template-columns:1fr}.bar{padding:0 12px}}
  @media print{body{background:#fff}.bar{display:none}.page{width:210mm;min-height:297mm;margin:0;padding:14mm;box-shadow:none}}
  </style></head><body>
  <div class="bar"><button class="primary" onclick="window.print()">${T.print}</button></div>
  <main class="page">
    <div class="head">
      <div class="seller">${x.logo_url?`<img class="logo" src="${e(x.logo_url)}" alt="">`:""}<h2>${e(seller)}</h2><div class="muted">${e(x.business_address||"United Arab Emirates")}<br>${x.business_trn?`TRN: ${e(x.business_trn)}<br>`:""}${e(x.business_email||"")}${x.business_phone?` · ${e(x.business_phone)}`:""}</div></div>
      <div class="title"><h1>${e(T.title)}</h1><div class="meta"><span>${T.invoice}</span><strong>${e(x.invoice_number)}</strong><span>${T.date}</span><strong>${e(String(x.invoice_date).slice(0,10))}</strong>${x.supply_date&&String(x.supply_date).slice(0,10)!==String(x.invoice_date).slice(0,10)?`<span>${T.supply}</span><strong>${e(String(x.supply_date).slice(0,10))}</strong>`:""}<span>${T.due}</span><strong>${e(x.due_date?String(x.due_date).slice(0,10):"—")}</strong>${x.salesperson_name?`<span>${T.salesperson}</span><strong>${e(x.salesperson_name)}</strong>`:""}</div></div>
    </div>
    <div class="bill"><div class="label">${T.bill}</div><h3>${e(customer)}</h3><div class="muted">${e(x.billing_address||"")}${x.customer_trn?`<br>TRN: ${e(x.customer_trn)}`:""}</div></div>
    <table><thead><tr><th>${T.desc}</th><th class="num">${T.qty}</th><th class="num">${T.unit}</th>${full?`<th class="num">${T.vatRate}</th><th class="num">${T.vat}</th>`:""}<th class="num">${T.amount}</th></tr></thead>
    <tbody>${items.map(it=>`<tr><td><strong>${e(it.item_name)}</strong>${it.description?`<div class="desc">${e(it.description)}</div>`:""}${Number(it.discount_percent)>0?`<div class="desc">${T.discount}: ${e(it.discount_percent)}%</div>`:""}</td><td class="num">${e(it.quantity)}</td><td class="num">${m(it.rate,x.currency)}</td>${full?`<td class="num">${Number(it.tax_rate||0).toFixed(2)}%</td><td class="num">${m(it.line_tax,x.currency)}</td>`:""}<td class="num">${m(it.line_subtotal,x.currency)}</td></tr>`).join("")}</tbody></table>
    <div class="totals"><div><span>${T.subtotal}</span><span>${m(x.subtotal,x.currency)}</span></div>${Number(x.discount_amount)>0?`<div><span>${T.discount}${x.discount_type==="percent"?` (${e(x.discount_value)}%)`:""}</span><span>-${m(x.discount_amount,x.currency)}</span></div>`:""}${x.vat_registered?`<div><span>${T.vat}</span><span>${m(x.vat_amount,x.currency)}</span></div>`:""}${x.vat_registered&&x.currency!=="AED"?`<div><span>${T.vatAed}</span><span>AED ${Number(x.vat_amount_aed||0).toFixed(2)}</span></div><div><span>${T.fx}</span><span>${e(x.exchange_rate_to_aed)}</span></div>`:""}<div class="grand"><span>${T.total}</span><span>${m(x.total,x.currency)}</span></div>${Number(x.amount_paid)>0?`<div><span>${T.paid}</span><span>${m(x.amount_paid,x.currency)}</span></div><div><strong>${T.balance}</strong><strong>${m(Number(x.total)-Number(x.amount_paid),x.currency)}</strong></div>`:""}</div>
    <div class="foot"><div>${bank?`<strong>${T.bank}</strong><br><span class="muted">${bank}</span>`:""}</div><div>${x.payment_instructions?`<strong>${T.payment}</strong><br><span class="muted">${e(x.payment_instructions)}</span>`:""}</div></div>
    <div class="note">${x.notes?`<strong>${T.note}</strong><br>${e(x.notes)}<br><br>`:""}${x.terms?`<strong>${T.terms}</strong><br>${e(x.terms)}`:""}${x.invoice_footer?`<br><br>${e(x.invoice_footer)}`:""}</div>
    ${x.hide_platform_branding?"":`<div style="margin-top:28px;text-align:center;font-size:9px;color:#a1afb6">Created with Perficient Zone Billing</div>`}
  </main></body></html>`);
}