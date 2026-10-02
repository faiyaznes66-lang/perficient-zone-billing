const API=(window.__APP_CONFIG__&&window.__APP_CONFIG__.api)||"/api";
const authClient=window.supabase.createClient(window.__APP_CONFIG__.supabaseUrl,window.__APP_CONFIG__.supabaseAnonKey);
const state={
  user:null,business:null,customers:[],invoices:[],products:[],quotes:[],payments:[],expenses:[],recurring:[],challans:[],timeEntries:[],projects:[],refunds:[],bankCharges:[],badDebts:[],reviews:[],
  dashboard:null,dashboardYear:new Date().getFullYear(),report:null,planState:null,einvoice:null,view:"dashboard",template:"classic",editing:null,quoteEditing:null
};

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=(n,c="AED")=>`${c} ${Number(n||0).toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today=()=>new Date().toISOString().slice(0,10);
const plusDays=(d,n)=>{const x=new Date(d+"T12:00:00");x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

async function api(path,opts={}){
  const {data:{session}}=await authClient.auth.getSession();
  const headers={...(opts.headers||{})};
  if(session&&session.access_token)headers.Authorization="Bearer "+session.access_token;
  if(!(opts.body instanceof FormData))headers["Content-Type"]=headers["Content-Type"]||"application/json";
  const res=await fetch(API+path,{...opts,headers});
  if(res.status===401){location.href="/login?next="+encodeURIComponent("/app/");throw new Error("Sign in required")}
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Something went wrong");
  return data;
}

async function boot(){
  const {data:{session}}=await authClient.auth.getSession();
  if(!session||!session.user){location.replace("/login?next=/app/");return}
  state.user=session.user;$("#user-email").textContent=session.user.email||"Signed in";
  $("#signout").onclick=async()=>{await authClient.auth.signOut();location.href="/"};
  $("#menu-btn").onclick=()=>$(".sidebar").classList.toggle("open");
  $("#new-invoice-top").onclick=()=>showInvoiceEditor();
  $$("#side-nav button[data-view]").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  await loadBusiness();
  if(!state.business){renderSetup();return}
  await loadAll();
  navigate("dashboard");
}
async function loadBusiness(){state.business=(await api("/business")).business}
async function loadCustomers(){state.customers=(await api("/customers")).customers}
async function loadInvoices(){state.invoices=(await api("/invoices")).invoices}
async function loadProducts(){state.products=(await api("/products")).products}
async function loadQuotes(){state.quotes=(await api("/quotes")).quotes}
async function loadPayments(){state.payments=(await api("/payments")).payments}
async function loadExpenses(){state.expenses=(await api("/expenses")).expenses}
async function loadRecurring(){state.recurring=(await api("/recurring")).recurring}
async function loadChallans(){state.challans=(await api("/delivery-challans")).challans}
async function loadTimeEntries(){state.timeEntries=(await api("/time-entries")).entries}
async function loadProjects(){state.projects=(await api("/projects")).projects}
async function loadRefunds(){state.refunds=(await api("/refunds")).refunds}
async function loadBankCharges(){state.bankCharges=(await api("/bank-charges")).bank_charges}
async function loadBadDebts(){state.badDebts=(await api("/bad-debts")).bad_debts}
async function loadReviews(){state.reviews=(await api("/customer-reviews")).reviews}
async function loadDashboard(year=state.dashboardYear){state.dashboardYear=Number(year)||new Date().getFullYear();state.dashboard=await api("/dashboard?year="+encodeURIComponent(state.dashboardYear))}
async function loadReport(){state.report=await api("/reports")}
async function loadPlan(){state.planState=await api("/plan")}
async function loadEinvoice(){state.einvoice=await api("/einvoicing-status")}
async function loadAll(){await Promise.all([loadCustomers(),loadInvoices(),loadProducts(),loadQuotes(),loadPayments(),loadExpenses(),loadRecurring(),loadChallans(),loadTimeEntries(),loadProjects(),loadRefunds(),loadBankCharges(),loadBadDebts(),loadReviews(),loadDashboard(),loadReport(),loadPlan(),loadEinvoice()])}

function navActive(view){
  state.view=view;
  $$("#side-nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $(".sidebar").classList.remove("open");
  const labels={dashboard:"Home",customers:"Customers",products:"Items",quotes:"Quotes",invoices:"Invoices",challans:"Delivery Challans",payments:"Payments Received",expenses:"Expenses",time:"Time Tracking",projects:"Projects",reports:"Reports",recurring:"Advanced Billing",templates:"Templates",billing:"Plans",settings:"Settings"};
  $("#page-title").textContent=labels[view]||"Perficient Zone";
}
function navigate(view){
  if(!state.business){renderSetup();return}
  navActive(view);
  const routes={dashboard:renderDashboard,customers:renderCustomers,products:renderProducts,quotes:renderQuotes,invoices:renderInvoices,challans:renderChallans,payments:renderPayments,expenses:renderExpenses,time:renderTimeTracking,projects:renderProjects,reports:renderReports,recurring:renderRecurring,templates:renderTemplates,billing:renderBilling,settings:renderSettings};
  if(routes[view])routes[view]();
}
function renderSetup(){
  $("#page-title").textContent="Business setup";$("#new-invoice-top").classList.add("hidden");
  const node=$("#tpl-setup").content.cloneNode(true),content=$("#content");content.innerHTML="";content.append(node);
  $("#business-form").onsubmit=async e=>{
    e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());
    body.vat_registered=body.vat_registered==="true";body.default_tax_rate=Number(body.default_tax_rate||5);
    try{
      state.business=(await api("/business",{method:"POST",body:JSON.stringify(body)})).business;
      $("#new-invoice-top").classList.remove("hidden");await loadAll();navigate("dashboard");
    }catch(err){alert(err.message)}
  };
}

function compactAxisAmount(n,currency){
  const v=Number(n||0);
  if(v>=1000000)return currency+" "+(v/1000000).toFixed(v>=10000000?0:1)+"M";
  if(v>=1000)return currency+" "+(v/1000).toFixed(v>=10000?0:1)+"K";
  return currency+" "+Math.round(v).toLocaleString("en-AE");
}
function niceChartMax(values){
  const raw=Math.max(1,...values.map(Number).filter(Number.isFinite));
  const power=Math.pow(10,Math.floor(Math.log10(raw)));
  const n=raw/power;
  const nice=n<=1?1:n<=2?2:n<=5?5:10;
  return nice*power;
}
function salesExpensesChart(fiscal,currency){
  const f=fiscal||{year:new Date().getFullYear(),months:[],totals:{}};
  const months=Array.from({length:12},(_,i)=>f.months&&f.months[i]?f.months[i]:{month:i+1,sales:0,receipts:0,expenses:0});
  const names=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const max=niceChartMax(months.flatMap(x=>[x.sales,x.receipts,x.expenses]));
  const ticks=[max,max*.75,max*.5,max*.25,0];
  const pct=v=>Math.max(0,Math.min(100,(Number(v||0)/max)*100));
  const currentYear=new Date().getFullYear();
  const years=[];for(let y=currentYear+1;y>=currentYear-4;y--)years.push(y);
  if(!years.includes(Number(f.year)))years.push(Number(f.year));
  years.sort((a,b)=>b-a);
  return `
  <div class="sales-expenses-panel">
    <div class="se-head">
      <div><h3>Sales and Expenses</h3><div class="se-legend"><span><i class="sales-dot"></i>Sales</span><span><i class="receipt-dot"></i>Receipts</span><span><i class="expense-dot"></i>Expenses</span></div></div>
      <select id="dashboard-year" class="se-year-select">${years.map(y=>`<option value="${y}" ${Number(f.year)===y?"selected":""}>${y===currentYear?"This Fiscal Year · ":""}${y}</option>`).join("")}</select>
    </div>
    <div class="se-body">
      <div class="se-chart-wrap">
        <div class="se-y-axis">${ticks.map(t=>`<span>${compactAxisAmount(t,currency)}</span>`).join("")}</div>
        <div class="se-plot">
          <div class="se-gridlines">${ticks.map((_,i)=>`<i style="top:${i*25}%"></i>`).join("")}</div>
          <div class="se-bars">
            ${months.map((x,i)=>`<div class="se-month-col">
              <div class="se-bar-area">
                <div class="se-bar sales-bar" style="height:${pct(x.sales)}%" title="${names[i]} sales: ${money(x.sales,currency)}"></div>
                <div class="se-bar receipt-bar" style="height:${pct(x.receipts)}%" title="${names[i]} receipts: ${money(x.receipts,currency)}"></div>
                <div class="se-bar expense-bar" style="height:${pct(x.expenses)}%" title="${names[i]} expenses: ${money(x.expenses,currency)}"></div>
              </div>
              <div class="se-month-label"><strong>${names[i]}</strong><small>${f.year}</small></div>
            </div>`).join("")}
          </div>
        </div>
      </div>
      <aside class="se-summary">
        <div class="se-summary-item sales"><span>Total Sales</span><strong>${money(f.totals&&f.totals.sales||0,currency)}</strong></div>
        <div class="se-summary-item receipts"><span>Total Receipts</span><strong>${money(f.totals&&f.totals.receipts||0,currency)}</strong></div>
        <div class="se-summary-item expenses"><span>Total Expenses</span><strong>${money(f.totals&&f.totals.expenses||0,currency)}</strong></div>
      </aside>
    </div>
    <div class="se-foot">Sales are based on issued invoices and include VAT where applicable. Receipts are based on recorded payments; expenses are based on recorded expense entries.</div>
  </div>`;
}

function renderDashboard(){
  const d=state.dashboard||{metrics:{},receivables:{},recent:[]},m=d.metrics||{},r=d.receivables||{},c=state.business.currency||"AED";
  $("#content").innerHTML=`
    <div class="page-head"><div><h1>Home</h1><p>${esc(state.business.legal_name)} · Perficient Zone billing workspace.</p></div><button class="btn btn-primary" id="dash-new">+ New invoice</button></div>

    <div class="receivables-panel">
      <div class="receivables-head">
        <div><span class="receivables-kicker">Accounts Receivable</span><h3>Total Receivables</h3></div>
        <div class="receivables-total"><span>Total outstanding</span><strong>${money(r.total||0,c)}</strong></div>
      </div>
      <div class="aging-grid">
        <div class="aging-card current">
          <span class="aging-label">Current</span>
          <strong>${money(r.current||0,c)}</strong>
          <small>Not yet overdue</small>
        </div>
        <div class="aging-card overdue-total">
          <span class="aging-label">Overdue</span>
          <strong>${money(r.overdue_total||0,c)}</strong>
          <small>Total past due</small>
        </div>
        <div class="aging-card">
          <span class="aging-label">1–15 Days</span>
          <strong>${money(r.days_1_15||0,c)}</strong>
          <small>Past due</small>
        </div>
        <div class="aging-card">
          <span class="aging-label">16–30 Days</span>
          <strong>${money(r.days_16_30||0,c)}</strong>
          <small>Past due</small>
        </div>
        <div class="aging-card">
          <span class="aging-label">31–45 Days</span>
          <strong>${money(r.days_31_45||0,c)}</strong>
          <small>Past due</small>
        </div>
        <div class="aging-card">
          <span class="aging-label">Above 45 Days</span>
          <strong>${money(r.above_45||0,c)}</strong>
          <small>Past due</small>
        </div>
      </div>
    </div>

    ${salesExpensesChart(d.fiscal,c)}

    <div class="metric-grid">
      <div class="metric"><div class="label">Total invoiced</div><div class="value">${money(m.invoiced,c)}</div></div>
      <div class="metric"><div class="label">Paid</div><div class="value">${money(m.paid,c)}</div></div>
      <div class="metric"><div class="label">Outstanding</div><div class="value">${money(m.outstanding,c)}</div></div>
      <div class="metric"><div class="label">Overdue</div><div class="value ${Number(m.overdue)>0?"danger":""}">${money(m.overdue,c)}</div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Recent invoices</h3><button class="btn btn-ghost" id="all-inv">View all</button></div>${invoiceTable(d.recent||[])}</div>`;
  $("#dash-new").onclick=()=>showInvoiceEditor();$("#all-inv").onclick=()=>navigate("invoices");
  const fy=$("#dashboard-year");if(fy)fy.onchange=async()=>{fy.disabled=true;try{await loadDashboard(Number(fy.value));renderDashboard()}catch(err){alert(err.message)}};
  bindInvoiceRows();
}
function invoiceTable(rows){
  if(!rows.length)return `<div class="empty"><strong>No invoices yet</strong>Create your first invoice and it will appear here.</div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th>Amount</th><th>Balance</th></tr></thead><tbody>
  ${rows.map(i=>`<tr class="invoice-row" data-id="${i.id}" style="cursor:pointer"><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.customer_name||"—")}</td><td>${esc(String(i.invoice_date||"").slice(0,10))}</td><td><span class="status ${esc(i.status)}">${esc(i.status)}</span></td><td class="money">${money(i.total,i.currency||state.business.currency)}</td><td class="money">${money(Math.max(0,Number(i.total)-Number(i.amount_paid)),i.currency||state.business.currency)}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function bindInvoiceRows(){$$(".invoice-row").forEach(r=>r.onclick=()=>openInvoice(r.dataset.id))}
function renderInvoices(){
  const ps=state.planState,can=!ps||ps.can_create_invoice;
  const usage=ps&&ps.plan&&ps.plan.monthly_invoice_limit!==null?`${ps.usage.invoices_this_month}/${ps.plan.monthly_invoice_limit} invoices used this month`:ps?`${ps.usage.invoices_this_month} invoices this month · unlimited`:"";
  $("#content").innerHTML=`<div class="page-head"><div><h1>Invoices</h1><p>Create, share and track customer invoices. ${esc(usage)}</p></div><button class="btn btn-primary" id="inv-new" ${can?"":"disabled"}>+ New invoice</button></div>${can?"":`<div class="panel"><div style="padding:16px"><strong>Monthly invoice limit reached.</strong><p class="muted">Upgrade your plan to create additional invoices this month.</p><button class="btn btn-outline" id="view-plans">View plans</button></div></div>`}<div class="panel">${invoiceTable(state.invoices)}</div>`;
  $("#inv-new").onclick=()=>showInvoiceEditor();const vp=$("#view-plans");if(vp)vp.onclick=()=>navigate("billing");bindInvoiceRows();
}

function renderCustomers(){
  const portalAvailable=!!(state.planState&&state.planState.plan&&state.planState.plan.portal);
  $("#content").innerHTML=`<div class="page-head"><div><h1>Customers</h1><p>Complete customer profiles for invoicing, portal access and UAE e-invoicing readiness.</p></div><button class="btn btn-primary" id="add-customer">+ New customer</button></div>
  ${!portalAvailable?`<div class="panel"><div style="padding:16px"><strong>Customer portal is a Pro feature.</strong><p class="muted">You can still enable portal access on the customer record now; the full portal becomes available when the account plan supports it.</p></div></div>`:""}
  <div class="customer-grid">${state.customers.length?state.customers.map(c=>`<article class="customer-card customer-profile-card">
    <div class="customer-card-head"><div><span class="customer-type-pill">${esc(c.customer_type||"business")}</span><h3>${esc(c.display_name_primary||c.company||c.name)}</h3></div><button class="icon-btn customer-edit" data-id="${c.id}" title="Edit customer">✎</button></div>
    <p>${esc(c.legal_name||c.company||[c.first_name,c.last_name].filter(Boolean).join(" ")||"")}</p>
    <p>${esc(c.email||"No email")} ${c.mobile?" · "+esc(c.mobile):""}</p>
    <p>${c.trn?"TRN "+esc(c.trn):c.tin_number?"TIN "+esc(c.tin_number):"No tax identifier saved"}</p>
    <div class="customer-card-actions"><button class="btn btn-primary customer-view" data-id="${c.id}">View</button><button class="btn btn-outline customer-edit" data-id="${c.id}">Edit</button>${portalAvailable?`<button class="btn btn-outline customer-portal" data-id="${c.id}">Portal</button>`:""}</div>
  </article>`).join(""):`<div class="empty"><strong>No customers yet</strong>Create a customer with contact, address, tax and portal details.</div>`}</div>`;
  $("#add-customer").onclick=()=>showCustomerModal();
  $$(".customer-view").forEach(b=>b.onclick=()=>openCustomerDetail(b.dataset.id));
  $$(".customer-edit").forEach(b=>b.onclick=()=>showCustomerModal(state.customers.find(c=>String(c.id)===String(b.dataset.id))));
  $$(".customer-portal").forEach(b=>b.onclick=async()=>{try{const d=await api("/customer-portal/"+b.dataset.id);const action=prompt("Customer portal link. Type COPY to copy it or OPEN to open it:",d.url);if(String(action||"").toUpperCase()==="OPEN")window.open(d.url,"_blank");if(String(action||"").toUpperCase()==="COPY"){await navigator.clipboard.writeText(d.url);alert("Portal link copied.")}}catch(err){alert(err.message)}});
}
async function openCustomerDetail(id,initialTab="overview"){
  try{
    const data=await api("/customer-overview/"+id);
    navActive("customers");$("#page-title").textContent="Customer";
    const c=data.customer,cur=data.business.currency||state.business.currency||"AED";
    const portalAvailable=!!(state.planState&&state.planState.plan&&state.planState.plan.portal);

    const info=(label,value)=>value?`<div class="customer-info-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`:"";
    const empty=msg=>`<div class="empty">${esc(msg)}</div>`;

    const renderTab=tab=>{
      let body="";
      if(tab==="overview"){
        body=`<div class="customer-overview-grid">
          <section class="customer-detail-card"><h3>Customer information</h3><div class="customer-info-grid">
            ${info("Customer type",String(c.customer_type||"business").replace(/^./,x=>x.toUpperCase()))}
            ${info("Legal name",c.legal_name||c.company)}
            ${info("Display name",c.display_name_primary||c.name)}
            ${info("Arabic display name",c.display_name_ar)}
            ${info("Email",c.email)}
            ${info("Mobile",c.mobile)}
            ${info("Work phone",c.work_phone||c.phone)}
            ${info("Customer language",c.customer_language==="ar"?"Arabic":"English")}
            ${info("Currency",c.currency||cur)}
            ${info("Payment terms",Number(c.payment_terms_days||0)===0?"Due on receipt":"Net "+Number(c.payment_terms_days)+" days")}
            ${info("Portal",c.portal_enabled!==false?"Enabled":"Disabled")}
            ${info("Customer owner",c.customer_owner_email)}
          </div></section>
          <section class="customer-detail-card"><h3>Address</h3><div class="customer-address-block">${esc(c.billing_address||[c.address_line1,c.address_line2,c.city,c.emirate,c.postal_code,c.country].filter(Boolean).join(", ")||"No address saved")}</div></section>
          <section class="customer-detail-card"><h3>Tax & electronic invoicing</h3><div class="customer-info-grid">
            ${info("TRN",c.trn)}${info("TIN",c.tin_number)}${info("Buyer ID",c.buyer_id_value)}${info("Buyer ID authority",c.buyer_id_authority)}
            ${info("Location code type",c.location_code_type)}${info("Location code",c.location_code_value)}${info("Electronic address",c.electronic_address)}
          </div></section>
          <section class="customer-detail-card"><h3>Remarks</h3><p class="customer-long-text">${esc(c.remarks||c.notes||"No remarks added.")}</p></section>
        </div>`;
      }else if(tab==="transactions"){
        body=data.transactions.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Number / Reference</th><th>Status</th><th>Amount</th></tr></thead><tbody>${data.transactions.map(x=>`<tr ${x.type==="invoice"?`class="customer-invoice-link" data-id="${x.id}" style="cursor:pointer"`:""}><td>${esc(x.date)}</td><td><span class="customer-transaction-type ${esc(x.type)}">${esc(x.type)}</span></td><td>${esc(x.number||"—")}</td><td>${esc(String(x.status||"").replaceAll("_"," "))}</td><td class="money">${money(x.amount,x.currency||cur)}</td></tr>`).join("")}</tbody></table></div>`:empty("No customer transactions yet.");
      }else if(tab==="quotes"){
        body=data.quotes.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Quote</th><th>Date</th><th>Expiry</th><th>Status</th><th>Total</th><th>Converted</th></tr></thead><tbody>${data.quotes.map(x=>`<tr><td><strong>${esc(x.quote_number)}</strong></td><td>${esc(String(x.quote_date).slice(0,10))}</td><td>${esc(x.expiry_date?String(x.expiry_date).slice(0,10):"—")}</td><td><span class="status ${esc(x.status)}">${esc(x.status)}</span></td><td class="money">${money(x.total,x.currency||cur)}</td><td>${x.converted_invoice_id?"Yes":"No"}</td></tr>`).join("")}</tbody></table></div>`:empty("No quotes for this customer.");
      }else if(tab==="invoices"){
        body=data.invoices.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${data.invoices.map(x=>`<tr class="customer-invoice-link" data-id="${x.id}" style="cursor:pointer"><td><strong>${esc(x.invoice_number)}</strong></td><td>${esc(String(x.invoice_date).slice(0,10))}</td><td>${esc(x.due_date?String(x.due_date).slice(0,10):"—")}</td><td><span class="status ${esc(x.status)}">${esc(String(x.status).replaceAll("_"," "))}</span></td><td class="money">${money(x.total,x.currency||cur)}</td><td class="money">${money(x.amount_paid,x.currency||cur)}</td><td class="money">${money(x.balance,x.currency||cur)}</td></tr>`).join("")}</tbody></table></div>`:empty("No invoices for this customer.");
      }else if(tab==="payments"){
        body=data.payments.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${data.payments.map(x=>`<tr><td>${esc(String(x.payment_date).slice(0,10))}</td><td>${esc(x.invoice_number||"—")}</td><td>${esc(String(x.method||"").replaceAll("_"," "))}</td><td>${esc(x.reference||"—")}</td><td class="money">${money(x.amount,x.currency||cur)}</td></tr>`).join("")}</tbody></table></div>`:empty("No payments received from this customer.");
      }else if(tab==="statement"){
        body=`<div class="customer-statement-toolbar"><div><strong>Customer Statement</strong><span>Issued invoices and recorded payments</span></div><div><button class="btn btn-outline" id="customer-statement-csv">Download CSV</button><button class="btn btn-outline" id="customer-statement-print">Print / PDF</button></div></div>
        ${data.statement.length?`<div class="table-wrap"><table class="data-table customer-statement-table"><thead><tr><th>Date</th><th>Document</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${data.statement.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.document)}</td><td>${esc(x.description)}</td><td class="money">${x.debit?money(x.debit,x.currency||cur):"—"}</td><td class="money">${x.credit?money(x.credit,x.currency||cur):"—"}</td><td class="money"><strong>${money(x.balance,x.currency||cur)}</strong></td></tr>`).join("")}</tbody></table></div>`:empty("No issued invoices or payments available for a statement.")}`;
      }else if(tab==="documents"){
        body=`<div class="customer-doc-tab-head"><div><strong>Documents</strong><span>Maximum 3 files, 10 MB each. Files open through your authenticated session.</span></div><button class="btn btn-outline" id="customer-manage-docs">Manage documents</button></div>${data.documents.length?`<div class="customer-document-grid">${data.documents.map(x=>`<button type="button" class="customer-document-card customer-doc-open" data-id="${x.id}" data-name="${esc(x.file_name)}"><strong>${esc(x.file_name)}</strong><span>${esc(x.content_type||"Document")}</span><small>${(Number(x.size_bytes||0)/1024/1024).toFixed(2)} MB · ${esc(new Date(x.created_at).toLocaleDateString())}</small></button>`).join("")}</div>`:empty("No documents uploaded for this customer.")}`;
      }else if(tab==="contacts"){
        body=`<div class="customer-contacts-head"><div><strong>Contact Persons</strong><span>Saved contacts for this customer</span></div><button class="btn btn-outline" id="customer-edit-contacts">Edit contacts</button></div>${data.contacts.length?`<div class="customer-contact-grid">${data.contacts.map(x=>`<article class="customer-contact-card"><div class="customer-contact-avatar">${esc(String(x.name||"?").slice(0,1).toUpperCase())}</div><div><h4>${esc(x.name||"Unnamed contact")}</h4><p>${esc(x.designation||"")}</p><p>${esc(x.email||"")}</p><p>${esc(x.phone||"")}</p></div></article>`).join("")}</div>`:empty("No contact persons saved.")}`;
      }else if(tab==="reviews"){
        body=`<div class="customer-contacts-head"><div><strong>Customer Reviews</strong><span>Internal review history and permission to reuse testimonials.</span></div><button class="btn btn-primary" id="customer-add-review">+ Add review</button></div>${data.reviews.length?`<div class="customer-review-grid">${data.reviews.map(x=>`<article class="customer-review-card"><div class="review-stars">${"★".repeat(Number(x.rating||0))}${"☆".repeat(Math.max(0,5-Number(x.rating||0)))}</div><h4>${esc(x.title||"Customer review")}</h4><p>${esc(x.review_text||"")}</p><small>${esc(String(x.review_date).slice(0,10))} · ${esc(x.source||"direct")} · ${x.public_permission?"Public use allowed":"Internal only"}</small></article>`).join("")}</div>`:empty("No customer reviews recorded.")}`;
      }
      return body;
    };

    const render=tab=>{
      const displayName=c.display_name_primary||c.company||c.name;
      $("#content").innerHTML=`<div class="customer-detail-head">
        <div class="customer-detail-title"><button class="btn btn-ghost" id="customer-back">← Customers</button><div><span class="customer-type-pill">${esc(c.customer_type||"business")}</span><h1>${esc(displayName)}</h1><p>${esc(c.legal_name||c.company||"")}${c.display_name_ar?` · <span dir="rtl">${esc(c.display_name_ar)}</span>`:""}</p></div></div>
        <div class="customer-detail-actions"><button class="btn btn-outline" id="customer-edit-detail">Edit</button>${portalAvailable&&c.portal_enabled!==false?`<button class="btn btn-outline" id="customer-open-portal">Portal</button>`:""}<button class="btn btn-primary" id="customer-new-invoice">+ New invoice</button></div>
      </div>
      <div class="customer-summary-grid">
        <div class="metric"><div class="label">Total invoiced</div><div class="value">${money(data.summary.invoiced,cur)}</div></div>
        <div class="metric"><div class="label">Paid</div><div class="value">${money(data.summary.paid,cur)}</div></div>
        <div class="metric"><div class="label">Outstanding</div><div class="value">${money(data.summary.outstanding,cur)}</div></div>
        <div class="metric"><div class="label">Overdue</div><div class="value ${Number(data.summary.overdue)>0?"danger":""}">${money(data.summary.overdue,cur)}</div></div>
      </div>
      <div class="customer-detail-shell">
        <nav class="customer-tabs">${[["overview","Overview"],["transactions","Transactions"],["quotes","Quotes"],["invoices","Invoices"],["payments","Payments"],["statement","Statement"],["documents","Documents"],["contacts","Contacts"],["reviews","Reviews"]].map(([k,n])=>`<button data-tab="${k}" class="${tab===k?"active":""}">${n}${["quotes","invoices","payments","documents","contacts","reviews"].includes(k)?` <small>${k==="quotes"?data.summary.quotes:k==="invoices"?data.summary.invoices:k==="payments"?data.summary.payments:k==="documents"?data.summary.documents:k==="reviews"?data.summary.reviews:data.contacts.length}</small>`:""}</button>`).join("")}</nav>
        <section class="customer-tab-panel">${renderTab(tab)}</section>
      </div>`;

      $("#customer-back").onclick=()=>renderCustomers();
      $("#customer-edit-detail").onclick=()=>showCustomerModal(c);
      $("#customer-new-invoice").onclick=()=>{showInvoiceEditor();state.editing.customer_id=c.id;const sel=$("#f-customer");if(sel)sel.value=c.id;renderPreview()};
      const portal=$("#customer-open-portal");if(portal)portal.onclick=async()=>{try{const d=await api("/customer-portal/"+c.id);window.open(d.url,"_blank")}catch(err){alert(err.message)}};
      $$(".customer-tabs button").forEach(b=>b.onclick=()=>render(b.dataset.tab));
      $$(".customer-invoice-link").forEach(row=>row.onclick=()=>openInvoice(row.dataset.id));

      const manage=$("#customer-manage-docs");if(manage)manage.onclick=()=>showCustomerModal(c);
      $(".customer-doc-open").forEach(b=>b.onclick=async()=>{try{
        const {data:{session}}=await authClient.auth.getSession();
        const res=await fetch(API+"/customer-documents/"+c.id+"?document_id="+encodeURIComponent(b.dataset.id),{headers:{Authorization:"Bearer "+session.access_token}});
        if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||"Could not open document")}
        const blob=await res.blob(),url=URL.createObjectURL(blob),w=window.open(url,"_blank");
        if(!w){const a=document.createElement("a");a.href=url;a.download=b.dataset.name||"document";a.click()}
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(err){alert(err.message)}});
      const editContacts=$("#customer-edit-contacts");if(editContacts)editContacts.onclick=()=>showCustomerModal(c);
      const addReview=$("#customer-add-review");if(addReview)addReview.onclick=()=>showCustomerReviewModal(c.id,async()=>openCustomerDetail(c.id,"reviews"));

      const csv=$("#customer-statement-csv");if(csv)csv.onclick=()=>{
        const rows=[["Date","Document","Description","Debit","Credit","Balance"],...data.statement.map(x=>[x.date,x.document,x.description,x.debit||"",x.credit||"",x.balance])];
        const text=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
        const blob=new Blob(["\ufeff"+text],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=(displayName||"customer").replace(/[^a-zA-Z0-9_-]/g,"_")+"-statement.csv";a.click();URL.revokeObjectURL(url);
      };
      const print=$("#customer-statement-print");if(print)print.onclick=()=>{
        const w=window.open("","_blank");
        w.document.write(`<!doctype html><html><head><title>Customer Statement</title><style>body{font-family:Arial;padding:28px;color:#1F2E3D}h1{color:#112B4A;margin-bottom:4px}p{color:#66788A}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#112B4A;color:white;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #ddd}.num{text-align:right}</style></head><body><h1>Customer Statement</h1><p>${esc(displayName)} · ${esc(data.business.name)}</p><table><thead><tr><th>Date</th><th>Document</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${data.statement.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.document)}</td><td>${esc(x.description)}</td><td class="num">${x.debit?money(x.debit,x.currency||cur):"—"}</td><td class="num">${x.credit?money(x.credit,x.currency||cur):"—"}</td><td class="num"><strong>${money(x.balance,x.currency||cur)}</strong></td></tr>`).join("")}</tbody></table></body></html>`);
        w.document.close();w.focus();w.print();
      };
    };
    render(initialTab);
  }catch(err){alert(err.message)}
}

