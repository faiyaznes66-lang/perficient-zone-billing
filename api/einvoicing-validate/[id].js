import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

const present=v=>String(v??"").trim().length>0;
const isTin=v=>/^\d{10}$/.test(String(v||"").replace(/\s+/g,""));

export default async function(req,res){
  const {rows:r}=await db.query(
    `SELECT i.*,
            b.legal_name AS seller_name,b.trn AS seller_trn,b.tin_number AS seller_tin,
            b.vat_registered AS seller_vat_registered,b.address AS seller_address,
            b.city AS seller_city,b.emirate AS seller_emirate,
            b.trade_license_number AS seller_trade_license,
            b.legal_registration_id_type AS seller_registration_type,
            c.id AS buyer_id,c.name AS buyer_name,c.company AS buyer_company,
            c.legal_name AS buyer_legal_name,c.trn AS buyer_trn,c.tin_number AS buyer_tin,
            c.electronic_address AS buyer_electronic_address,
            c.electronic_address_scheme AS buyer_electronic_scheme,
            c.address_line1 AS buyer_address_line1,c.city AS buyer_city,
            c.emirate AS buyer_emirate,c.country AS buyer_country,
            c.customer_type AS buyer_customer_type,c.einvoice_buyer_type AS customer_einvoice_buyer_type
     FROM invoices i
     JOIN businesses b ON b.id=i.business_id
     LEFT JOIN customers c ON c.id=i.customer_id AND c.business_id=b.id
     WHERE i.id=$1 AND b.owner_user_id=$2 LIMIT 1`,
    [req.params.id,req.user.id]
  );
  if(!r[0]) return res.status(404).json({error:"Invoice not found"});
  const x=r[0];
  const {rows:items}=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position",[x.id]);
  const buyerType=x.customer_einvoice_buyer_type||(x.buyer_customer_type==="individual"?"consumer":x.einvoice_buyer_type||"business");
  const buyerIsUAE=["United Arab Emirates","UAE","AE"].includes(String(x.buyer_country||""));
  if(buyerType==="consumer"){
    return res.json({
      applicable:false,can_submit:false,buyer_type:buyerType,
      errors:[],warnings:["B2C supplies to consumers are outside the UAE e-invoicing transaction scope. The business may still need an ASP to receive in-scope B2B invoices."],
      message:"This invoice is classified as B2C and is not prepared for e-invoicing."
    });
  }

  const errors=[],warnings=[];
  const requireField=(ok,label)=>{if(!ok)errors.push(label)};
  requireField(present(x.invoice_number),"Invoice number");
  requireField(present(x.invoice_date),"Invoice date");
  requireField(present(x.due_date),"Payment due date (for due-on-receipt, use the invoice date)");
  requireField(present(x.currency),"Invoice currency");
  requireField(/^[01]{8}$/.test(String(x.einvoice_transaction_type_code||"")),"8-position invoice transaction type code");
  requireField(present(x.einvoice_business_process_type),"Business process type (ASP/PINT AE mapping)");
  requireField(present(x.einvoice_payment_means_code),"Payment means type code");
  requireField(present(x.seller_name),"Seller legal name");
  requireField(isTin(x.seller_tin),"Seller 10-digit TIN");
  requireField(present(x.seller_trade_license),"Seller legal registration identifier (trade licence)");
  requireField(present(x.seller_registration_type),"Seller legal registration identifier type");
  requireField(present(x.seller_address),"Seller address line 1");
  requireField(present(x.seller_city),"Seller city");
  requireField(present(x.seller_emirate),"Seller emirate/country subdivision");
  if(x.seller_vat_registered) requireField(present(x.seller_trn),"Seller VAT TRN");
  requireField(present(x.buyer_name||x.buyer_company||x.buyer_legal_name),"Buyer legal name");
  if(buyerIsUAE) requireField(isTin(x.buyer_tin),"Buyer 10-digit TIN");
  if(buyerIsUAE) requireField(present(x.buyer_electronic_address),"Buyer Peppol electronic address/endpoint");
  if(buyerIsUAE) requireField(present(x.buyer_electronic_scheme),"Buyer electronic address scheme");
  requireField(present(x.buyer_address_line1),"Buyer address line 1");
  requireField(present(x.buyer_city),"Buyer city");
  requireField(present(x.buyer_emirate),"Buyer emirate/country subdivision");
  requireField(present(x.buyer_country),"Buyer country");
  requireField(items.length>0,"At least one invoice line");
  items.forEach((it,i)=>{
    const n=i+1;
    requireField(present(it.item_name),`Line ${n}: item name`);
    requireField(Number(it.quantity)>0,`Line ${n}: positive quantity`);
    requireField(present(it.unit),`Line ${n}: unit of measure`);
    requireField(present(it.tax_category),`Line ${n}: tax category`);
  });
  if(x.seller_vat_registered&&x.currency!=="AED") requireField(Number(x.exchange_rate_to_aed)>0,"AED exchange rate for foreign-currency VAT reporting");
  if(!buyerIsUAE) warnings.push("For an overseas buyer, the ASP must apply the prescribed foreign-buyer TIN/endpoint treatment. Peppol delivery may be unavailable; the seller still needs the required UAE reporting through the ASP.");
  if(buyerIsUAE&&!present(x.buyer_electronic_address)) warnings.push("The buyer's electronic endpoint is missing; ask the ASP whether directory lookup is available using the buyer TIN.");
  if(x.status==="draft") warnings.push("This is still a draft invoice. It must be issued in your normal accounting workflow before transmission.");
  warnings.push("This is a local data-completeness check only. The selected ASP must perform the official PINT AE/schema validation and exchange/reporting steps.");
  return res.json({
    applicable:true,
    can_submit:errors.length===0,
    buyer_type:buyerType,
    errors,
    warnings,
    line_count:items.length,
    message:errors.length===0?"Local mandatory-field checks passed. ASP validation and transmission are still required.":"Complete the missing fields before submitting this invoice to an ASP."
  });
}
