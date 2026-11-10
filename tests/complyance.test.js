import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUaeInvoice,makeUnifyEnvelope,emirateCode,paymentMeansCode,
  rawParticipantId,unitCode
} from "../lib/complyance.js";

const business={
  legal_name:"Acme Trading LLC",tin_number:"1234567890",vat_registered:true,
  trn:"100012345600003",trade_license_number:"CN-1234567",
  trade_license_authority:"Dubai Department of Economy and Tourism",
  legal_registration_id_type:"TL",address:"12 Harbour Road",city:"Dubai",
  emirate:"Dubai",iban:"AE070331234567890123456"
};
const customer={
  name:"Gulf Retail FZ-LLC",company:"Gulf Retail FZ-LLC",
  trn:"100098765400003",tin_number:"1000987654",
  electronic_address_scheme:"0235",buyer_id_value:"CN-7654321",
  buyer_id_authority:"Dubai Department of Economy and Tourism",
  buyer_registration_type:"TL",address_line1:"48 Market Street",
  city:"Dubai",emirate:"Dubai",country:"United Arab Emirates",
  einvoice_buyer_type:"business"
};
const invoice={
  einvoice_document_type:"tax_invoice",invoice_format:"full",
  einvoice_transaction_type_code:"00000000",einvoice_payment_means_code:"30",
  invoice_number:"INV-2026-0142",invoice_date:"2026-11-10",due_date:"2026-12-10",
  currency:"AED",vat_mode:"exclusive",exchange_rate_to_aed:1,
  amount_paid:0,total:2100,taxable_amount:2000,vat_amount:100,
  discount_amount:0,status:"sent"
};
const items=[{
  item_name:"Cloud subscription",description:"Business plan",quantity:20,
  unit:"PCE",rate:100,discount_percent:0,tax_category:"standard",tax_rate:5,
  line_subtotal:2000,line_tax:100,line_total:2100
}];
const connection={participant_id:"0235:1234567890",source_name:"perficient-zone-test",source_version:"1.0.0"};

test("maps a standard UAE B2B tax invoice to GETS/PINT AE",()=>{
  const built=buildUaeInvoice({invoice,business,customer,items,connection});
  assert.deepEqual(built.errors,[]);
  assert.equal(built.payload.header.documentNumber,"INV-2026-0142");
  assert.equal(built.payload.parties.seller.peppolId,"1234567890");
  assert.equal(built.payload.parties.buyer.peppolId,"1000987654");
  assert.equal(built.payload.lineItems[0].taxCategory,"S");
  assert.equal(built.payload.lineItems[0].unitCode,"PCE");
  assert.equal(built.payload.payment.paymentMeans[0].paymentMeansCode,"CREDIT_TRANSFER");
  assert.equal(built.payload.totals.totalAmountIncludingTax,2100);
});

test("builds a validate-only Unify envelope",()=>{
  const built=buildUaeInvoice({invoice,business,customer,items,connection});
  const envelope=makeUnifyEnvelope({
    environment:"sandbox",source:"perficient-zone-test:1.0.0",
    payload:built.payload,modifiers:built.modifiers,purpose:"validate"
  });
  assert.equal(envelope.country,"AE");
  assert.equal(envelope.environment,"sandbox");
  assert.equal(envelope.purpose,"validate");
  assert.equal(envelope.documentType.base,"tax_invoice");
});

test("blocks unsupported discounts instead of sending inaccurate totals",()=>{
  const result=buildUaeInvoice({
    invoice:{...invoice,discount_amount:10},business,customer,items,connection
  });
  assert.ok(result.errors.some(x=>x.includes("Document-level discounts")));
});

test("maps common UAE emirates, units, payment codes and Peppol IDs",()=>{
  assert.equal(emirateCode("Dubai"),"DXB");
  assert.equal(emirateCode("Sharjah"),"SHJ");
  assert.equal(unitCode("hours"),"HUR");
  assert.equal(unitCode("kg"),"KGM");
  assert.equal(paymentMeansCode("30"),"CREDIT_TRANSFER");
  assert.equal(rawParticipantId("0235:1234567890"),"1234567890");
});