function showCustomerReviewModal(customerId,onDone){
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Add customer review</h2><button class="icon-btn close-modal">×</button></div>
    <form class="form-grid customer-review-form">
      <label>Review date<input name="review_date" type="date" value="${today()}"></label>
      <label>Rating<select name="rating"><option value="5">5 - Excellent</option><option value="4">4 - Very good</option><option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option></select></label>
      <label class="span2">Title<input name="title" placeholder="Short review title"></label>
      <label class="span2">Review<textarea name="review_text" rows="4" placeholder="Customer feedback"></textarea></label>
      <label>Source<select name="source"><option value="direct">Direct</option><option value="google">Google</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="other">Other</option></select></label>
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="public_permission" style="width:auto"> Permission to reuse publicly</label>
      <div class="span2"><button class="btn btn-primary">Save review</button></div>
    </form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".customer-review-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.customer_id=customerId;body.rating=Number(body.rating);body.public_permission=body.public_permission==="on";try{await api("/customer-reviews",{method:"POST",body:JSON.stringify(body)});await loadReviews();wrap.remove();if(onDone)await onDone()}catch(err){alert(err.message)}};
}

function customerContactRowsHtml(rows){
  return (rows||[]).map((x,i)=>`<div class="customer-repeat-row contact-person-row" data-i="${i}">
    <input data-k="name" value="${esc(x.name||"")}" placeholder="Name">
    <input data-k="email" type="email" value="${esc(x.email||"")}" placeholder="Email">
    <input data-k="phone" value="${esc(x.phone||"")}" placeholder="Phone">
    <input data-k="designation" value="${esc(x.designation||"")}" placeholder="Designation">
    <button type="button" class="remove-repeat">×</button>
  </div>`).join("");
}
function customerCustomRowsHtml(rows){
  return (rows||[]).map((x,i)=>`<div class="customer-repeat-row custom-field-row" data-i="${i}">
    <input data-k="label" value="${esc(x.label||"")}" placeholder="Field name">
    <input data-k="value" value="${esc(x.value||"")}" placeholder="Value">
    <span></span><span></span><button type="button" class="remove-repeat">×</button>
  </div>`).join("");
}
async function uploadCustomerDocuments(customerId,files){
  if(!files||!files.length)return;
  if(files.length>3)throw new Error("You can upload a maximum of 3 customer documents");
  for(const f of files)if(f.size>10*1024*1024)throw new Error(f.name+" exceeds the 10 MB limit");
  const fd=new FormData();[...files].forEach(f=>fd.append("documents",f));
  await api("/customer-documents/"+customerId,{method:"POST",body:fd});
}
function showCustomerModal(existing=null){
  const c=existing||{
    customer_type:"business",salutation:"",first_name:"",last_name:"",company:"",display_name_primary:"",display_name_ar:"",
    email:"",phone:"",work_phone:"",mobile:"",customer_language:"en",other_details:"",address_line1:"",address_line2:"",
    city:"",emirate:"Dubai",postal_code:"",country:"United Arab Emirates",contact_persons:[],custom_fields:[],remarks:"",
    trn:"",tin_number:"",buyer_id_value:"",buyer_id_authority:"",legal_name:"",location_code_type:"",location_code_value:"",
    electronic_address:"",payment_terms_days:0,portal_enabled:true,customer_owner_email:state.user&&state.user.email||"",notes:""
  };
  const contacts=Array.isArray(c.contact_persons)?JSON.parse(JSON.stringify(c.contact_persons)):[];
  const custom=Array.isArray(c.custom_fields)?JSON.parse(JSON.stringify(c.custom_fields)):[];
  const wrap=document.createElement("div");wrap.className="modal customer-modal";
  wrap.innerHTML=`<div class="modal-card customer-modal-card">
    <div class="modal-head"><div><h2>${existing?"Edit Customer":"New Customer"}</h2><p class="muted">Customer profile, addresses, contacts, tax identifiers and portal settings.</p></div><button class="icon-btn close-modal">×</button></div>
    <form class="customer-form">
      <section class="customer-section">
        <h3>Customer Type</h3>
        <div class="customer-type-toggle">
          <label><input type="radio" name="customer_type" value="business" ${c.customer_type!=="individual"?"checked":""}> Business</label>
          <label><input type="radio" name="customer_type" value="individual" ${c.customer_type==="individual"?"checked":""}> Individual</label>
        </div>
      </section>

      <section class="customer-section">
        <h3>Primary Contact</h3>
        <div class="customer-form-grid three">
          <label>Salutation<select name="salutation"><option value="">Select</option>${["Mr.","Ms.","Mrs.","Dr."].map(x=>`<option ${c.salutation===x?"selected":""}>${x}</option>`).join("")}</select></label>
          <label>First Name<input name="first_name" value="${esc(c.first_name||"")}"></label>
          <label>Last Name<input name="last_name" value="${esc(c.last_name||"")}"></label>
          <label class="span3">Company Name<input name="company" value="${esc(c.company||"")}"></label>
          <label class="span3">Display Name · In Primary Language<input name="display_name_primary" value="${esc(c.display_name_primary||c.name||"")}" placeholder="Select or type to add"></label>
          <label class="span3">Display Name · In Secondary Language (Arabic)<input name="display_name_ar" dir="rtl" value="${esc(c.display_name_ar||"")}"></label>
        </div>
      </section>

      <section class="customer-section">
        <h3>Contact & Currency</h3>
        <div class="customer-form-grid three">
          <label>Currency<input value="${esc(state.business.currency||"AED")}" disabled><small>Currency is fixed to the business currency in this version.</small></label>
          <label>Email Address<input name="email" type="email" value="${esc(c.email||"")}"></label>
          <label>Phone<input name="phone" value="${esc(c.phone||"")}"></label>
          <label>Work Phone<input name="work_phone" value="${esc(c.work_phone||"")}"></label>
          <label>Mobile<input name="mobile" value="${esc(c.mobile||"")}"></label>
          <label>Customer Language<select name="customer_language"><option value="en" ${c.customer_language!=="ar"?"selected":""}>English</option><option value="ar" ${c.customer_language==="ar"?"selected":""}>Arabic</option></select></label>
        </div>
      </section>

      <details class="customer-details" open>
        <summary>Other Details</summary>
        <div class="customer-section-body">
          <label>Other Details<textarea name="other_details" rows="2">${esc(c.other_details||"")}</textarea></label>
        </div>
      </details>

      <details class="customer-details" open>
        <summary>Address</summary>
        <div class="customer-section-body customer-form-grid three">
          <label class="span3">Address Line 1<input name="address_line1" value="${esc(c.address_line1||"")}"></label>
          <label class="span3">Address Line 2<input name="address_line2" value="${esc(c.address_line2||"")}"></label>
          <label>City<input name="city" value="${esc(c.city||"")}"></label>
          <label>Emirate<select name="emirate">${["Dubai","Abu Dhabi","Sharjah","Ajman","Ras Al Khaimah","Fujairah","Umm Al Quwain"].map(x=>`<option ${(c.emirate||"Dubai")===x?"selected":""}>${x}</option>`).join("")}</select></label>
          <label>Postal Code<input name="postal_code" value="${esc(c.postal_code||"")}"></label>
          <label class="span3">Country<input name="country" value="${esc(c.country||"United Arab Emirates")}"></label>
        </div>
      </details>

      <details class="customer-details" open>
        <summary>Contact Persons</summary>
        <div class="customer-section-body"><div class="contact-persons-host">${customerContactRowsHtml(contacts)}</div><button type="button" class="btn btn-outline add-contact-person">+ Add contact person</button></div>
      </details>

      <details class="customer-details">
        <summary>Custom Fields</summary>
        <div class="customer-section-body"><div class="custom-fields-host">${customerCustomRowsHtml(custom)}</div><button type="button" class="btn btn-outline add-custom-field">+ Add custom field</button></div>
      </details>

      <details class="customer-details" open>
        <summary>Tax & Electronic Invoicing Details</summary>
        <div class="customer-section-body customer-form-grid two">
          <label>TRN<input name="trn" value="${esc(c.trn||"")}"></label>
          <label>TIN Number<input name="tin_number" value="${esc(c.tin_number||"")}"></label>
          <label>Buyer ID Value<input name="buyer_id_value" value="${esc(c.buyer_id_value||"")}"></label>
          <label>Buyer ID Authority<input name="buyer_id_authority" value="${esc(c.buyer_id_authority||"")}"></label>
          <label class="span2">Legal Name<input name="legal_name" value="${esc(c.legal_name||"")}"></label>
          <label>Location Code Type<input name="location_code_type" value="${esc(c.location_code_type||"")}"></label>
          <label>Location Code Value<input name="location_code_value" value="${esc(c.location_code_value||"")}"></label>
          <label class="span2">Electronic Address<input name="electronic_address" value="${esc(c.electronic_address||"")}" placeholder="Electronic invoicing / routing address"></label>
        </div>
      </details>

      <details class="customer-details" open>
        <summary>Payment & Portal</summary>
        <div class="customer-section-body customer-form-grid two">
          <label>Payment Terms<select name="payment_terms_days">${[[0,"Due on receipt"],[7,"Net 7"],[15,"Net 15"],[30,"Net 30"],[45,"Net 45"],[60,"Net 60"],[90,"Net 90"]].map(([v,n])=>`<option value="${v}" ${Number(c.payment_terms_days||0)===v?"selected":""}>${n}</option>`).join("")}</select></label>
          <label class="portal-check"><span>Enable Portal?</span><span><input type="checkbox" name="portal_enabled" ${c.portal_enabled!==false?"checked":""}> Allow portal access for this customer</span></label>
        </div>
      </details>

      <details class="customer-details" open>
        <summary>Documents</summary>
        <div class="customer-section-body">
          <input class="customer-doc-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
          <p class="muted">You can upload a maximum of 3 files, 10MB each.</p>
          <div class="customer-documents-list">${existing?'<span class="muted">Loading documents…</span>':'<span class="muted">Save the customer to attach selected documents.</span>'}</div>
        </div>
      </details>

      <details class="customer-details">
        <summary>Remarks</summary>
        <div class="customer-section-body"><textarea name="remarks" rows="3" placeholder="Internal customer remarks">${esc(c.remarks||"")}</textarea></div>
      </details>

      <details class="customer-details">
        <summary>Add more details</summary>
        <div class="customer-section-body customer-form-grid two">
          <label>Customer Owner<input value="${esc(c.customer_owner_email||state.user&&state.user.email||"Current account")}" disabled><small>Assigned to the current account owner. Team-user assignment can be expanded when team access is enabled.</small></label>
          <label>Internal Notes<textarea name="notes" rows="2">${esc(c.notes||"")}</textarea></label>
        </div>
      </details>

      <div class="customer-form-actions"><button type="button" class="btn btn-outline close-customer">Cancel</button><button type="submit" class="btn btn-primary save-customer">${existing?"Save Changes":"Save Customer"}</button></div>
    </form>
  </div>`;
  document.body.append(wrap);

  const renderContacts=()=>{const host=$(".contact-persons-host",wrap);host.innerHTML=customerContactRowsHtml(contacts);$$(".contact-person-row",host).forEach(row=>{const i=Number(row.dataset.i);$$("[data-k]",row).forEach(el=>el.oninput=()=>contacts[i][el.dataset.k]=el.value);$(".remove-repeat",row).onclick=()=>{contacts.splice(i,1);renderContacts()}})};
  const renderCustom=()=>{const host=$(".custom-fields-host",wrap);host.innerHTML=customerCustomRowsHtml(custom);$$(".custom-field-row",host).forEach(row=>{const i=Number(row.dataset.i);$$("[data-k]",row).forEach(el=>el.oninput=()=>custom[i][el.dataset.k]=el.value);$(".remove-repeat",row).onclick=()=>{custom.splice(i,1);renderCustom()}})};
  renderContacts();renderCustom();
  $(".add-contact-person",wrap).onclick=()=>{contacts.push({name:"",email:"",phone:"",designation:""});renderContacts()};
  $(".add-custom-field",wrap).onclick=()=>{custom.push({label:"",value:""});renderCustom()};
  $(".close-modal",wrap).onclick=$(".close-customer",wrap).onclick=()=>wrap.remove();

  async function loadDocuments(){
    if(!existing)return;
    try{
      const d=await api("/customer-documents/"+existing.id);
      const host=$(".customer-documents-list",wrap);
      host.innerHTML=d.documents.length?d.documents.map(doc=>`<div class="customer-doc-row"><a href="${esc(doc.storage_url)}" target="_blank" rel="noopener">${esc(doc.file_name)}</a><span>${(Number(doc.size_bytes||0)/1024/1024).toFixed(2)} MB</span><button type="button" class="btn btn-ghost delete-customer-doc" data-id="${doc.id}">Delete</button></div>`).join(""):'<span class="muted">No documents uploaded.</span>';
      $$(".delete-customer-doc",host).forEach(b=>b.onclick=async()=>{if(!confirm("Delete this customer document?"))return;try{await api("/customer-documents/"+existing.id+"?document_id="+encodeURIComponent(b.dataset.id),{method:"DELETE"});await loadDocuments()}catch(err){alert(err.message)}});
    }catch(err){$(".customer-documents-list",wrap).innerHTML='<span class="muted">'+esc(err.message)+'</span>'}
  }
  loadDocuments();

  $(".customer-form",wrap).onsubmit=async e=>{
    e.preventDefault();
    const btn=$(".save-customer",wrap);btn.disabled=true;btn.textContent="Saving...";
    const fd=new FormData(e.target),body=Object.fromEntries(fd.entries());
    body.customer_type=(fd.get("customer_type")||"business");
    body.portal_enabled=fd.get("portal_enabled")==="on";
    body.payment_terms_days=Number(fd.get("payment_terms_days")||0);
    body.contact_persons=contacts.filter(x=>Object.values(x).some(Boolean));
    body.custom_fields=custom.filter(x=>x.label||x.value);
    delete body.currency;
    const files=$(".customer-doc-files",wrap).files;
    try{
      const result=await api(existing?"/customers/"+existing.id:"/customers",{method:existing?"PUT":"POST",body:JSON.stringify(body)});
      if(files&&files.length)await uploadCustomerDocuments(result.customer.id,files);
      await loadCustomers();wrap.remove();renderCustomers();
    }catch(err){alert(err.message);btn.disabled=false;btn.textContent=existing?"Save Changes":"Save Customer"}
  };
}

