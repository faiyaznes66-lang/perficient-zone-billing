import { createHash } from "node:crypto";

const BASE="https://prod.gets.complyance.io";

export function apiKeyFor(environment="sandbox"){
  return environment==="production"
    ? (process.env.COMPLYANCE_PRODUCTION_API_KEY||"")
    : (process.env.COMPLYANCE_SANDBOX_API_KEY||process.env.COMPLYANCE_API_KEY||"");
}

export async function complyanceRequest(path,{environment="sandbox",method="GET",body,connect=false}={}){
  const key=apiKeyFor(environment);
  if(!key) throw Object.assign(new Error(`Complyance ${environment} API key is not configured on the server.`),{status:503,code:"COMPLYANCE_API_KEY_MISSING"});
  const headers={
    Accept:"application/json",
    ...(connect?{"X-API-Key":key}:{Authorization:"Bearer "+key}),
    ...(body?{"Content-Type":"application/json","new-api":"true"}:{})
  };
  const response=await fetch(BASE+path,{
    method,headers,body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(25000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=data.message||data.error||data.code||`Complyance returned HTTP ${response.status}`;
    throw Object.assign(new Error(String(detail)),{status:response.status,code:data.code||"COMPLYANCE_API_ERROR",provider:data});
  }
  return data;
}

export function sourceIdentity(businessId){
  const compact=String(businessId||"").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
  return {sourceName:"perficient-zone-"+compact.slice(0,16),sourceVersion:"1.0.0"};
}

export function emirateCode(value){
  const v=String(value||"").trim().toLowerCase();
  const map={
    "abu dhabi":"AUH","abudhabi":"AUH","auh":"AUH",
    "dubai":"DXB","dxb":"DXB",
    "sharjah":"SHJ","shj":"SHJ",
    "umm al quwain":"UAQ","uaq":"UAQ",
    "fujairah":"FUJ","fuj":"FUJ",
    "ajman":"AJM","ajm":"AJM",
    "ras al khaimah":"RAK","rak":"RAK"
  };
  return map[v]||"";
}

export function rawParticipantId(value){
  const v=String(value||"").trim();
  if(v.includes(":")) return v.slice(v.indexOf(":")+1).trim();
  return v;
}

export function paymentMeansCode(value){
  const map={
    "1":"INSTRUMENT_NOT_DEFINED",
    "10":"IN_CASH",
    "20":"CHEQUE",
    "21":"BANKERS_DRAFT",
    "30":"CREDIT_TRANSFER",
    "49":"DIRECT_DEBIT",
    "54":"CREDIT_CARD",
    "55":"DEBIT_CARD",
    "68":"ONLINE_PAYMENT_SERVICE"
  };
  return map[String(value||"")]||"";
}

export function unitCode(value){
  const raw=String(value||"").trim().toUpperCase();
  const map={
    "PCS":"PCE","PC":"PCE","PIECE":"PCE","PIECES":"PCE","EA":"C62","EACH":"C62",
    "HOUR":"HUR","HOURS":"HUR","HR":"HUR","HRS":"HUR",
    "DAY":"DAY","DAYS":"DAY","MONTH":"MON","MONTHS":"MON",
    "YEAR":"ANN","YEARS":"ANN","KG":"KGM","KGS":"KGM","KILOGRAM":"KGM",
    "G":"GRM","GRAM":"GRM","L":"LTR","LITRE":"LTR","LITER":"LTR",
    "M":"MTR","METRE":"MTR","METER":"MTR","SET":"SET","BOX":"BOX",
    "SERVICE":"C62","UNIT":"C62","UNITS":"C62"
  };
  if(!raw) return "";
  return map[raw]||raw;
}

const present=v=>String(v??"").trim().length>0;
const validTin=v=>/^1\d{9}$/.test(String(v||"").replace(/\s+/g,""));
const validTrn=v=>/^1\d{12}03$/.test(String(v||"").replace(/\s+/g,""));

export function buildUaeInvoice({invoice,business,customer,items,connection}){
  const errors=[];
  const add=(ok,message)=>{if(!ok)errors.push(message)};
  const buyerType=customer?.einvoice_buyer_type||(customer?.customer_type==="individual"?"consumer":"business");
  add(invoice?.einvoice_document_type==="tax_invoice","Only UAE PINT AE tax invoices are supported by this first connector release.");
  add(["business","government"].includes(buyerType),"This first connector release supports UAE B2B and B2G buyers. Consumer and overseas buyer handling requires a separate mapping.");
  add(validTin(business?.tin_number),"Seller FTA TIN must be 10 digits and start with 1.");
  add(!!business?.vat_registered&&validTrn(business?.trn),"For the initial tax-invoice connector, enter the seller's valid 15-digit VAT TRN.");
  add(present(business?.trade_license_number),"Seller trade licence number is required.");
  add(present(business?.trade_license_authority),"Seller trade licence issuing authority is required.");
  add(present(business?.address)&&present(business?.city)&&!!emirateCode(business?.emirate),"Seller address, city and UAE emirate are required.");
  add(!!customer,"Select a customer.");
  add(present(customer?.name||customer?.company||customer?.legal_name),"Buyer legal name is required.");
  add(validTin(customer?.tin_number||rawParticipantId(customer?.electronic_address)),"Buyer UAE TIN / Peppol participant ID must be 10 digits and start with 1.");
  add(present(customer?.buyer_id_value),"Buyer legal registration identifier is required.");
  add(present(customer?.buyer_registration_type),"Buyer legal registration type is required.");
  add(present(customer?.buyer_id_authority),"Buyer legal registration issuing authority is required.");
  add(present(customer?.address_line1)&&present(customer?.city)&&!!emirateCode(customer?.emirate),"Buyer address, city and UAE emirate are required.");
  add(String(customer?.country||"United Arab Emirates").toLowerCase()==="united arab emirates","Only UAE buyer addresses are enabled in this initial connector.");
  add(Array.isArray(items)&&items.length>0,"At least one invoice line is required.");
  add(!Number(invoice?.discount_amount||0),"Document-level discounts are not yet mapped to PINT AE; remove the invoice discount before submission.");
  add(!(items||[]).some(x=>Number(x.discount_percent||0)>0),"Line-level discounts are not yet mapped to PINT AE; remove line discounts before submission.");
  add(!(items||[]).some(x=>!["standard"].includes(x.tax_category||"standard")),"This first connector release supports standard-rated VAT lines only. Exempt, zero-rated and out-of-scope lines need their PINT AE reason mapping first.");
  add(!(items||[]).some(x=>!unitCode(x.unit)),"Every invoice line needs a unit code (for example PCE, HUR, DAY or KGM).");
  add(!(items||[]).some(x=>Number(x.quantity)<=0),"Every invoice line must have a positive quantity.");
  const flags=String(invoice?.einvoice_transaction_type_code||"00000000");
  add(/^[01]{8}$/.test(flags),"Transaction type must contain exactly eight 0/1 flags.");
  const flagLabels=["Free Trade Zone","Deemed Supply","Margin Scheme","Summary Invoice","Continuous Supply","Disclosed Agent Billing","Supply through e-commerce","Exports"];
  const unsupported=[2,3,6,7].filter(i=>flags[i]==="1");
  if(unsupported.length) errors.push("These transaction types need additional fields not yet available in this release: "+unsupported.map(i=>flagLabels[i]).join(", ")+".");
  if(flags[0]==="1") add(present(business?.einvoice_beneficiary_id),"Free Trade Zone transaction requires the beneficiary ID in Business Settings.");
  if(flags[5]==="1") add(present(business?.einvoice_principal_trn),"Disclosed Agent Billing requires the principal's TRN in Business Settings.");
  const deemed=flags[1]==="1";
  if(!deemed){
    add(present(invoice?.due_date),"Payment due date is required for a tax invoice unless it is a deemed supply.");
    add(!!paymentMeansCode(invoice?.einvoice_payment_means_code),"Select a valid PINT AE payment means code.");
  }
  const currency=String(invoice?.currency||"AED").toUpperCase();
  const fx=Number(invoice?.exchange_rate_to_aed||1);
  if(currency!=="AED") add(Number.isFinite(fx)&&fx>0,"A valid exchange rate to AED is required for a foreign-currency invoice.");
  if(errors.length) return {errors,payload:null,modifiers:[]};

  const modifiers=[];
  const names=["free_trade_zone","deemed_supply","margin_scheme","summary","continuous_supply","disclosed_agent","e_commerce","export"];
  flags.split("").forEach((bit,i)=>{if(bit==="1")modifiers.push(names[i])});
  const sellerPeppol=rawParticipantId(connection?.participant_id||business.tin_number);
  const buyerPeppol=rawParticipantId(customer.tin_number||customer.electronic_address);
  const sellerTaxIds=[{type:"VAT",value:String(business.trn).replace(/\s+/g,"")}];
  const buyerTaxIds=present(customer.trn)?[{type:"VAT",value:String(customer.trn).replace(/\s+/g,"")}]:[];
  const lineItems=items.map((it,i)=>{
    const qty=Number(it.quantity);
    const rate=Number(it.rate||0);
    const taxRate=Number(it.tax_rate||0);
    const net=Number(it.line_subtotal||0);
    const unitNet=qty>0?net/qty:0;
    const grossUnit=invoice.vat_mode==="inclusive"&&taxRate>0?rate/(1+taxRate/100):rate;
    return {
      id:String(i+1),
      name:String(it.item_name||"").trim(),
      ...(present(it.description)?{description:String(it.description)}:{}),
      quantity:qty,
      unitCode:unitCode(it.unit),
      taxAmount:Number(it.line_tax||0),
      lineTaxableValue:net,
      taxCategory:"S",
      taxRate,
      price:{amount:unitNet,grossPrice:grossUnit}
    };
  });
  const due=Math.max(0,Number(invoice.total||0)-Number(invoice.amount_paid||0));
  const payload={
    header:{
      documentType:{base:"tax_invoice"},
      documentNumber:String(invoice.invoice_number),
      issueDate:String(invoice.invoice_date).slice(0,10),
      currency,
      ...(!deemed?{dueDate:String(invoice.due_date).slice(0,10)}:{}),
      ...(currency!=="AED"?{
        taxCurrency:"AED",
        exchangeRate:{rate:fx,sourceCurrency:currency,targetCurrency:"AED"}
      }:{})
    },
    parties:{
      seller:{
        name:String(business.legal_name),
        address:{country:"AE",city:String(business.city),addressLine1:String(business.address),stateOrProvince:emirateCode(business.emirate)},
        taxIds:sellerTaxIds,
        registrationNumbers:[{type:business.legal_registration_id_type||"TL",value:String(business.trade_license_number)}],
        peppolId:sellerPeppol
      },
      buyer:{
        name:String(customer.legal_name||customer.company||customer.name),
        address:{country:"AE",city:String(customer.city),addressLine1:String(customer.address_line1),stateOrProvince:emirateCode(customer.emirate)},
        ...(buyerTaxIds.length?{taxIds:buyerTaxIds}:{}),
        registrationNumbers:[{type:customer.buyer_registration_type||"TL",value:String(customer.buyer_id_value)}],
        peppolId:buyerPeppol
      }
    },
    lineItems,
    ...(!deemed?{payment:{paymentMeans:[{
      paymentMeansCode:paymentMeansCode(invoice.einvoice_payment_means_code),
      ...(String(invoice.einvoice_payment_means_code)==="30"&&present(business.iban)?{creditTransferInfo:{payeeFinancialAccountId:String(business.iban).replace(/\s+/g,"")}}:{})
    }]}}:{}),
    totals:{
      totalAmountExcludingTax:Number(invoice.taxable_amount||0),
      totalAmountIncludingTax:Number(invoice.total||0),
      amountDue:due,
      totalLineTaxableAmount:lineItems.reduce((s,x)=>s+x.lineTaxableValue,0),
      totalTaxAmount:Number(invoice.vat_amount||0),
      ...(Number(invoice.amount_paid||0)>0?{prepaidAmount:Number(invoice.amount_paid)}:{})
    },
    extensions:{
      peppol_seller_peppolIdScheme:"0235",
      peppol_buyer_peppolIdScheme:customer.electronic_address_scheme||"0235",
      ae_seller_authorityName:String(business.trade_license_authority),
      ae_buyer_authorityName:String(customer.buyer_id_authority),
      ...(flags[0]==="1"?{ae_beneficiaryId:String(business.einvoice_beneficiary_id)}:{}),
      ...(flags[5]==="1"?{ae_principalTRN:String(business.einvoice_principal_trn)}:{}),
      ...(currency!=="AED"?{ae_totalAmountIncludingTaxInAED:Number((Number(invoice.total||0)*fx).toFixed(2))}:{})
    }
  };
  return {errors:[],payload,modifiers};
}

export function makeUnifyEnvelope({environment="sandbox",source,payload,modifiers=[],purpose="validate"}){
  return {
    country:"AE",
    environment,
    purpose,
    source,
    documentType:{base:"tax_invoice",modifiers},
    payload
  };
}

export function payloadHash(value){
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