function renderProducts(){
  $("#content").innerHTML=`<div class="page-head"><div><h1>Items</h1><p>Reusable products and services for invoices, quotes and billing.</p></div><button class="btn btn-primary" id="add-product">+ Add item</button></div>
  <div class="panel">${state.products.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>SKU</th><th>Rate</th><th>Unit</th><th>Tax</th></tr></thead><tbody>${state.products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.description||"")}</div></td><td>${esc(p.sku||"—")}</td><td>${money(p.rate,state.business.currency)}</td><td>${esc(p.unit||"—")}</td><td>${esc(p.tax_category)} ${p.tax_category==="standard"?Number(p.tax_rate)+"%":""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No products or services yet</strong>Add commonly billed services so invoice creation is faster.</div>`}</div>`;
  $("#add-product").onclick=showProductModal;
}
function showProductModal(){
  const wrap=document.createElement("div");wrap.className="modal";wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Add product or service</h2><button class="icon-btn close-modal">×</button></div>
  <form class="form-grid product-form"><label class="span2">Name<input name="name" required></label><label class="span2">Description<textarea name="description"></textarea></label>
  <label>SKU<input name="sku"></label><label>Rate<input name="rate" type="number" step=".01" min="0" value="0"></label>
  <label>Unit<input name="unit" placeholder="hour, item, day"></label><label>Tax category<select name="tax_category">${state.business.vat_registered?'<option value="standard">Standard rated</option><option value="zero">Zero rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option>':'<option value="out_of_scope">No VAT</option>'}</select></label>
  <div class="span2"><button class="btn btn-primary">Save</button></div></form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".product-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.rate=Number(body.rate||0);body.tax_rate=Number(state.business.default_tax_rate||5);try{await api("/products",{method:"POST",body:JSON.stringify(body)});await loadProducts();wrap.remove();renderProducts()}catch(err){alert(err.message)}};
}

function renderPayments(){
  const cur=state.business.currency||"AED";
  const paid=state.payments.reduce((s,x)=>s+Number(x.amount||0),0),refunded=state.refunds.reduce((s,x)=>s+Number(x.amount||0),0),charges=state.bankCharges.reduce((s,x)=>s+Number(x.amount||0),0),badDebt=state.badDebts.reduce((s,x)=>s+Number(x.amount||0),0);
  const actions=(kind,id)=>`<div class="row-actions"><button class="btn btn-ghost finance-view" data-kind="${kind}" data-id="${id}">View</button><button class="btn btn-ghost finance-edit" data-kind="${kind}" data-id="${id}">Edit</button><button class="btn btn-ghost finance-delete" data-kind="${kind}" data-id="${id}" style="color:var(--danger)">Delete</button></div>`;
  $("#content").innerHTML=`<div class="page-head"><div><h1>Payments Received</h1><p>Record receipts, refunds, bank charges and receivable write-offs.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" id="add-refund">+ Refund</button><button class="btn btn-outline" id="add-bank-charge">+ Bank charge</button><button class="btn btn-primary" id="add-payment">+ Record payment</button></div></div>
  <div class="metric-grid" style="margin-bottom:18px"><div class="metric"><div class="label">Payments received</div><div class="value">${money(paid,cur)}</div></div><div class="metric"><div class="label">Refunded</div><div class="value">${money(refunded,cur)}</div></div><div class="metric"><div class="label">Bank charges</div><div class="value">${money(charges,cur)}</div></div><div class="metric"><div class="label">Bad-debt write-offs</div><div class="value">${money(badDebt,cur)}</div></div></div>
  <div class="panel"><div class="panel-head"><h3>Payments</h3></div>${state.payments.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${state.payments.map(p=>`<tr><td>${esc(String(p.payment_date).slice(0,10))}</td><td>${esc(p.invoice_number)}</td><td>${esc(p.customer_company||p.customer_name||"—")}</td><td>${esc(String(p.method||"").replaceAll("_"," "))}</td><td>${esc(p.reference||"—")}</td><td>${money(p.amount,cur)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No payments recorded</strong>Record a payment when a customer pays an invoice.</div>`}</div>
  <div class="panel"><div class="panel-head"><h3>Refunds</h3></div>${state.refunds.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Reason</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${state.refunds.map(x=>`<tr><td>${esc(String(x.refund_date).slice(0,10))}</td><td>${esc(x.customer_name||"—")}</td><td>${esc(x.invoice_number||"—")}</td><td>${esc(String(x.method||"").replaceAll("_"," "))}</td><td>${esc(x.reference||"—")}</td><td>${esc(x.reason||"—")}</td><td>${money(x.amount,cur)}</td><td>${actions("refund",x.id)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No refunds recorded.</div>`}</div>
  <div class="panel"><div class="panel-head"><h3>Bank charges</h3></div>${state.bankCharges.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Bank</th><th>Invoice</th><th>Reference</th><th>VAT</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${state.bankCharges.map(x=>`<tr><td>${esc(String(x.charge_date).slice(0,10))}</td><td>${esc(x.bank_name||"—")}</td><td>${esc(x.invoice_number||"—")}</td><td>${esc(x.reference||"—")}</td><td>${money(x.vat_amount,cur)}</td><td>${money(x.amount,cur)}</td><td>${actions("charge",x.id)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No bank charges recorded.</div>`}</div>
  <div class="panel"><div class="panel-head"><h3>Bad-debt write-offs</h3></div>${state.badDebts.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Reason</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${state.badDebts.map(x=>`<tr><td>${esc(String(x.writeoff_date).slice(0,10))}</td><td>${esc(x.customer_name||"—")}</td><td>${esc(x.invoice_number||"—")}</td><td>${esc(x.reason||"—")}</td><td>${money(x.amount,cur)}</td><td>${actions("debt",x.id)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No bad-debt write-offs recorded.</div>`}</div>`;
  $("#add-payment").onclick=()=>showPaymentModal();
  $("#add-refund").onclick=()=>showRefundModal();
  $("#add-bank-charge").onclick=()=>showBankChargeModal();
  $$(".finance-view").forEach(b=>b.onclick=()=>showFinanceAdjustmentDetails(b.dataset.kind,b.dataset.id));
  $$(".finance-edit").forEach(b=>b.onclick=()=>editFinanceAdjustment(b.dataset.kind,b.dataset.id));
  $$(".finance-delete").forEach(b=>b.onclick=()=>deleteFinanceAdjustment(b.dataset.kind,b.dataset.id));
}
function showPaymentModal(invoiceId=""){
  const outstanding=state.invoices.filter(i=>Number(i.total)>Number(i.amount_paid)+Number(i.bad_debt_amount||0)&&i.status!=="cancelled");
  if(!outstanding.length){alert("There are no outstanding invoices.");return}
  const wrap=document.createElement("div");wrap.className="modal";wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Record payment</h2><button class="icon-btn close-modal">×</button></div>
  <form class="form-grid payment-form"><label class="span2">Invoice<select name="invoice_id" required>${outstanding.map(i=>`<option value="${i.id}" ${String(invoiceId)===String(i.id)?"selected":""}>${esc(i.invoice_number)} · ${esc(i.customer_name||"")} · ${money(Number(i.total)-Number(i.amount_paid)-Number(i.bad_debt_amount||0),i.currency)}</option>`).join("")}</select></label>
  <label>Payment date<input name="payment_date" type="date" value="${today()}" required></label><label>Amount<input name="amount" type="number" min="0" step=".01" required></label>
  <label>Method<select name="method"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="credit_card">Credit card</option><option value="cheque">Cheque</option><option value="online">Online</option><option value="other">Other</option></select></label>
  <label>Reference<input name="reference"></label><label class="span2">Notes<textarea name="notes"></textarea></label>
  <div class="span2"><button class="btn btn-primary">Record payment</button></div></form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".payment-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.amount=Number(body.amount||0);try{await api("/payments",{method:"POST",body:JSON.stringify(body)});await Promise.all([loadPayments(),loadInvoices(),loadDashboard(),loadReport()]);wrap.remove();if(state.view==="payments")renderPayments();else if(state.view==="invoices")renderInvoices()}catch(err){alert(err.message)}};
}

function showRefundModal(existing=null){
  if(!existing&&!state.payments.length){alert("Record a payment before creating a refund.");return}
  const x=existing||{payment_id:state.payments[0]&&state.payments[0].id||"",refund_date:today(),amount:"",method:"bank_transfer",reference:"",reason:"",notes:""};
  const wrap=document.createElement("div");wrap.className="modal";
  const payment=existing?state.payments.find(p=>String(p.id)===String(x.payment_id)):null;
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${existing?"Edit refund":"Record refund"}</h2><button class="icon-btn close-modal">×</button></div>
    <form class="form-grid refund-form"><label class="span2">Payment${existing?`<input value="${esc((payment&&payment.invoice_number||x.invoice_number||"Payment")+" · "+(x.customer_name||""))}" disabled><input type="hidden" name="payment_id" value="${esc(x.payment_id)}">`:`<select name="payment_id" required>${state.payments.map(p=>`<option value="${p.id}">${esc(p.invoice_number)} · ${esc(p.customer_company||p.customer_name||"")} · ${money(p.amount,state.business.currency)}</option>`).join("")}</select>`}</label>
    <label>Refund date<input name="refund_date" type="date" value="${esc(String(x.refund_date||today()).slice(0,10))}" required></label><label>Amount<input name="amount" type="number" min=".01" step=".01" value="${Number(x.amount||0)||""}" required></label>
    <label>Method<select name="method">${[["bank_transfer","Bank transfer"],["cash","Cash"],["card","Card reversal"],["other","Other"]].map(([v,n])=>`<option value="${v}" ${x.method===v?"selected":""}>${n}</option>`).join("")}</select></label><label>Reference<input name="reference" value="${esc(x.reference||"")}"></label>
    <label class="span2">Reason<input name="reason" value="${esc(x.reason||"")}" placeholder="Overpayment, cancellation, correction..."></label><label class="span2">Notes<textarea name="notes">${esc(x.notes||"")}</textarea></label>
    <div class="span2"><button class="btn btn-primary">${existing?"Save refund changes":"Record refund"}</button></div></form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".refund-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.amount=Number(body.amount||0);try{await api(existing?"/refunds/"+existing.id:"/refunds",{method:existing?"PUT":"POST",body:JSON.stringify(body)});await Promise.all([loadRefunds(),loadInvoices(),loadPayments(),loadDashboard(),loadReport()]);wrap.remove();renderPayments()}catch(err){alert(err.message)}};
}
function showBankChargeModal(existing=null){
  const x=existing||{payment_id:"",charge_date:today(),bank_name:"",amount:"",vat_amount:0,reference:"",notes:""};
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${existing?"Edit bank charge":"Record bank charge"}</h2><button class="icon-btn close-modal">×</button></div>
    <form class="form-grid bank-charge-form"><label class="span2">Related payment<select name="payment_id"><option value="">Not linked</option>${state.payments.map(p=>`<option value="${p.id}" ${String(x.payment_id||"")===String(p.id)?"selected":""}>${esc(p.invoice_number)} · ${esc(p.reference||"Payment")} · ${money(p.amount,state.business.currency)}</option>`).join("")}</select></label>
    <label>Charge date<input name="charge_date" type="date" value="${esc(String(x.charge_date||today()).slice(0,10))}"></label><label>Bank name<input name="bank_name" value="${esc(x.bank_name||"")}"></label>
    <label>Amount<input name="amount" type="number" min=".01" step=".01" value="${Number(x.amount||0)||""}" required></label><label>VAT amount<input name="vat_amount" type="number" min="0" step=".01" value="${Number(x.vat_amount||0)}"></label>
    <label>Reference<input name="reference" value="${esc(x.reference||"")}"></label><label class="span2">Notes<textarea name="notes">${esc(x.notes||"")}</textarea></label>
    <div class="span2"><button class="btn btn-primary">${existing?"Save changes":"Save bank charge"}</button></div></form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".bank-charge-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.amount=Number(body.amount||0);body.vat_amount=Number(body.vat_amount||0);try{await api(existing?"/bank-charges/"+existing.id:"/bank-charges",{method:existing?"PUT":"POST",body:JSON.stringify(body)});await Promise.all([loadBankCharges(),loadDashboard(),loadReport()]);wrap.remove();renderPayments()}catch(err){alert(err.message)}};
}
function showBadDebtModal(invoiceId){
  const inv=state.invoices.find(i=>String(i.id)===String(invoiceId));
  if(!inv){alert("Invoice not found.");return}
  const balance=Math.max(0,Number(inv.total)-Number(inv.amount_paid)-Number(inv.bad_debt_amount||0));
  if(balance<=0){alert("This invoice has no collectible balance to write off.");return}
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Write off bad debt</h2><button class="icon-btn close-modal">×</button></div>
    <p class="muted">Invoice <strong>${esc(inv.invoice_number)}</strong> · Maximum write-off ${money(balance,inv.currency||state.business.currency)}</p>
    <form class="form-grid bad-debt-form"><label>Write-off date<input name="writeoff_date" type="date" value="${today()}"></label><label>Amount<input name="amount" type="number" step=".01" min=".01" max="${balance.toFixed(2)}" value="${balance.toFixed(2)}" required></label>
    <label class="span2">Reason<input name="reason" placeholder="Uncollectible, settlement, customer closure..."></label><label class="span2">Notes<textarea name="notes"></textarea></label>
    <div class="span2"><button class="btn btn-primary">Record write-off</button></div></form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".bad-debt-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.invoice_id=invoiceId;body.amount=Number(body.amount||0);try{await api("/bad-debts",{method:"POST",body:JSON.stringify(body)});await Promise.all([loadBadDebts(),loadInvoices(),loadDashboard(),loadReport()]);wrap.remove();alert("Bad-debt write-off recorded.");navigate("invoices")}catch(err){alert(err.message)}};
}

function financeRecord(kind,id){
  if(kind==="refund")return state.refunds.find(x=>String(x.id)===String(id));
  if(kind==="charge")return state.bankCharges.find(x=>String(x.id)===String(id));
  return state.badDebts.find(x=>String(x.id)===String(id));
}
function showFinanceAdjustmentDetails(kind,id){
  const x=financeRecord(kind,id);if(!x)return;
  const cur=state.business.currency||"AED";
  const title=kind==="refund"?"Refund details":kind==="charge"?"Bank charge details":"Bad-debt write-off details";
  const rows=kind==="refund"?[
    ["Date",String(x.refund_date||"").slice(0,10)],["Customer",x.customer_name],["Invoice",x.invoice_number],["Method",String(x.method||"").replaceAll("_"," ")],
    ["Reference",x.reference],["Reason",x.reason],["Amount",money(x.amount,cur)],["Notes",x.notes]
  ]:kind==="charge"?[
    ["Date",String(x.charge_date||"").slice(0,10)],["Bank",x.bank_name],["Invoice",x.invoice_number],["Payment reference",x.payment_reference],
    ["Charge reference",x.reference],["Amount",money(x.amount,cur)],["VAT",money(x.vat_amount,cur)],["Notes",x.notes]
  ]:[
    ["Date",String(x.writeoff_date||"").slice(0,10)],["Customer",x.customer_name],["Invoice",x.invoice_number],
    ["Amount",money(x.amount,cur)],["Reason",x.reason],["Notes",x.notes]
  ];
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${title}</h2><button class="icon-btn close-modal">×</button></div>
    <div class="finance-detail-grid">${rows.map(([a,b])=>`<div><span>${esc(a)}</span><strong>${esc(b||"—")}</strong></div>`).join("")}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button class="btn btn-outline finance-detail-edit">Edit</button><button class="btn btn-outline finance-detail-delete" style="color:var(--danger)">Delete</button></div></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".finance-detail-edit",wrap).onclick=()=>{wrap.remove();editFinanceAdjustment(kind,id)};
  $(".finance-detail-delete",wrap).onclick=()=>{wrap.remove();deleteFinanceAdjustment(kind,id)};
}
function editFinanceAdjustment(kind,id){
  const x=financeRecord(kind,id);if(!x)return;
  if(kind==="refund")showRefundModal(x);
  else if(kind==="charge")showBankChargeModal(x);
  else showBadDebtEditModal(x);
}
async function deleteFinanceAdjustment(kind,id){
  const x=financeRecord(kind,id);if(!x)return;
  const label=kind==="refund"?"refund":kind==="charge"?"bank charge":"bad-debt write-off";
  if(!confirm("Delete this "+label+"? Financial totals will be recalculated."))return;
  try{
    await api(kind==="refund"?"/refunds/"+id:kind==="charge"?"/bank-charges/"+id:"/bad-debts/"+id,{method:"DELETE"});
    await Promise.all([loadRefunds(),loadBankCharges(),loadBadDebts(),loadInvoices(),loadDashboard(),loadReport()]);
    renderPayments();
  }catch(err){alert(err.message)}
}
function showBadDebtEditModal(existing){
  const inv=state.invoices.find(i=>String(i.id)===String(existing.invoice_id));
  if(!inv){alert("Invoice not found.");return}
  const remaining=Math.max(0,Number(inv.total)-Number(inv.amount_paid)-Number(inv.bad_debt_amount||0));
  const max=remaining+Number(existing.amount||0);
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Edit bad-debt write-off</h2><button class="icon-btn close-modal">×</button></div>
    <p class="muted">Invoice <strong>${esc(existing.invoice_number||inv.invoice_number)}</strong> · Maximum write-off ${money(max,inv.currency||state.business.currency)}</p>
    <form class="form-grid bad-debt-edit-form"><label>Write-off date<input name="writeoff_date" type="date" value="${esc(String(existing.writeoff_date||today()).slice(0,10))}"></label><label>Amount<input name="amount" type="number" step=".01" min=".01" max="${max.toFixed(2)}" value="${Number(existing.amount||0).toFixed(2)}" required></label>
    <label class="span2">Reason<input name="reason" value="${esc(existing.reason||"")}"></label><label class="span2">Notes<textarea name="notes">${esc(existing.notes||"")}</textarea></label>
    <div class="span2"><button class="btn btn-primary">Save changes</button></div></form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".bad-debt-edit-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.amount=Number(body.amount||0);try{await api("/bad-debts/"+existing.id,{method:"PUT",body:JSON.stringify(body)});await Promise.all([loadBadDebts(),loadInvoices(),loadDashboard(),loadReport()]);wrap.remove();renderPayments()}catch(err){alert(err.message)}};
}

function renderExpenses(){
  const total=state.expenses.reduce((a,x)=>a+Number(x.amount||0),0);
  const vat=state.expenses.reduce((a,x)=>a+Number(x.vat_amount||0),0);
  $("#content").innerHTML=`<div class="page-head"><div><h1>Expenses</h1><p>Track, edit and report business expenses and input VAT.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" id="expense-report">Expense report</button><button class="btn btn-primary" id="add-expense">+ Add expense</button></div></div>
  <div class="metric-grid" style="margin-bottom:18px"><div class="metric"><div class="label">Recorded expenses</div><div class="value">${money(total,state.business.currency)}</div></div><div class="metric"><div class="label">Recorded VAT</div><div class="value">${money(vat,state.business.currency)}</div></div><div class="metric"><div class="label">Entries</div><div class="value">${state.expenses.length}</div></div></div>
  <div class="panel">${state.expenses.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Customer</th><th>Project</th><th>Billable</th><th>VAT</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${state.expenses.map(x=>`<tr><td>${esc(String(x.expense_date).slice(0,10))}</td><td>${esc(x.supplier||"—")}</td><td>${esc(x.category||"—")}</td><td>${esc(x.customer_name||"—")}</td><td>${esc(x.project_name||"—")}</td><td>${x.billable?(x.billed_invoice_id?"Billed":"Yes"):"No"}</td><td>${money(x.vat_amount,state.business.currency)}</td><td>${money(x.amount,state.business.currency)}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">${x.billable&&!x.billed_invoice_id?`<button class="btn btn-ghost expense-bill" data-id="${x.id}">Create invoice</button>`:""}<button class="btn btn-ghost expense-edit" data-id="${x.id}">Edit</button><button class="btn btn-ghost expense-delete" data-id="${x.id}" style="color:var(--danger)">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No expenses recorded</strong>Add operating expenses when you are ready.</div>`}</div>`;
  $("#add-expense").onclick=()=>showExpenseModal();
  $("#expense-report").onclick=showExpenseReportModal;
  $$(".expense-bill").forEach(b=>b.onclick=async()=>{if(!confirm("Create a draft invoice from this billable expense? Review the VAT treatment before issuing."))return;try{const out=await api("/expense-convert/"+b.dataset.id,{method:"POST",body:"{}"});await Promise.all([loadExpenses(),loadInvoices(),loadDashboard(),loadPlan()]);alert("Draft invoice "+out.invoice.invoice_number+" created.");renderExpenses()}catch(err){alert(err.message)}});
  $$(".expense-edit").forEach(b=>b.onclick=()=>showExpenseModal(state.expenses.find(x=>String(x.id)===String(b.dataset.id))));
  $$(".expense-delete").forEach(b=>b.onclick=async()=>{const ex=state.expenses.find(x=>String(x.id)===String(b.dataset.id));if(!ex)return;if(!confirm(`Delete expense ${ex.supplier||ex.category||""} for ${money(ex.amount,state.business.currency)}?`))return;try{await api("/expenses/"+b.dataset.id,{method:"DELETE"});await Promise.all([loadExpenses(),loadReport()]);renderExpenses()}catch(err){alert(err.message)}});
}
function showExpenseModal(existing=null){
  const x=existing||{expense_date:today(),supplier:"",category:"",reference:"",amount:0,vat_amount:0,customer_id:"",project_id:"",billable:false,notes:""};
  const wrap=document.createElement("div");wrap.className="modal";wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${existing?"Edit expense":"Add expense"}</h2><button class="icon-btn close-modal">×</button></div>
  <form class="form-grid expense-form"><label>Expense date<input name="expense_date" type="date" value="${esc(String(x.expense_date||today()).slice(0,10))}"></label><label>Supplier<input name="supplier" value="${esc(x.supplier||"")}"></label>
  <label>Category<input name="category" placeholder="Office, travel, software" value="${esc(x.category||"")}"></label><label>Reference<input name="reference" value="${esc(x.reference||"")}"></label>
  <label>Amount<input name="amount" type="number" step=".01" min="0" required value="${Number(x.amount||0)}"></label><label>VAT amount<input name="vat_amount" type="number" step=".01" min="0" value="${Number(x.vat_amount||0)}"></label>
  <label>Customer<select name="customer_id"><option value="">Not linked</option>${state.customers.map(c=>`<option value="${c.id}" ${String(x.customer_id||"")===String(c.id)?"selected":""}>${esc(c.company||c.name)}</option>`).join("")}</select></label>
  <label>Project<select name="project_id"><option value="">Not linked</option>${state.projects.map(p=>`<option value="${p.id}" ${String(x.project_id||"")===String(p.id)?"selected":""}>${esc(p.project_name)}</option>`).join("")}</select></label>
  <label class="span2" style="display:flex;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="billable" style="width:auto" ${x.billable?"checked":""}> Billable to customer</label>
  <label class="span2">Notes<textarea name="notes">${esc(x.notes||"")}</textarea></label><div class="span2"><button class="btn btn-primary">${existing?"Save changes":"Save expense"}</button></div></form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".expense-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.amount=Number(body.amount||0);body.vat_amount=Number(body.vat_amount||0);body.billable=body.billable==="on";try{await api(existing?"/expenses/"+existing.id:"/expenses",{method:existing?"PUT":"POST",body:JSON.stringify(body)});await Promise.all([loadExpenses(),loadReport()]);wrap.remove();renderExpenses()}catch(err){alert(err.message)}};
}
function showExpenseReportModal(){
  const categories=[...new Set(state.expenses.map(x=>x.category).filter(Boolean))].sort();
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card" style="width:min(920px,100%)"><div class="modal-head"><h2>Expense report</h2><button class="icon-btn close-modal">×</button></div>
  <div class="form-grid"><label>From<input id="er-from" type="date"></label><label>To<input id="er-to" type="date"></label><label class="span2">Category<select id="er-category"><option value="">All categories</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0"><button class="btn btn-primary" id="er-run">View report</button><button class="btn btn-outline" id="er-csv">Download CSV</button><button class="btn btn-outline" id="er-print">Print report</button><button class="btn btn-outline" id="er-email">Send by email</button></div>
  <div id="er-output"><div class="empty"><strong>Choose a period or leave blank for all expenses</strong>Then select View report.</div></div></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  let last=null;
  const params=()=>{const p=new URLSearchParams();const f=$("#er-from").value,t=$("#er-to").value,c=$("#er-category").value;if(f)p.set("from",f);if(t)p.set("to",t);if(c)p.set("category",c);return p};
  const render=async()=>{try{last=await api("/expense-report?"+params().toString());const s=last.summary,c=last.business.currency;$("#er-output").innerHTML=`<div class="metric-grid" style="margin-bottom:14px"><div class="metric"><div class="label">Expenses</div><div class="value">${money(s.total_expenses,c)}</div></div><div class="metric"><div class="label">VAT</div><div class="value">${money(s.vat_amount,c)}</div></div><div class="metric"><div class="label">Net before VAT</div><div class="value">${money(s.net_before_vat,c)}</div></div><div class="metric"><div class="label">Entries</div><div class="value">${s.count}</div></div></div>${last.expenses.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Reference</th><th>VAT</th><th>Amount</th></tr></thead><tbody>${last.expenses.map(x=>`<tr><td>${esc(String(x.expense_date).slice(0,10))}</td><td>${esc(x.supplier||"—")}</td><td>${esc(x.category||"—")}</td><td>${esc(x.reference||"—")}</td><td>${money(x.vat_amount,c)}</td><td>${money(x.amount,c)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No expenses found for this filter.</div>`}`;return last}catch(err){alert(err.message)}};
  $("#er-run").onclick=render;
  $("#er-csv").onclick=()=>{window.location.href=API+"/expense-report-csv?"+params().toString()};
  $("#er-print").onclick=async()=>{const data=last||await render();if(!data)return;const w=window.open("","_blank");const c=data.business.currency,s=data.summary;w.document.write(`<!doctype html><html><head><title>Expense Report</title><style>body{font-family:Arial;padding:28px;color:#1F2E3D}h1{color:#112B4A}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#112B4A;color:white;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #ddd}.num{text-align:right}.summary{display:flex;gap:28px;margin:18px 0}.summary div{font-weight:700}</style></head><body><h1>Expense Report</h1><p>${esc(data.business.name)}</p><div class="summary"><div>Total: ${money(s.total_expenses,c)}</div><div>VAT: ${money(s.vat_amount,c)}</div><div>Entries: ${s.count}</div></div><table><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Reference</th><th>VAT</th><th>Amount</th></tr></thead><tbody>${data.expenses.map(x=>`<tr><td>${esc(String(x.expense_date).slice(0,10))}</td><td>${esc(x.supplier||"—")}</td><td>${esc(x.category||"—")}</td><td>${esc(x.reference||"—")}</td><td class="num">${money(x.vat_amount,c)}</td><td class="num">${money(x.amount,c)}</td></tr>`).join("")}</tbody></table></body></html>`);w.document.close();w.focus();w.print()};
  $("#er-email").onclick=async()=>{const to=prompt("Send expense report to email:");if(!to)return;const p=params();const body={recipient:to,from:p.get("from")||null,date_to:p.get("to")||null,category:p.get("category")||null};try{await api("/expense-report-email",{method:"POST",body:JSON.stringify(body)});alert("Expense report sent to "+to)}catch(err){alert(err.message)}};
}

function renderChallans(){
  $("#content").innerHTML=`<div class="page-head"><div><h1>Delivery Challans</h1><p>Create delivery notes for goods/services handed over to customers.</p></div><button class="btn btn-primary" id="new-challan">+ New challan</button></div>
  <div class="panel">${state.challans.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Challan</th><th>Customer</th><th>Date</th><th>Reference</th><th>Status</th><th>Invoice</th></tr></thead><tbody>${state.challans.map(x=>`<tr><td><strong>${esc(x.challan_number)}</strong></td><td>${esc(x.customer_name||"—")}</td><td>${esc(String(x.challan_date).slice(0,10))}</td><td>${esc(x.reference||"—")}</td><td><span class="status ${esc(x.status)}">${esc(x.status)}</span></td><td>${x.converted_invoice_id?"Converted":"—"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No delivery challans yet</strong>Create a challan when goods or deliverables are handed over to a customer.</div>`}</div>`;
  $("#new-challan").onclick=showChallanModal;
}
function showChallanModal(){
  if(!state.customers.length){alert("Add a customer first.");return}
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card" style="width:min(760px,100%)"><div class="modal-head"><h2>New delivery challan</h2><button class="icon-btn close-modal">×</button></div>
  <form class="challan-form">
    <div class="form-grid"><label>Customer<select name="customer_id" required>${state.customers.map(c=>`<option value="${c.id}">${esc(c.company||c.name)}</option>`).join("")}</select></label><label>Date<input name="challan_date" type="date" value="${today()}"></label><label class="span2">Reference<input name="reference" placeholder="PO / delivery reference"></label></div>
    <div class="items-box" style="margin-top:16px"><div class="item-head" style="grid-template-columns:1.5fr .55fr .6fr 34px"><span>Item / description</span><span>Qty</span><span>Unit</span><span></span></div><div class="challan-items"></div></div>
    <div class="editor-actions"><button type="button" class="btn btn-outline challan-add">+ Add item</button><button class="btn btn-primary">Create challan</button></div>
    <label class="editor-field" style="margin-top:14px">Notes<textarea name="notes" rows="2"></textarea></label>
  </form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  const items=[{item_name:"Item",description:"",quantity:1,unit:""}];
  const render=()=>{const host=$(".challan-items",wrap);host.innerHTML=items.map((it,i)=>`<div class="item-row challan-row" data-i="${i}" style="grid-template-columns:1.5fr .55fr .6fr 34px"><div class="item-name-wrap"><input data-k="item_name" value="${esc(it.item_name)}"><textarea data-k="description" placeholder="Description">${esc(it.description)}</textarea></div><input data-k="quantity" type="number" step=".001" min="0" value="${it.quantity}"><input data-k="unit" value="${esc(it.unit)}" placeholder="pcs"><button type="button" class="remove-item">×</button></div>`).join("");$$(".challan-row",host).forEach(row=>{const i=Number(row.dataset.i);$$("[data-k]",row).forEach(el=>el.oninput=()=>{items[i][el.dataset.k]=el.dataset.k==="quantity"?Number(el.value||0):el.value});$(".remove-item",row).onclick=()=>{if(items.length>1){items.splice(i,1);render()}}})};
  render();$(".challan-add",wrap).onclick=()=>{items.push({item_name:"Item",description:"",quantity:1,unit:""});render()};
  $(".challan-form",wrap).onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());try{await api("/delivery-challans",{method:"POST",body:JSON.stringify({...f,items})});await loadChallans();wrap.remove();renderChallans()}catch(err){alert(err.message)}};
}

function renderTimeTracking(){
  const unbilled=state.timeEntries.filter(x=>x.billable&&!x.billed_invoice_id);
  const totalHours=state.timeEntries.reduce((s,x)=>s+Number(x.hours||0),0);
  const unbilledValue=unbilled.reduce((s,x)=>s+Number(x.hours||0)*Number(x.hourly_rate||0),0);
  $("#content").innerHTML=`<div class="page-head"><div><h1>Time Tracking</h1><p>Track billable hours and turn approved time into draft invoices.</p></div><button class="btn btn-primary" id="new-time">+ Add time</button></div>
  <div class="metric-grid" style="margin-bottom:18px"><div class="metric"><div class="label">Tracked hours</div><div class="value">${totalHours.toFixed(2)}</div></div><div class="metric"><div class="label">Unbilled entries</div><div class="value">${unbilled.length}</div></div><div class="metric"><div class="label">Unbilled value</div><div class="value">${money(unbilledValue,state.business.currency)}</div></div></div>
  <div class="panel">${state.timeEntries.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Project</th><th>Description</th><th>Hours</th><th>Rate</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>${state.timeEntries.map(x=>`<tr><td>${esc(String(x.entry_date).slice(0,10))}</td><td>${esc(x.customer_name||"—")}</td><td>${esc(x.project_name||"—")}</td><td>${esc(x.description)}</td><td>${Number(x.hours).toFixed(2)}</td><td>${money(x.hourly_rate,state.business.currency)}</td><td>${money(Number(x.hours)*Number(x.hourly_rate),state.business.currency)}</td><td>${x.billed_invoice_id?"Billed":x.billable?"Billable":"Non-billable"}</td><td>${x.billable&&!x.billed_invoice_id?`<button class="btn btn-ghost time-bill" data-id="${x.id}">Create invoice</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No time entries yet</strong>Track consulting, support or service hours here.</div>`}</div>`;
  $("#new-time").onclick=showTimeModal;
  $$(".time-bill").forEach(b=>b.onclick=async()=>{if(!confirm("Create a draft invoice from this time entry?"))return;try{const out=await api("/time-entry-convert/"+b.dataset.id,{method:"POST",body:"{}"});await Promise.all([loadTimeEntries(),loadInvoices(),loadDashboard(),loadReport(),loadPlan()]);alert("Draft invoice "+out.invoice.invoice_number+" created.");renderTimeTracking()}catch(err){alert(err.message)}});
}
function showTimeModal(){
  if(!state.customers.length){alert("Add a customer first.");return}
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Add time entry</h2><button class="icon-btn close-modal">×</button></div><form class="form-grid time-form">
    <label>Customer<select name="customer_id">${state.customers.map(c=>`<option value="${c.id}">${esc(c.company||c.name)}</option>`).join("")}</select></label><label>Date<input name="entry_date" type="date" value="${today()}"></label>
    <label>Project<select name="project_id"><option value="">No project</option>${state.projects.map(p=>`<option value="${p.id}">${esc(p.project_name)}</option>`).join("")}</select></label><label>Description<input name="description" required placeholder="Consulting, site visit, support..."></label>
    <label>Hours<input name="hours" type="number" step=".25" min=".01" value="1" required></label><label>Hourly rate<input name="hourly_rate" type="number" step=".01" min="0" value="0"></label>
    <label class="span2" style="display:flex;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="billable" checked style="width:auto"> Billable</label>
    <label class="span2">Notes<textarea name="notes" rows="2"></textarea></label><div class="span2"><button class="btn btn-primary">Save time entry</button></div></form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".time-form",wrap).onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());f.hours=Number(f.hours||0);f.hourly_rate=Number(f.hourly_rate||0);f.billable=f.billable==="on";try{await api("/time-entries",{method:"POST",body:JSON.stringify(f)});await loadTimeEntries();wrap.remove();renderTimeTracking()}catch(err){alert(err.message)}};
}

function reportIcon(type){
  const paths={
    sales:'<path d="M4 18V9m6 9V5m6 13v-7m4 9H2" />',
    receivables:'<path d="M4 7h16M6 3h12a2 2 0 0 1 2 2v14H4V5a2 2 0 0 1 2-2Zm2 8h3m-3 4h7" />',
    payments:'<path d="M3 7h18v10H3zM7 12h4m6-2v4" />',
    expenses:'<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" />',
    time:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" />',
    activity:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[type]||paths.activity}</svg>`;
}
function renderProjects(){
  const cur=state.business.currency||"AED";
  const active=state.projects.filter(p=>p.status==="active").length,totalRevenue=state.projects.reduce((s,p)=>s+Number(p.revenue||0),0),totalExpenses=state.projects.reduce((s,p)=>s+Number(p.expenses||0),0);
  $("#content").innerHTML=`<div class="page-head"><div><h1>Projects</h1><p>Track customer projects, time, expenses, budgets and project-linked revenue.</p></div><button class="btn btn-primary" id="new-project">+ New project</button></div>
  <div class="metric-grid" style="margin-bottom:18px"><div class="metric"><div class="label">Projects</div><div class="value">${state.projects.length}</div></div><div class="metric"><div class="label">Active</div><div class="value">${active}</div></div><div class="metric"><div class="label">Revenue</div><div class="value">${money(totalRevenue,cur)}</div></div><div class="metric"><div class="label">Expenses</div><div class="value">${money(totalExpenses,cur)}</div></div></div>
  <div class="panel">${state.projects.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Project</th><th>Customer</th><th>Status</th><th>Hours</th><th>Budget</th><th>Revenue</th><th>Expenses</th><th>Margin</th><th></th></tr></thead><tbody>${state.projects.map(p=>`<tr><td><strong>${esc(p.project_name)}</strong><div class="muted">${esc(p.project_code||"")}</div></td><td>${esc(p.customer_name||"—")}</td><td><span class="status ${esc(p.status)}">${esc(p.status)}</span></td><td>${Number(p.tracked_hours||0).toFixed(2)}</td><td>${money(p.budget,cur)}</td><td>${money(p.revenue,cur)}</td><td>${money(p.expenses,cur)}</td><td>${money(Number(p.revenue||0)-Number(p.expenses||0),cur)}</td><td><div class="row-actions"><button class="btn btn-primary project-view" data-id="${p.id}">View</button><button class="btn btn-ghost project-edit" data-id="${p.id}">Edit</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No projects yet</strong>Create a project to connect time entries, expenses and invoices.</div>`}</div>`;
  $("#new-project").onclick=()=>showProjectModal();
  $$(".project-view").forEach(b=>b.onclick=()=>openProjectDetail(b.dataset.id));
  $$(".project-edit").forEach(b=>b.onclick=()=>showProjectModal(state.projects.find(p=>String(p.id)===String(b.dataset.id))));
}
async function openProjectDetail(id,initialTab="overview"){
  try{
    const data=await api("/project-overview/"+id),p=data.project,s=data.summary,cur=data.business.currency||state.business.currency||"AED";
    navActive("projects");$("#page-title").textContent="Project";
    const empty=msg=>`<div class="empty">${esc(msg)}</div>`;
    const metric=(label,value,cls="")=>`<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
    const renderTab=tab=>{
      if(tab==="overview")return `<div class="project-overview-grid">
        <section class="customer-detail-card"><h3>Project information</h3><div class="customer-info-grid">
          <div class="customer-info-item"><span>Project code</span><strong>${esc(p.project_code||"—")}</strong></div>
          <div class="customer-info-item"><span>Customer</span><strong>${esc(p.customer_name||"—")}</strong></div>
          <div class="customer-info-item"><span>Status</span><strong>${esc(String(p.status||"active").replaceAll("_"," "))}</strong></div>
          <div class="customer-info-item"><span>Billing method</span><strong>${esc(String(p.billing_method||"").replaceAll("_"," "))}</strong></div>
          <div class="customer-info-item"><span>Start date</span><strong>${esc(p.start_date?String(p.start_date).slice(0,10):"—")}</strong></div>
          <div class="customer-info-item"><span>End date</span><strong>${esc(p.end_date?String(p.end_date).slice(0,10):"—")}</strong></div>
          <div class="customer-info-item"><span>Budget</span><strong>${money(p.budget,cur)}</strong></div>
          <div class="customer-info-item"><span>Hourly rate</span><strong>${money(p.hourly_rate,cur)}</strong></div>
        </div></section>
        <section class="customer-detail-card"><h3>Description</h3><p class="customer-long-text">${esc(p.description||"No project description.")}</p></section>
        <section class="customer-detail-card"><h3>Work summary</h3><div class="customer-info-grid">
          <div class="customer-info-item"><span>Tracked hours</span><strong>${Number(s.tracked_hours||0).toFixed(2)}</strong></div>
          <div class="customer-info-item"><span>Billable hours</span><strong>${Number(s.billable_hours||0).toFixed(2)}</strong></div>
          <div class="customer-info-item"><span>Billable time value</span><strong>${money(s.time_value,cur)}</strong></div>
          <div class="customer-info-item"><span>Billable expenses</span><strong>${money(s.billable_expenses,cur)}</strong></div>
        </div></section>
        <section class="customer-detail-card"><h3>Financial position</h3><div class="customer-info-grid">
          <div class="customer-info-item"><span>Revenue</span><strong>${money(s.revenue,cur)}</strong></div>
          <div class="customer-info-item"><span>Received</span><strong>${money(s.received,cur)}</strong></div>
          <div class="customer-info-item"><span>Outstanding</span><strong>${money(s.outstanding,cur)}</strong></div>
          <div class="customer-info-item"><span>Expenses</span><strong>${money(s.expenses,cur)}</strong></div>
        </div></section>
      </div>`;
      if(tab==="timesheets")return data.timesheets.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Rate</th><th>Value</th><th>Billable</th><th>Status</th></tr></thead><tbody>${data.timesheets.map(x=>`<tr><td>${esc(String(x.entry_date).slice(0,10))}</td><td>${esc(x.description)}</td><td>${Number(x.hours).toFixed(2)}</td><td>${money(x.hourly_rate,cur)}</td><td>${money(x.value,cur)}</td><td>${x.billable?"Yes":"No"}</td><td>${x.billed_invoice_id?"Billed":"Unbilled"}</td></tr>`).join("")}</tbody></table></div>`:empty("No time entries linked to this project.");
      if(tab==="expenses")return data.expenses.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Reference</th><th>Billable</th><th>VAT</th><th>Amount</th><th>Status</th></tr></thead><tbody>${data.expenses.map(x=>`<tr><td>${esc(String(x.expense_date).slice(0,10))}</td><td>${esc(x.supplier||"—")}</td><td>${esc(x.category||"—")}</td><td>${esc(x.reference||"—")}</td><td>${x.billable?"Yes":"No"}</td><td>${money(x.vat_amount,cur)}</td><td>${money(x.amount,cur)}</td><td>${x.billed_invoice_id?"Billed":"Unbilled"}</td></tr>`).join("")}</tbody></table></div>`:empty("No expenses linked to this project.");
      if(tab==="invoices")return data.invoices.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th>Total</th><th>Paid</th><th>Write-off</th><th>Balance</th></tr></thead><tbody>${data.invoices.map(x=>`<tr class="project-invoice-row" data-id="${x.id}" style="cursor:pointer"><td><strong>${esc(x.invoice_number)}</strong></td><td>${esc(String(x.invoice_date).slice(0,10))}</td><td>${esc(x.due_date?String(x.due_date).slice(0,10):"—")}</td><td><span class="status ${esc(x.status)}">${esc(String(x.status).replaceAll("_"," "))}</span></td><td>${money(x.total,x.currency||cur)}</td><td>${money(x.amount_paid,x.currency||cur)}</td><td>${money(x.bad_debt_amount,x.currency||cur)}</td><td><strong>${money(x.balance,x.currency||cur)}</strong></td></tr>`).join("")}</tbody></table></div>`:empty("No invoices linked to this project.");
      const budget=Number(s.budget||0),expense=Number(s.expenses||0),revenue=Number(s.revenue||0),margin=Number(s.margin||0);
      const usedPct=budget>0?Math.max(0,Math.min(100,expense/budget*100)):0;
      const marginPct=Number(s.margin_percent||0);
      return `<div class="project-profit-grid">
        <section class="project-profit-card"><span>Revenue</span><strong>${money(revenue,cur)}</strong><small>Issued project invoices</small></section>
        <section class="project-profit-card"><span>Expenses</span><strong>${money(expense,cur)}</strong><small>Recorded project expenses</small></section>
        <section class="project-profit-card ${margin<0?"negative":""}"><span>Gross project margin</span><strong>${money(margin,cur)}</strong><small>${marginPct.toFixed(1)}% of revenue</small></section>
        <section class="project-profit-card"><span>Outstanding</span><strong>${money(s.outstanding,cur)}</strong><small>Collectible project receivables</small></section>
        <section class="project-profit-wide"><div><span>Budget usage</span><strong>${money(expense,cur)} of ${money(budget,cur)}</strong></div><div class="project-progress"><i style="width:${usedPct}%"></i></div><small>${budget>0?usedPct.toFixed(1)+"% used":"No budget set"} · Remaining ${money(s.budget_remaining,cur)}</small></section>
        <section class="project-profit-wide"><div><span>Billable work pipeline</span><strong>${money(Number(s.time_value||0)+Number(s.billable_expenses||0),cur)}</strong></div><small>Billable time value plus billable expenses recorded against this project. Review before invoicing.</small></section>
      </div>`;
    };
    const render=tab=>{
      $("#content").innerHTML=`<div class="project-detail-head"><div><button class="btn btn-ghost" id="project-back">← Projects</button><span class="customer-type-pill">${esc(String(p.status||"active").replaceAll("_"," "))}</span><h1>${esc(p.project_name)}</h1><p>${esc(p.project_code||"")} ${p.customer_name?"· "+esc(p.customer_name):""}</p></div><div class="customer-detail-actions"><button class="btn btn-outline" id="project-edit-detail">Edit</button><button class="btn btn-primary" id="project-new-invoice">+ New invoice</button></div></div>
      <div class="customer-summary-grid">${metric("Revenue",money(s.revenue,cur))}${metric("Expenses",money(s.expenses,cur))}${metric("Margin",money(s.margin,cur),Number(s.margin)<0?"danger":"")}${metric("Outstanding",money(s.outstanding,cur),Number(s.outstanding)>0?"danger":"")}</div>
      <div class="customer-detail-shell"><nav class="customer-tabs">${[["overview","Overview"],["timesheets","Timesheets"],["expenses","Expenses"],["invoices","Invoices"],["profitability","Profitability"]].map(([k,n])=>`<button data-tab="${k}" class="${tab===k?"active":""}">${n}${k==="timesheets"?` <small>${s.timesheets}</small>`:k==="expenses"?` <small>${s.expense_entries}</small>`:k==="invoices"?` <small>${s.invoices}</small>`:""}</button>`).join("")}</nav><section class="customer-tab-panel">${renderTab(tab)}</section></div>`;
      $("#project-back").onclick=renderProjects;
      $("#project-edit-detail").onclick=()=>showProjectModal(state.projects.find(x=>String(x.id)===String(p.id))||p);
      $("#project-new-invoice").onclick=()=>{showInvoiceEditor();state.editing.customer_id=p.customer_id||"";state.editing.project_id=p.id;const cs=$("#f-customer"),ps=$("#f-project");if(cs)cs.value=p.customer_id||"";if(ps)ps.value=p.id;renderPreview()};
      $$(".customer-tabs button").forEach(b=>b.onclick=()=>render(b.dataset.tab));
      $$(".project-invoice-row").forEach(row=>row.onclick=()=>openInvoice(row.dataset.id));
    };
    render(initialTab);
  }catch(err){alert(err.message)}
}

function showProjectModal(existing=null){
  const p=existing||{project_name:"",project_code:"",customer_id:"",status:"active",start_date:today(),end_date:"",budget:0,billing_method:"time_and_materials",hourly_rate:0,description:""};
  const wrap=document.createElement("div");wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>${existing?"Edit project":"New project"}</h2><button class="icon-btn close-modal">×</button></div>
  <form class="form-grid project-form"><label class="span2">Project name<input name="project_name" value="${esc(p.project_name||"")}" required></label>
  <label>Project code<input name="project_code" value="${esc(p.project_code||"")}"></label><label>Customer<select name="customer_id"><option value="">No customer</option>${state.customers.map(c=>`<option value="${c.id}" ${String(p.customer_id||"")===String(c.id)?"selected":""}>${esc(c.company||c.name)}</option>`).join("")}</select></label>
  <label>Status<select name="status"><option value="active" ${p.status==="active"?"selected":""}>Active</option><option value="on_hold" ${p.status==="on_hold"?"selected":""}>On hold</option><option value="completed" ${p.status==="completed"?"selected":""}>Completed</option><option value="cancelled" ${p.status==="cancelled"?"selected":""}>Cancelled</option></select></label>
  <label>Billing method<select name="billing_method"><option value="time_and_materials" ${p.billing_method==="time_and_materials"?"selected":""}>Time & materials</option><option value="fixed_fee" ${p.billing_method==="fixed_fee"?"selected":""}>Fixed fee</option><option value="non_billable" ${p.billing_method==="non_billable"?"selected":""}>Non-billable</option></select></label>
  <label>Start date<input name="start_date" type="date" value="${esc(p.start_date?String(p.start_date).slice(0,10):"")}"></label><label>End date<input name="end_date" type="date" value="${esc(p.end_date?String(p.end_date).slice(0,10):"")}"></label>
  <label>Budget<input name="budget" type="number" min="0" step=".01" value="${Number(p.budget||0)}"></label><label>Hourly rate<input name="hourly_rate" type="number" min="0" step=".01" value="${Number(p.hourly_rate||0)}"></label>
  <label class="span2">Description<textarea name="description" rows="3">${esc(p.description||"")}</textarea></label>
  <div class="span2" style="display:flex;justify-content:flex-end;gap:8px">${existing?'<button type="button" class="btn btn-outline project-delete" style="color:var(--danger)">Delete</button>':""}<button class="btn btn-primary">${existing?"Save changes":"Create project"}</button></div></form></div>`;
  document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".project-form",wrap).onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.budget=Number(body.budget||0);body.hourly_rate=Number(body.hourly_rate||0);try{await api(existing?"/projects/"+existing.id:"/projects",{method:existing?"PUT":"POST",body:JSON.stringify(body)});await Promise.all([loadProjects(),loadTimeEntries(),loadExpenses(),loadInvoices()]);wrap.remove();renderProjects()}catch(err){alert(err.message)}};
  const del=$(".project-delete",wrap);if(del)del.onclick=async()=>{if(!confirm("Delete this project? Linked time, expenses and invoices will remain but become unassigned."))return;try{await api("/projects/"+existing.id,{method:"DELETE"});await Promise.all([loadProjects(),loadTimeEntries(),loadExpenses(),loadInvoices()]);wrap.remove();renderProjects()}catch(err){alert(err.message)}};
}

function renderReports(){
  const categories=[
    {key:"sales",title:"Sales",items:[
      ["sales_by_customer","Sales by Customers"],["sales_by_item","Sales by Item"],["sales_by_salesperson","Sales by Salesperson"]
    ]},
    {key:"receivables",title:"Receivables",items:[
      ["ar_aging_summary","AR Aging Summary"],["ar_aging_details","AR Aging Details"],["invoice_details","Invoice Details"],
      ["quote_details","Quote Details"],["quote_item_details","Quote Item Details"],["bad_debts","Bad Debts"],
      ["bank_charges","Bank Charges"],["customer_balance_summary","Customer Balance Summary"],
      ["receivable_summary","Receivable Summary"],["receivable_details","Receivable Details"]
    ]},
    {key:"payments",title:"Payments Received",items:[
      ["payments_received","Payments Received"],["time_to_get_paid","Time to Get Paid"],["refund_history","Refund History"]
    ]},
    {key:"expenses",title:"Purchases and Expenses",items:[
      ["expense_details","Expense Details"],["expenses_by_category","Expenses by Category"],["expenses_by_customers","Expenses by Customers"],
      ["expenses_by_project","Expenses by Project"],["billable_expense_details","Billable Expense Details"]
    ]},
    {key:"time",title:"Projects and Timesheet",items:[
      ["timesheet_details","Timesheet Details"],["project_summary","Project Summary"],["project_details","Project Details"],["projects_revenue_summary","Projects Revenue Summary"]
    ]},
    {key:"activity",title:"Activity",items:[
      ["system_mails","System Mails"],["activity_logs","Activity Logs & Audit Trail"],["exception_reports","Exception Reports"],
      ["portal_activities","Portal Activities"],["customer_reviews","Customer Reviews"]
    ]}
  ];
  $("#content").innerHTML=`<div class="page-head"><div><h1>Reports Center</h1><p>Sales, receivables, payments, expenses, timesheets and activity reports in one place.</p></div></div>
    <div class="reports-center">
      ${categories.map(cat=>`<section class="report-category">
        <div class="report-category-title"><span class="report-category-icon">${reportIcon(cat.key)}</span><h2>${cat.title}</h2></div>
        <div class="report-link-grid">${cat.items.map(([key,name])=>`<button class="report-link-card" data-report="${key}" data-title="${esc(name)}"><span>${esc(name)}</span><b>›</b></button>`).join("")}</div>
      </section>`).join("")}
    </div>`;
  $$(".report-link-card").forEach(b=>b.onclick=()=>openReportCenterReport(b.dataset.report,b.dataset.title));
}
function reportCell(value,col,currency){
  if(value===null||value===undefined||value==="")return "—";
  if(col.money)return money(value,currency);
  if(col.date)return esc(String(value).slice(0,10));
  if(col.datetime){try{return esc(new Date(value).toLocaleString())}catch{return esc(value)}}
  if(col.bool)return value===true||value==="true"?"Yes":"No";
  if(col.mixed)return typeof value==="number"?Number(value).toLocaleString("en-AE",{maximumFractionDigits:2}):esc(value);
  if(typeof value==="object")return esc(JSON.stringify(value));
  return esc(String(value).replaceAll("_"," "));
}
function reportSummaryHtml(summary,currency){
  const entries=Object.entries(summary||{}).filter(([k])=>k!=="currency");
  if(!entries.length)return "";
  return `<div class="report-summary-grid">${entries.map(([k,v])=>{
    const label=k.replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
    const moneyLike=/sales|received|balance|receivable|expense|value|total(?!_hours)|vat|invoiced|paid|overdue/i.test(k)&&!/(count|hours|days)/i.test(k);
    const val=moneyLike&&typeof v==="number"?money(v,currency):typeof v==="number"?Number(v).toLocaleString("en-AE",{maximumFractionDigits:2}):esc(v);
    return `<div class="report-summary-card"><span>${esc(label)}</span><strong>${val}</strong></div>`;
  }).join("")}</div>`;
}
async function openReportCenterReport(key,title){
  navActive("reports");$("#page-title").textContent="Reports";
  const currency=state.business.currency||"AED";
  $("#content").innerHTML=`<div class="page-head"><div><button class="btn btn-ghost" id="report-back">← Reports Center</button><h1 style="margin-top:8px">${esc(title)}</h1><p>Filter the report by date when applicable, then export or print the results.</p></div></div>
  <div class="report-runner">
    <div class="report-toolbar">
      <label>From<input id="report-from" type="date"></label>
      <label>To<input id="report-to" type="date"></label>
      <button class="btn btn-primary" id="report-run">Run report</button>
      <button class="btn btn-outline" id="report-csv">Download CSV</button>
      <button class="btn btn-outline" id="report-print">Print / PDF</button>
    </div>
    <div id="report-result"><div class="empty"><strong>Loading report…</strong></div></div>
  </div>`;
  $("#report-back").onclick=renderReports;
  let current=null;
  const params=()=>{const p=new URLSearchParams({report:key});const f=$("#report-from").value,t=$("#report-to").value;if(f)p.set("from",f);if(t)p.set("to",t);return p};
  const load=async()=>{
    const host=$("#report-result");host.innerHTML='<div class="empty"><strong>Generating report…</strong></div>';
    try{
      current=await api("/report-center?"+params().toString());
      if(!current.available){
        host.innerHTML=`<div class="report-unavailable"><div class="report-unavailable-icon">!</div><h3>${esc(current.title||title)}</h3><p>${esc(current.reason||"This report requires an additional source module.")}</p><span>Report is listed in the Reports Center so it can activate automatically when its source module is added.</span></div>`;
        return current;
      }
      const cols=current.columns||[],rows=current.rows||[],cur=current.summary&&current.summary.currency||currency;
      host.innerHTML=`${reportSummaryHtml(current.summary,cur)}${current.note?`<div class="report-note">${esc(current.note)}</div>`:""}
        ${rows.length?`<div class="table-wrap"><table class="data-table report-data-table"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(c=>`<td class="${c.money?"money":""}">${reportCell(row[c.key],c,row.currency||cur)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No data found</strong>No records match this report and date range.</div>`}`;
      return current;
    }catch(err){host.innerHTML=`<div class="empty"><strong>Could not generate report</strong>${esc(err.message)}</div>`;return null}
  };
  $("#report-run").onclick=load;
  $("#report-csv").onclick=async()=>{
    const data=current&&current.available?current:await load();if(!data||!data.available)return;
    const cur=data.summary&&data.summary.currency||currency,cols=data.columns||[];
    const rows=[[...cols.map(c=>c.label)],...(data.rows||[]).map(row=>cols.map(c=>row[c.key]??""))];
    const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=(data.title||title).replace(/[^a-zA-Z0-9_-]/g,"_")+".csv";a.click();URL.revokeObjectURL(url);
  };
  $("#report-print").onclick=async()=>{
    const data=current&&current.available?current:await load();if(!data||!data.available)return;
    const cur=data.summary&&data.summary.currency||currency,cols=data.columns||[];
    const w=window.open("","_blank");
    w.document.write(`<!doctype html><html><head><title>${esc(data.title||title)}</title><style>body{font-family:Arial;padding:28px;color:#1F2E3D}h1{color:#112B4A}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}th{background:#112B4A;color:white;text-align:left;padding:8px}td{padding:8px;border-bottom:1px solid #ddd}.num{text-align:right}.note{margin:10px 0;color:#66788A;font-size:11px}</style></head><body><h1>${esc(data.title||title)}</h1><p>Perficient Zone Billing</p>${data.note?`<div class="note">${esc(data.note)}</div>`:""}<table><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${(data.rows||[]).map(row=>`<tr>${cols.map(c=>`<td class="${c.money?"num":""}">${reportCell(row[c.key],c,row.currency||cur)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    w.document.close();w.focus();w.print();
  };
  await load();
}

function renderQuotes(){
  $("#content").innerHTML=`<div class="page-head"><div><h1>Quotes</h1><p>Create estimates and convert accepted quotes into invoices.</p></div><button class="btn btn-primary" id="new-quote">+ New quote</button></div>
  <div class="panel">${state.quotes.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Expiry</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>${state.quotes.map(q=>`<tr><td><strong>${esc(q.quote_number)}</strong></td><td>${esc(q.customer_name||"—")}</td><td>${esc(String(q.quote_date).slice(0,10))}</td><td>${esc(q.expiry_date?String(q.expiry_date).slice(0,10):"—")}</td><td><span class="status ${esc(q.status)}">${esc(q.status)}</span></td><td>${money(q.total,q.currency)}</td><td>${q.converted_invoice_id?"Converted":`<button class="btn btn-ghost quote-convert" data-id="${q.id}">Convert</button>`}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No quotes yet</strong>Create a quote and convert it into an invoice when accepted.</div>`}</div>`;
  $("#new-quote").onclick=()=>showQuoteEditor();
  $$(".quote-convert").forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm("Convert this quote into a draft invoice?"))return;try{const d=await api("/quote-convert/"+b.dataset.id,{method:"POST",body:"{}"});await Promise.all([loadQuotes(),loadInvoices(),loadDashboard()]);alert("Created invoice "+d.invoice.invoice_number);renderQuotes()}catch(err){alert(err.message)}});
}
function blankQuote(){return{quote_number:"",quote_date:today(),expiry_date:plusDays(today(),14),customer_id:"",currency:state.business.currency||"AED",reference:"",notes:"Thank you for considering our quotation.",terms:"Quotation valid until the expiry date.",vat_mode:"exclusive",discount_type:"fixed",discount_value:0,status:"draft",items:[{item_name:"Service",description:"",quantity:1,unit:"",rate:0,discount_percent:0,tax_rate:state.business.vat_registered?Number(state.business.default_tax_rate||5):0,tax_category:state.business.vat_registered?"standard":"out_of_scope"}]}}
function showQuoteEditor(){
  state.quoteEditing=blankQuote();const q=state.quoteEditing;navActive("quotes");
  $("#content").innerHTML=`<div class="page-head"><div><h1>Create quote</h1><p>Build a customer estimate, then convert it to an invoice later.</p></div><button class="btn btn-outline" id="quote-back">Back</button></div>
  <div class="setup-card" style="margin:0;max-width:900px"><div class="form-grid">
    <label>Customer<select id="q-customer"><option value="">Select customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.company||c.name)}</option>`).join("")}</select></label>
    <label>Currency<select id="q-currency">${["AED","USD","EUR","GBP","SAR","INR"].map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>Quote date<input id="q-date" type="date" value="${q.quote_date}"></label><label>Expiry date<input id="q-expiry" type="date" value="${q.expiry_date}"></label>
    <label>Discount type<select id="q-discount-type"><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></select></label><label>Discount value<input id="q-discount" type="number" step=".01" min="0" value="0"></label>
  </div><div class="items-box"><div class="item-head"><span>Item / description</span><span>Qty</span><span>Rate</span><span>VAT</span><span></span></div><div id="quote-items"></div></div>
  <div class="editor-actions"><button class="btn btn-outline" id="quote-add-item">+ Add item</button><div><strong id="quote-total"></strong> <button class="btn btn-primary" id="quote-save">Create quote</button></div></div></div>`;
  $("#quote-back").onclick=()=>navigate("quotes");
  [["#q-customer","customer_id"],["#q-currency","currency"],["#q-date","quote_date"],["#q-expiry","expiry_date"],["#q-discount-type","discount_type"],["#q-discount","discount_value"]].forEach(([s,k])=>{const el=$(s);el.oninput=el.onchange=()=>{q[k]=k==="discount_value"?Number(el.value||0):el.value;renderQuoteItems()}});
  $("#quote-add-item").onclick=()=>{q.items.push({item_name:"Service",description:"",quantity:1,rate:0,discount_percent:0,tax_rate:state.business.vat_registered?Number(state.business.default_tax_rate||5):0,tax_category:state.business.vat_registered?"standard":"out_of_scope"});renderQuoteItems()};
  $("#quote-save").onclick=saveQuote;renderQuoteItems();
}
function renderQuoteItems(){
  const q=state.quoteEditing;$("#quote-items").innerHTML=q.items.map((it,i)=>`<div class="item-row" data-i="${i}"><div class="item-name-wrap"><input data-k="item_name" value="${esc(it.item_name)}"><textarea data-k="description">${esc(it.description||"")}</textarea></div><input data-k="quantity" type="number" min="0" step=".001" value="${it.quantity}"><input data-k="rate" type="number" min="0" step=".01" value="${it.rate}"><select data-k="tax_category">${state.business.vat_registered?`<option value="standard" ${it.tax_category==="standard"?"selected":""}>${Number(state.business.default_tax_rate||5)}%</option><option value="zero" ${it.tax_category==="zero"?"selected":""}>0%</option><option value="exempt" ${it.tax_category==="exempt"?"selected":""}>Exempt</option><option value="out_of_scope" ${it.tax_category==="out_of_scope"?"selected":""}>OOS</option>`:`<option value="out_of_scope">No VAT</option>`}</select><button class="remove-item">×</button></div>`).join("");
  $$("#quote-items .item-row").forEach(row=>{const i=Number(row.dataset.i);$$("[data-k]",row).forEach(el=>{el.oninput=el.onchange=()=>{const k=el.dataset.k;q.items[i][k]=["quantity","rate"].includes(k)?Number(el.value||0):el.value;if(k==="tax_category")q.items[i].tax_rate=el.value==="standard"?Number(state.business.default_tax_rate||5):0;renderQuoteTotal()}});$(".remove-item",row).onclick=()=>{if(q.items.length>1){q.items.splice(i,1);renderQuoteItems()}}});
  renderQuoteTotal();
}
function renderQuoteTotal(){const c=calc(state.quoteEditing);$("#quote-total").textContent="Total: "+money(c.total,state.quoteEditing.currency)}
async function saveQuote(){
  const q=state.quoteEditing;if(!q.customer_id){alert("Select a customer.");return}
  try{const out=await api("/quotes",{method:"POST",body:JSON.stringify(q)});await loadQuotes();alert("Quote "+out.quote.quote_number+" created.");navigate("quotes")}catch(err){alert(err.message)}
}

function renderRecurring(){
  $("#content").innerHTML=`<div class="page-head"><div><h1>Advanced Billing</h1><p>Recurring billing automation for repeat customers. Draft invoices are created on schedule and are never emailed automatically.</p></div><button class="btn btn-primary" id="new-recurring">+ New billing schedule</button></div>
  <div class="panel">${state.recurring.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Customer</th><th>Frequency</th><th>Next run</th><th>Status</th><th></th></tr></thead><tbody>${state.recurring.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.customer_name||"—")}</td><td>${esc(r.frequency)}</td><td>${esc(String(r.next_run_date).slice(0,10))}</td><td>${r.active?"Active":"Paused"}</td><td><button class="btn btn-ghost recurring-toggle" data-id="${r.id}" data-active="${r.active}">${r.active?"Pause":"Resume"}</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No recurring schedules</strong>Create a schedule for repeat customers.</div>`}</div>`;
  $("#new-recurring").onclick=showRecurringModal;
  $$(".recurring-toggle").forEach(b=>b.onclick=async()=>{try{await api("/recurring/"+b.dataset.id,{method:"PUT",body:JSON.stringify({active:b.dataset.active!=="true"})});await loadRecurring();renderRecurring()}catch(err){alert(err.message)}});
}
function showRecurringModal(){
  if(!state.customers.length){alert("Add a customer first.");return}
  const productOptions=state.products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.rate,state.business.currency)}</option>`).join("");
  const wrap=document.createElement("div");wrap.className="modal";wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>New recurring schedule</h2><button class="icon-btn close-modal">×</button></div>
  <form class="form-grid recurring-form"><label class="span2">Schedule name<input name="name" required placeholder="Monthly support fee"></label>
  <label>Customer<select name="customer_id">${state.customers.map(c=>`<option value="${c.id}">${esc(c.company||c.name)}</option>`).join("")}</select></label>
  <label>Frequency<select name="frequency"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
  <label>Next invoice date<input name="next_run_date" type="date" value="${today()}"></label><label>Product / service<select name="product_id">${productOptions||'<option value="">Custom service</option>'}</select></label>
  <label>Custom item name<input name="custom_name" placeholder="Used if no saved product"></label><label>Rate<input name="custom_rate" type="number" min="0" step=".01" value="0"></label>
  <label>Quantity<input name="quantity" type="number" min="0" step=".001" value="1"></label><label>Discount %<input name="discount_percent" type="number" min="0" max="100" step=".01" value="0"></label>
  <div class="span2"><button class="btn btn-primary">Create schedule</button></div></form></div>`;document.body.append(wrap);
  $(".close-modal",wrap).onclick=()=>wrap.remove();
  $(".recurring-form",wrap).onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());const p=state.products.find(x=>x.id===f.product_id);const item=p?{item_name:p.name,description:p.description||"",quantity:Number(f.quantity||1),rate:Number(p.rate),discount_percent:Number(f.discount_percent||0),tax_rate:Number(p.tax_rate),tax_category:p.tax_category}:{item_name:f.custom_name||"Service",description:"",quantity:Number(f.quantity||1),rate:Number(f.custom_rate||0),discount_percent:Number(f.discount_percent||0),tax_rate:state.business.vat_registered?Number(state.business.default_tax_rate||5):0,tax_category:state.business.vat_registered?"standard":"out_of_scope"};const body={name:f.name,customer_id:f.customer_id,frequency:f.frequency,next_run_date:f.next_run_date,currency:state.business.currency,template_key:"classic",vat_mode:"exclusive",invoice_format:"full",tax_display:state.business.vat_registered?"line":"hidden",discount_type:"fixed",discount_value:0,items:[item]};try{await api("/recurring",{method:"POST",body:JSON.stringify(body)});await loadRecurring();wrap.remove();renderRecurring()}catch(err){alert(err.message)}};
}

function renderTemplates(){
  const templates=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["corporate","Corporate"],["elegant","Elegant"],["professional","Professional"],["compact","Compact"],["bold","Bold"]];
  $("#content").innerHTML=`<div class="page-head"><div><h1>Invoice templates</h1><p>Eight original styles. Choose any style while creating an invoice.</p></div></div>
  <div class="customer-grid">${templates.map(([k,n])=>`<article class="customer-card"><div style="height:150px;background:${k==="modern"?"#e9f6f3":k==="bold"?"#162b3d":"#f7f8f8"};border-radius:12px;padding:16px;margin-bottom:14px"><div style="width:48%;height:7px;background:#0e7568;margin-bottom:10px"></div><div style="width:75%;height:5px;background:#cbd8d6;margin-bottom:22px"></div><div style="height:52px;border-top:2px solid #183449;border-bottom:1px solid #dce6e4"></div></div><h3>${n}</h3><p>Available in the invoice editor.</p></article>`).join("")}</div>`;
}
function renderBilling(){
  const ps=state.planState||{plan:{key:"free",name:"Free",monthly_invoice_limit:5},usage:{invoices_this_month:0},remaining_invoices:5};
  const used=ps.usage&&ps.usage.invoices_this_month||0;
  const limit=ps.plan.monthly_invoice_limit;
  const usageText=limit===null?`${used} invoices created this month · unlimited plan`:`${used} of ${limit} invoices used this month · ${Math.max(0,limit-used)} remaining`;
  const planCard=(key,name,price,features,popular=false)=>`<article class="price ${popular?"popular":""}">${popular?'<span class="badge">Best value</span>':""}<h3>${name}</h3><div class="amount">${price}</div><ul>${features.map(x=>`<li>${x}</li>`).join("")}</ul>${ps.plan.key===key?`<button class="btn btn-outline" disabled>Current plan</button>`:`<button class="btn btn-primary choose-plan" data-plan="${key}" ${key==="free"?"disabled":""}>Choose ${name}</button>`}</article>`;
  $("#content").innerHTML=`<div class="page-head"><div><h1>Plans</h1><p>Your current plan is <strong>${esc(ps.plan.name)}</strong>. ${esc(usageText)}</p></div></div>
  <div class="pricing">
    ${planCard("free","Free","AED 0",["5 invoices/month","1 business","Secure invoice links","Perficient Zone Billing branding"])}
    ${planCard("starter","Starter",'AED 7.99 <small>/month</small>',["100 invoices/month","All templates","Quotes & sharing","Basic reports"],true)}
    ${planCard("pro","Pro",'AED 19.99 <small>/month</small>',["Unlimited invoices","Recurring invoices","Customer portal","Remove platform branding"])}
    ${planCard("business","Business",'AED 39.99 <small>/month</small>',["Everything in Pro","Up to 5 businesses","Team-ready architecture","Advanced export/reporting"])}
  </div>
  <div class="panel"><div style="padding:20px"><strong>Live billing is not active yet.</strong><p class="muted">The checkout architecture is ready, but no card or bank payment will be attempted until a merchant payment provider is connected, credentials are configured, and webhook verification is tested.</p></div></div>`;
  $$(".choose-plan").forEach(b=>b.onclick=async()=>{try{await api("/billing-checkout",{method:"POST",body:JSON.stringify({plan:b.dataset.plan})})}catch(err){alert(err.message)}});
}
function renderSettings(){
  const b=state.business;
  $("#content").innerHTML=`<div class="page-head"><div><h1>Business settings</h1><p>Seller, VAT, bank and document defaults.</p></div></div>
  <div class="setup-card" style="margin:0"><div style="margin-bottom:22px"><strong>Business logo</strong><p class="muted">PNG, JPEG or WebP, maximum 2 MB.</p>${b.logo_url?`<img src="${esc(b.logo_url)}" style="max-width:160px;max-height:70px;display:block;margin-bottom:10px">`:""}<form id="logo-form"><input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp"><button class="btn btn-outline" type="submit">Upload logo</button></form></div>
  <form id="settings-form" class="form-grid">
    <label class="span2">Legal business name<input name="legal_name" value="${esc(b.legal_name)}" required></label>
    <label>Trade name<input name="trade_name" value="${esc(b.trade_name||"")}"></label><label>Emirate<input name="emirate" value="${esc(b.emirate||"")}"></label>
    <label class="span2">Address<textarea name="address" rows="2">${esc(b.address||"")}</textarea></label>
    <label>Phone<input name="phone" value="${esc(b.phone||"")}"></label><label>Email<input name="email" type="email" value="${esc(b.email||"")}"></label>
    <label>Website<input name="website" value="${esc(b.website||"")}"></label><label>TRN<input name="trn" value="${esc(b.trn||"")}"></label>
    <label>VAT registered?<select name="vat_registered"><option value="false" ${!b.vat_registered?"selected":""}>No</option><option value="true" ${b.vat_registered?"selected":""}>Yes</option></select></label>
    <label>Default VAT %<input name="default_tax_rate" type="number" step=".01" value="${esc(b.default_tax_rate)}"></label>
    <label>Currency<input name="currency" value="${esc(b.currency)}"></label><label>Invoice prefix<input name="invoice_prefix" value="${esc(b.invoice_prefix)}"></label>
    <label>Quote prefix<input name="quote_prefix" value="${esc(b.quote_prefix||"QUO-")}"></label><label>Default language<select name="default_language"><option value="en" ${b.default_language!=="ar"?"selected":""}>English</option><option value="ar" ${b.default_language==="ar"?"selected":""}>Arabic</option></select></label>
    <div class="span2" style="border-top:1px solid var(--border);padding-top:16px"><strong>Bank & payment details</strong></div>
    <label>Bank name<input name="bank_name" value="${esc(b.bank_name||"")}"></label><label>Account name<input name="account_name" value="${esc(b.account_name||"")}"></label>
    <label class="span2">IBAN<input name="iban" value="${esc(b.iban||"")}"></label><label>SWIFT<input name="swift" value="${esc(b.swift||"")}"></label>
    <label class="span2">Payment instructions<textarea name="payment_instructions" rows="2">${esc(b.payment_instructions||"")}</textarea></label>
    <div class="span2" style="border-top:1px solid var(--border);padding-top:16px"><strong>Invoice branding</strong></div>
    <label>Accent color<input name="invoice_accent" type="color" value="${esc(b.invoice_accent||"#0e7568")}"></label>
    <label>Invoice font<select name="invoice_font"><option value="inter" ${b.invoice_font==="inter"||!b.invoice_font?"selected":""}>Modern</option><option value="system" ${b.invoice_font==="system"?"selected":""}>System</option><option value="serif" ${b.invoice_font==="serif"?"selected":""}>Classic serif</option></select></label>
    <label class="span2">Invoice footer<textarea name="invoice_footer" rows="2" placeholder="Optional legal or thank-you footer">${esc(b.invoice_footer||"")}</textarea></label>
    <label class="span2" style="display:flex;flex-direction:row;align-items:center;gap:9px"><input name="hide_platform_branding" type="checkbox" style="width:auto" ${b.hide_platform_branding?"checked":""}> Remove “Created with Perficient Zone Billing” branding (Pro/Business)</label>
    <div class="span2"><button class="btn btn-primary">Save changes</button></div>
  </form></div>
  <div class="panel"><div class="panel-head"><h3>UAE e-invoicing readiness</h3></div><div style="padding:20px"><p><strong>Provider connection:</strong> ${state.einvoice&&state.einvoice.connected?"Connected":"Not connected"}</p><p class="muted">${esc(state.einvoice&&state.einvoice.message||"No UAE Accredited Service Provider is connected.")}</p><div class="readiness-grid"><span>${state.einvoice&&state.einvoice.readiness&&state.einvoice.readiness.business_name?"✓":"○"} Business name</span><span>${state.einvoice&&state.einvoice.readiness&&state.einvoice.readiness.trn?"✓":"○"} TRN readiness</span><span>${state.einvoice&&state.einvoice.readiness&&state.einvoice.readiness.vat_configuration?"✓":"○"} VAT configuration</span><span>${state.einvoice&&state.einvoice.readiness&&state.einvoice.readiness.asp_provider_connected?"✓":"○"} ASP connection</span></div><p class="muted" style="margin-top:12px">No government or ASP transmission is performed until a provider-specific integration is configured.</p></div></div>`;
  $("#settings-form").onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target).entries());body.vat_registered=body.vat_registered==="true";body.default_tax_rate=Number(body.default_tax_rate);body.hide_platform_branding=body.hide_platform_branding==="on";try{const out=await api("/business",{method:"POST",body:JSON.stringify(body)});state.business=out.business;await Promise.all([loadPlan(),loadEinvoice()]);alert(out.notice||"Settings saved");renderSettings()}catch(err){alert(err.message)}};
  $("#logo-form").onsubmit=async e=>{e.preventDefault();const file=$("#logo-file").files[0];if(!file){alert("Choose a logo first.");return}const fd=new FormData();fd.append("logo",file);try{const res=await fetch(API+"/business-logo",{method:"POST",body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||"Upload failed");state.business=data.business;alert("Logo uploaded.");renderSettings()}catch(err){alert(err.message)}};
}

function blankDraft(){
  return {
    invoice_number:"",invoice_date:today(),due_date:plusDays(today(),7),supply_date:today(),customer_id:"",
    currency:state.business.currency||"AED",reference:"",salesperson_name:"",project_id:"",notes:"Thank you for your business.",terms:"Payment due on receipt",
    invoice_format:"full",tax_display:state.business.vat_registered?"line":"hidden",vat_mode:"exclusive",
    discount_type:"fixed",discount_value:0,amount_paid:0,status:"draft",share_enabled:true,
    template_key:"classic",language:state.business.default_language||"en",exchange_rate_to_aed:1,
    items:[{item_name:"Service",description:"",quantity:1,unit:"",rate:0,discount_percent:0,tax_rate:state.business.vat_registered?Number(state.business.default_tax_rate||5):0,tax_category:state.business.vat_registered?"standard":"out_of_scope"}]
  };
}
async function openInvoice(id){try{const d=await api("/invoices/"+id);showInvoiceEditor(d.invoice)}catch(err){alert(err.message)}}
function showInvoiceEditor(existing=null){
  navActive("invoices");$("#page-title").textContent=existing?"Edit invoice":"New invoice";
  state.editing=existing?JSON.parse(JSON.stringify(existing)):blankDraft();
  const d=state.editing;
  if(existing){
    d.items=(d.items||[]).map(i=>({...i,quantity:Number(i.quantity),rate:Number(i.rate),discount_percent:Number(i.discount_percent),tax_rate:Number(i.tax_rate)}));
    d.discount_value=Number(d.discount_value??d.discount_amount??0);d.discount_type=d.discount_type||"fixed";d.language=d.language||state.business.default_language||"en";
    state.template=d.template_key||"classic";
  }
  applyCompliance(d);
  $("#content").innerHTML=`<div class="page-head"><div><h1>${existing?"Edit invoice":"Create invoice"}</h1><p>${state.business.vat_registered?"VAT-registered businesses use compliance-aware tax display rules.":"Choose how tax information is displayed for non-VAT documents."}</p></div><button class="btn btn-outline" id="back-invoices">Back to invoices</button></div>
  <div class="template-bar" id="template-bar">${[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["corporate","Corporate"],["elegant","Elegant"],["professional","Professional"],["compact","Compact"],["bold","Bold"]].map(([k,n])=>`<button class="template-chip ${state.template===k?"active":""}" data-template="${k}">${n}</button>`).join("")}</div>
  <div class="invoice-editor">
    <section class="editor-panel">
      <div class="editor-grid">
        <label class="editor-field">Customer<select id="f-customer"><option value="">Select customer</option>${state.customers.map(c=>`<option value="${c.id}" ${String(d.customer_id||"")===String(c.id)?"selected":""}>${esc(c.company||c.name)}</option>`).join("")}</select></label>
        <label class="editor-field">Project<select id="f-project"><option value="">No project</option>${state.projects.map(p=>`<option value="${p.id}" ${String(d.project_id||"")===String(p.id)?"selected":""}>${esc(p.project_name)}</option>`).join("")}</select></label>
        <label class="editor-field">Invoice number<input id="f-number" value="${esc(d.invoice_number||"")}" placeholder="Auto"></label>
        <label class="editor-field">Currency<select id="f-currency">${["AED","USD","EUR","GBP","SAR","QAR","OMR","BHD","KWD","INR"].map(x=>`<option ${d.currency===x?"selected":""}>${x}</option>`).join("")}</select></label>
        <label class="editor-field">Invoice date<input id="f-date" type="date" value="${esc(String(d.invoice_date||today()).slice(0,10))}"></label>
        <label class="editor-field">Supply date<input id="f-supply" type="date" value="${esc(String(d.supply_date||d.invoice_date||today()).slice(0,10))}"></label>
        <label class="editor-field">Due date<input id="f-due" type="date" value="${esc(String(d.due_date||"").slice(0,10))}"></label>
        <label class="editor-field">VAT mode<select id="f-vatmode"><option value="exclusive" ${d.vat_mode!=="inclusive"?"selected":""}>Prices exclude VAT</option><option value="inclusive" ${d.vat_mode==="inclusive"?"selected":""}>Prices include VAT</option></select></label>
        <label class="editor-field">Invoice format<select id="f-format">${state.business.vat_registered?`<option value="full" ${d.invoice_format!=="simplified"?"selected":""}>Full tax invoice</option><option value="simplified" ${d.invoice_format==="simplified"?"selected":""}>Simplified tax invoice</option>`:`<option value="full">Standard invoice</option>`}</select></label>
        <label class="editor-field">Tax display<select id="f-taxdisplay" ${state.business.vat_registered?"disabled":""}>${state.business.vat_registered?(d.invoice_format==="simplified"?`<option value="totals">VAT in totals (simplified)</option>`:`<option value="line">VAT per line (full invoice)</option>`):`<option value="hidden" ${d.tax_display==="hidden"?"selected":""}>Hide VAT display</option><option value="totals" ${d.tax_display==="totals"?"selected":""}>VAT only in totals</option><option value="line" ${d.tax_display==="line"?"selected":""}>Show VAT per line</option>`}</select></label>
        <label class="editor-field">Language<select id="f-language"><option value="en" ${d.language!=="ar"?"selected":""}>English</option><option value="ar" ${d.language==="ar"?"selected":""}>العربية</option></select></label>
        <label class="editor-field">Status<select id="f-status">${["draft","sent","partially_paid","paid","cancelled"].map(x=>`<option value="${x}" ${d.status===x?"selected":""}>${x.replaceAll("_"," ")}</option>`).join("")}</select></label>
        <label class="editor-field">Secure sharing<select id="f-share"><option value="true" ${d.share_enabled!==false?"selected":""}>Enabled</option><option value="false" ${d.share_enabled===false?"selected":""}>Disabled</option></select></label>
        <label class="editor-field span3">Reference / PO<input id="f-reference" value="${esc(d.reference||"")}"></label>
        <label class="editor-field span3 fx-field ${state.business.vat_registered&&d.currency!=="AED"?"":"hidden"}">Exchange rate to AED<input id="f-fx" type="number" step=".00000001" min="0" value="${Number(d.exchange_rate_to_aed||1)}"><small>Required so VAT can also be shown in AED.</small></label>
      </div>

      <div class="invoice-identity-box">
        <div class="invoice-logo-control">
          <div class="identity-label">Company logo</div>
          <div class="logo-control-row">
            <div class="logo-thumb">${state.business.logo_url?`<img src="${esc(state.business.logo_url)}" alt="Company logo">`:`<span>LOGO</span>`}</div>
            <div>
              <input id="f-logo" type="file" accept="image/png,image/jpeg,image/webp">
              <button type="button" class="btn btn-outline" id="upload-invoice-logo">Upload / change logo</button>
              <div class="identity-help">Saved to your business profile and reused on future invoices.</div>
            </div>
          </div>
        </div>
        <label class="editor-field salesperson-field">Sales person
          <input id="f-salesperson" value="${esc(d.salesperson_name||"")}" placeholder="e.g. Mohammed Faiyaz">
          <small>Shown on this invoice so the customer knows who handled the sale.</small>
        </label>
      </div>

      <div class="product-picker"><select id="product-picker"><option value="">Add from Products & Services</option>${state.products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.rate,d.currency)}</option>`).join("")}</select><button class="btn btn-outline" id="add-product-line">Add selected</button></div>
      <div class="items-box"><div class="item-head phase2"><span>Item / description</span><span>Qty</span><span>Rate</span><span>Disc %</span><span>VAT</span><span></span></div><div id="items"></div></div>

      <div class="editor-actions"><button class="btn btn-outline" id="add-item">+ Custom item</button><div class="right">${existing?`<button class="btn btn-outline" id="record-payment">Record payment</button><button class="btn btn-outline" id="writeoff-invoice">Write off</button>`:""}<button class="btn btn-outline" id="print-invoice">Print</button><button class="btn btn-primary" id="save-invoice">${existing?"Save changes":"Create invoice"}</button></div></div>
      <div class="totals-editor">
        <div class="row"><span>Discount type</span><select id="f-discount-type"><option value="fixed" ${d.discount_type!=="percent"?"selected":""}>Fixed amount</option><option value="percent" ${d.discount_type==="percent"?"selected":""}>Percentage</option></select></div>
        <div class="row"><span>Discount value</span><input id="f-discount" type="number" step=".01" min="0" value="${Number(d.discount_value||0)}"></div>
        <div class="row"><span>Amount paid</span><input id="f-paid" type="number" step=".01" min="0" value="${Number(d.amount_paid||0)}"></div>
      </div>
      <div class="editor-grid" style="margin-top:16px"><label class="editor-field span3">Notes<textarea id="f-notes" rows="2">${esc(d.notes||"")}</textarea></label><label class="editor-field span3">Terms<textarea id="f-terms" rows="2">${esc(d.terms||"")}</textarea></label></div>
      ${existing?shareActions(existing):""}
    </section>
    <aside class="preview-wrap"><div id="preview" class="invoice-page"></div></aside>
  </div>`;
  $("#back-invoices").onclick=()=>navigate("invoices");
  $$("#template-bar .template-chip").forEach(b=>b.onclick=()=>{state.template=b.dataset.template;d.template_key=state.template;$$(".template-chip").forEach(x=>x.classList.toggle("active",x===b));renderPreview()});
  bindEditorFields();renderItemRows();renderPreview();if(existing)bindShareActions(existing);
}
function applyCompliance(d){
  if(state.business.vat_registered){d.invoice_format=d.invoice_format==="simplified"?"simplified":"full";d.tax_display=d.invoice_format==="simplified"?"totals":"line"}else{d.tax_display=d.tax_display||"hidden"}
}
function shareActions(d){
  const views=Number(d.view_count||0);
  return `<div class="share-box"><strong>Customer sharing</strong><p class="muted">The secure link uses a non-guessable token. Sharing only works while secure sharing is enabled.</p><div class="share-stats"><span>Sent: ${d.sent_at?"Yes":"No"}</span><span>Views: ${views}</span><span>Last viewed: ${d.last_viewed_at?esc(new Date(d.last_viewed_at).toLocaleString()):"—"}</span></div><div class="share-buttons"><button class="btn btn-outline" id="open-share">Open link</button><button class="btn btn-outline" id="copy-share">Copy link</button><button class="btn btn-outline" id="whatsapp-share">WhatsApp</button><button class="btn btn-outline" id="email-share">Email</button><button class="btn btn-outline" id="download-pdf">Download PDF</button><button class="btn btn-outline" id="activity-share">Activity</button></div></div>`;
}
function bindShareActions(d){
  const link=()=>location.origin+"/invoice/"+d.public_token;
  $("#open-share").onclick=()=>window.open(link(),"_blank");
  $("#copy-share").onclick=async()=>{await navigator.clipboard.writeText(link());alert("Secure invoice link copied.")};
  $("#whatsapp-share").onclick=()=>{const customer=state.customers.find(c=>String(c.id)===String(d.customer_id));const name=customer?(customer.company||customer.name):"Customer";const msg=`Hello ${name}, invoice ${d.invoice_number} for ${d.currency} ${Number(d.total).toFixed(2)} is ready. View/download: ${link()}`;window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank")};
  $("#email-share").onclick=async()=>{const customer=state.customers.find(c=>String(c.id)===String(d.customer_id));const to=prompt("Send invoice to:",customer&&customer.email||"");if(!to)return;try{await api("/invoice-email/"+d.id,{method:"POST",body:JSON.stringify({to})});alert("Invoice email sent.");await Promise.all([loadInvoices(),loadDashboard()])}catch(err){alert(err.message)}};
  $("#download-pdf").onclick=()=>{window.location.href=API+"/invoice-pdf/"+d.id};
  $("#activity-share").onclick=()=>showInvoiceActivity(d.id);
  $("#record-payment").onclick=()=>showPaymentModal(d.id);
  const wo=$("#writeoff-invoice");if(wo)wo.onclick=()=>showBadDebtModal(d.id);
}
async function showInvoiceActivity(id){
  try{
    const data=await api("/invoice-events/"+id);
    const wrap=document.createElement("div");wrap.className="modal";
    wrap.innerHTML=`<div class="modal-card"><div class="modal-head"><h2>Invoice activity</h2><button class="icon-btn close-modal">×</button></div>${data.events.length?`<div class="activity-list">${data.events.map(x=>`<div class="activity-row"><strong>${esc(String(x.event_type).replaceAll("_"," "))}</strong><span>${esc(x.recipient||"")}</span><small>${esc(new Date(x.created_at).toLocaleString())}</small></div>`).join("")}</div>`:`<div class="empty">No delivery activity yet.</div>`}</div>`;
    document.body.append(wrap);$(".close-modal",wrap).onclick=()=>wrap.remove();
  }catch(err){alert(err.message)}
}
function bindEditorFields(){
  const d=state.editing;
  const map=[["#f-customer","customer_id"],["#f-project","project_id"],["#f-number","invoice_number"],["#f-currency","currency"],["#f-date","invoice_date"],["#f-supply","supply_date"],["#f-due","due_date"],["#f-vatmode","vat_mode"],["#f-format","invoice_format"],["#f-taxdisplay","tax_display"],["#f-language","language"],["#f-status","status"],["#f-reference","reference"],["#f-salesperson","salesperson_name"],["#f-discount-type","discount_type"],["#f-discount","discount_value"],["#f-paid","amount_paid"],["#f-notes","notes"],["#f-terms","terms"],["#f-fx","exchange_rate_to_aed"],["#f-share","share_enabled"]];
  map.forEach(([sel,key])=>{const el=$(sel);if(!el)return;el.oninput=el.onchange=()=>{if(["discount_value","amount_paid","exchange_rate_to_aed"].includes(key))d[key]=Number(el.value||0);else if(key==="share_enabled")d[key]=el.value==="true";else d[key]=el.value;if(key==="invoice_format"){applyCompliance(d);const td=$("#f-taxdisplay");if(td){td.innerHTML=d.invoice_format==="simplified"?'<option value="totals">VAT in totals (simplified)</option>':'<option value="line">VAT per line (full invoice)</option>';td.value=d.tax_display}renderPreview();return}if(key==="currency")$(".fx-field").classList.toggle("hidden",!(state.business.vat_registered&&d.currency!=="AED"));renderPreview()}});
  $("#add-item").onclick=()=>{d.items.push({item_name:"Service",description:"",quantity:1,unit:"",rate:0,discount_percent:0,tax_rate:state.business.vat_registered?Number(state.business.default_tax_rate||5):0,tax_category:state.business.vat_registered?"standard":"out_of_scope"});renderItemRows();renderPreview()};
  $("#add-product-line").onclick=()=>{const p=state.products.find(x=>x.id===$("#product-picker").value);if(!p)return;d.items.push({item_name:p.name,description:p.description||"",quantity:1,unit:p.unit||"",rate:Number(p.rate),discount_percent:0,tax_rate:Number(p.tax_rate),tax_category:p.tax_category});renderItemRows();renderPreview()};
  $("#upload-invoice-logo").onclick=async()=>{
    const file=$("#f-logo").files[0];
    if(!file){alert("Choose a logo image first.");return}
    const fd=new FormData();fd.append("logo",file);
    const btn=$("#upload-invoice-logo");btn.disabled=true;btn.textContent="Uploading...";
    try{
      const res=await fetch(API+"/business-logo",{method:"POST",body:fd});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Logo upload failed");
      state.business=data.business;
      const thumb=$(".logo-thumb");if(thumb)thumb.innerHTML=data.logo_url?`<img src="${esc(data.logo_url)}" alt="Company logo">`:"<span>LOGO</span>";
      renderPreview();
      alert("Logo saved. It will appear on this invoice and future invoices.");
    }catch(err){alert(err.message)}finally{btn.disabled=false;btn.textContent="Upload / change logo"}
  };
  $("#print-invoice").onclick=()=>window.print();$("#save-invoice").onclick=saveInvoice;
}
function renderItemRows(){
  const d=state.editing;
  $("#items").innerHTML=d.items.map((it,i)=>`<div class="item-row phase2" data-i="${i}">
    <div class="item-name-wrap"><input data-k="item_name" value="${esc(it.item_name)}" placeholder="Item"><textarea data-k="description" placeholder="Description">${esc(it.description||"")}</textarea></div>
    <input data-k="quantity" type="number" step=".001" min="0" value="${Number(it.quantity||0)}">
    <input data-k="rate" type="number" step=".01" min="0" value="${Number(it.rate||0)}">
    <input data-k="discount_percent" type="number" step=".01" min="0" max="100" value="${Number(it.discount_percent||0)}">
    <select data-k="tax_category">${state.business.vat_registered?`<option value="standard" ${it.tax_category==="standard"?"selected":""}>${Number(state.business.default_tax_rate||5)}%</option><option value="zero" ${it.tax_category==="zero"?"selected":""}>0%</option><option value="exempt" ${it.tax_category==="exempt"?"selected":""}>Exempt</option><option value="out_of_scope" ${it.tax_category==="out_of_scope"?"selected":""}>OOS</option>`:`<option value="out_of_scope">No VAT</option>`}</select>
    <button class="remove-item" title="Remove">×</button>
  </div>`).join("");
  $$(".item-row",$("#items")).forEach(row=>{const i=Number(row.dataset.i);$$("[data-k]",row).forEach(el=>{el.oninput=el.onchange=()=>{const k=el.dataset.k;d.items[i][k]=["quantity","rate","discount_percent"].includes(k)?Number(el.value||0):el.value;if(k==="tax_category")d.items[i].tax_rate=el.value==="standard"?Number(state.business.default_tax_rate||5):0;renderPreview()}});$(".remove-item",row).onclick=()=>{if(d.items.length===1)return;d.items.splice(i,1);renderItemRows();renderPreview()}});
}
function calc(d){
  const mode=d.vat_mode==="inclusive"?"inclusive":"exclusive";let subtotal=0,tax0=0;
  const raw=d.items.map(it=>{const q=Math.max(0,Number(it.quantity)||0),rate=Math.max(0,Number(it.rate)||0),disc=Math.min(100,Math.max(0,Number(it.discount_percent)||0)),tr=it.tax_category==="standard"?Math.max(0,Number(it.tax_rate)||Number(state.business.default_tax_rate||5)):0,gross=q*rate*(1-disc/100);let net,tax,total;if(mode==="inclusive"&&tr>0){net=gross/(1+tr/100);tax=gross-net;total=gross}else{net=gross;tax=net*tr/100;total=net+tax}subtotal+=net;tax0+=tax;return{...it,q,rate,tr,net,tax,total}});
  const type=d.discount_type==="percent"?"percent":"fixed",value=Math.max(0,Number(d.discount_value??d.discount_amount)||0),requested=type==="percent"?subtotal*Math.min(100,value)/100:value,discount=Math.min(subtotal,requested),ratio=subtotal>0?(subtotal-discount)/subtotal:1;
  const items=raw.map(it=>({...it,net:it.net*ratio,tax:it.tax*ratio,total:it.total*ratio}));
  const vat=items.reduce((s,it)=>s+it.tax,0),taxable=subtotal-discount,total=mode==="inclusive"?items.reduce((s,it)=>s+it.total,0):taxable+vat;
  return{items,subtotal,discount,taxable,vat,total,balance:Math.max(0,total-Number(d.amount_paid||0))}
}
function renderPreview(){
  const d=state.editing,c=calc(d),biz=state.business,customer=state.customers.find(x=>String(x.id)===String(d.customer_id)),currency=d.currency||biz.currency||"AED",full=biz.vat_registered&&d.invoice_format!=="simplified",showTax=full||d.tax_display==="line",ar=d.language==="ar";
  const T=ar?{title:biz.vat_registered?"فاتورة ضريبية":"فاتورة",invoice:"رقم الفاتورة",date:"تاريخ الفاتورة",supply:"تاريخ التوريد",due:"تاريخ الاستحقاق",salesperson:"مندوب المبيعات",bill:"فاتورة إلى",desc:"الوصف",qty:"الكمية",rate:"سعر الوحدة",vat:"الضريبة",amount:"المبلغ",subtotal:"المجموع الفرعي",discount:"الخصم",total:"الإجمالي",paid:"المدفوع",balance:"الرصيد",note:"ملاحظة",terms:"الشروط"}:{title:biz.vat_registered?"TAX INVOICE":"INVOICE",invoice:"Invoice #",date:"Invoice date",supply:"Supply date",due:"Due date",salesperson:"Sales person",bill:"Bill to",desc:"Description",qty:"Qty",rate:"Unit price",vat:"VAT",amount:"Amount",subtotal:"Subtotal",discount:"Discount",total:"Total",paid:"Paid",balance:"Balance",note:"Note",terms:"Terms"};
  const page=$("#preview");page.className="invoice-page t-"+state.template;page.dir=ar?"rtl":"ltr";
  page.innerHTML=`<div class="inv-head"><div class="inv-business">${biz.logo_url?`<img src="${esc(biz.logo_url)}" style="max-width:130px;max-height:58px;margin-bottom:8px">`:""}<h2>${esc(biz.trade_name||biz.legal_name)}</h2><div>${esc(biz.address||"Dubai, UAE")}<br>${biz.trn?"TRN: "+esc(biz.trn)+"<br>":""}${esc(biz.email||"")} ${biz.phone?" · "+esc(biz.phone):""}</div></div>
  <div class="inv-title"><h1>${T.title}</h1><div class="inv-meta"><span>${T.invoice}</span><strong>${esc(d.invoice_number||"Auto")}</strong><span>${T.date}</span><strong>${esc(d.invoice_date||"")}</strong><span>${T.supply}</span><strong>${esc(d.supply_date||"")}</strong><span>${T.due}</span><strong>${esc(d.due_date||"")}</strong>${d.salesperson_name?`<span>${T.salesperson}</span><strong>${esc(d.salesperson_name)}</strong>`:""}</div></div></div>
  <div class="billbox"><div class="label">${T.bill}</div><div class="name">${esc(customer?(customer.company||customer.name):"Select a customer")}</div><div>${customer?esc(customer.billing_address||""):""}${customer&&customer.trn?"<br>TRN: "+esc(customer.trn):""}</div></div>
  <table class="inv-table"><thead><tr><th>${T.desc}</th><th class="num">${T.qty}</th><th class="num">${T.rate}</th>${showTax?`<th class="num">${T.vat}</th>`:""}<th class="num">${T.amount}</th></tr></thead><tbody>
  ${c.items.map(it=>`<tr><td><strong>${esc(it.item_name)}</strong>${it.description?`<div class="inv-desc">${esc(it.description)}</div>`:""}${Number(it.discount_percent)>0?`<div class="inv-desc">Discount ${Number(it.discount_percent)}%</div>`:""}</td><td class="num">${Number(it.q).toLocaleString()}</td><td class="num">${money(it.rate,currency).replace(currency+" ","")}</td>${showTax?`<td class="num">${it.tr?it.tr+"% · "+money(it.tax,currency).replace(currency+" ",""):"—"}</td>`:""}<td class="num">${money(it.net,currency).replace(currency+" ","")}</td></tr>`).join("")}
  </tbody></table>
  <div class="inv-totals"><div><span>${T.subtotal}</span><span>${money(c.subtotal,currency)}</span></div>${c.discount>0?`<div><span>${T.discount}${d.discount_type==="percent"?" ("+Number(d.discount_value)+"%)":""}</span><span>-${money(c.discount,currency)}</span></div>`:""}${biz.vat_registered||d.tax_display!=="hidden"?`<div><span>${d.vat_mode==="inclusive"?"Includes VAT":"VAT"} @ ${Number(biz.default_tax_rate||5)}%</span><span>${money(c.vat,currency)}</span></div>`:""}${biz.vat_registered&&currency!=="AED"?`<div><span>VAT payable in AED</span><span>AED ${(c.vat*Number(d.exchange_rate_to_aed||0)).toFixed(2)}</span></div>`:""}<div class="grand"><span>${T.total}</span><span>${money(c.total,currency)}</span></div>${Number(d.amount_paid)>0?`<div><span>${T.paid}</span><span>${money(d.amount_paid,currency)}</span></div><div><strong>${T.balance}</strong><strong>${money(c.balance,currency)}</strong></div>`:""}</div>
  <div class="inv-notes">${d.notes?`<strong>${T.note}</strong><br>${esc(d.notes)}<br><br>`:""}${d.terms?`<strong>${T.terms}</strong><br>${esc(d.terms)}`:""}${biz.iban?`<br><br><strong>IBAN</strong><br>${esc(biz.iban)}`:""}</div>`;
}
async function saveInvoice(){
  const btn=$("#save-invoice");btn.disabled=true;const d=state.editing;
  if(!d.customer_id){btn.disabled=false;alert("Select a customer first.");return}
  if(state.business.vat_registered&&d.currency!=="AED"&&Number(d.exchange_rate_to_aed)<=0){btn.disabled=false;alert("Enter the exchange rate to AED.");return}
  applyCompliance(d);d.template_key=state.template;
  try{
    const path=d.id?"/invoices/"+d.id:"/invoices",method=d.id?"PUT":"POST";
    const payload={...d,items:d.items.map(it=>({...it,tax_rate:it.tax_category==="standard"?Number(state.business.default_tax_rate||5):0}))};
    const result=await api(path,{method,body:JSON.stringify(payload)});
    state.editing=result.invoice;await Promise.all([loadInvoices(),loadDashboard(),loadReport()]);
    alert(d.id?"Invoice updated.":"Invoice created.");navigate("invoices");
  }catch(err){alert(err.message)}finally{btn.disabled=false}
}
boot().catch(err=>{console.error(err);$("#content").innerHTML=`<div class="empty"><strong>Could not load the app</strong>${esc(err.message)}</div>`});